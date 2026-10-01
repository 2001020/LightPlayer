//! One-shot position from CoreLocation (Wi-Fi / GPS based, like Maps).
//!
//! CLLocationManager needs a run loop, so it lives on the main thread; the
//! delegate hands the first fix (or the reason there is none) back through a
//! oneshot channel. The first request shows the system permission prompt,
//! whose text comes from NSLocationUsageDescription in Info.plist.

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_core_location::{kCLLocationAccuracyKilometer, CLAuthorizationStatus, CLLocation, CLLocationManager, CLLocationManagerDelegate};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol};
use std::cell::{Cell, RefCell};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::oneshot;

type Fix = Result<(f64, f64), String>;

struct Ivars {
    reply: RefCell<Option<oneshot::Sender<Fix>>>,
    requested: Cell<bool>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements and LocDelegate does not implement Drop.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    struct LocDelegate;

    unsafe impl NSObjectProtocol for LocDelegate {}

    unsafe impl CLLocationManagerDelegate for LocDelegate {
        #[unsafe(method(locationManagerDidChangeAuthorization:))]
        fn did_change_authorization(&self, manager: &CLLocationManager) {
            self.check(manager);
        }

        #[unsafe(method(locationManager:didUpdateLocations:))]
        fn did_update_locations(&self, _manager: &CLLocationManager, locations: &NSArray<CLLocation>) {
            if let Some(loc) = locations.lastObject() {
                let c = unsafe { loc.coordinate() };
                self.finish(Ok((c.latitude, c.longitude)));
            }
        }

        #[unsafe(method(locationManager:didFailWithError:))]
        fn did_fail(&self, _manager: &CLLocationManager, error: &NSError) {
            // kCLErrorLocationUnknown: temporary, CoreLocation keeps trying.
            match error.code() {
                0 => {}
                1 => self.finish(Err("未获得定位权限".into())),
                _ => self.finish(Err(format!("定位失败：{}", error.localizedDescription()))),
            }
        }
    }
);

impl LocDelegate {
    fn new(mtm: MainThreadMarker, reply: oneshot::Sender<Fix>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars { reply: RefCell::new(Some(reply)), requested: Cell::new(false) });
        unsafe { msg_send![super(this), init] }
    }

    fn finish(&self, fix: Fix) {
        if let Some(tx) = self.ivars().reply.borrow_mut().take() {
            let _ = tx.send(fix);
        }
    }

    fn check(&self, manager: &CLLocationManager) {
        let status = unsafe { manager.authorizationStatus() };
        if status == CLAuthorizationStatus::NotDetermined {
            unsafe { manager.requestWhenInUseAuthorization() };
        } else if status == CLAuthorizationStatus::Denied || status == CLAuthorizationStatus::Restricted {
            self.finish(Err("未获得定位权限".into()));
        } else if !self.ivars().requested.replace(true) {
            unsafe { manager.requestLocation() };
        }
    }
}

thread_local! {
    /// The request in flight (main thread only), kept alive until it settles.
    static ACTIVE: RefCell<Option<(u64, Retained<CLLocationManager>, Retained<LocDelegate>)>> = const { RefCell::new(None) };
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn start(id: u64, reply: oneshot::Sender<Fix>) {
    let Some(mtm) = MainThreadMarker::new() else {
        let _ = reply.send(Err("定位服务不可用".into()));
        return;
    };
    let manager = unsafe { CLLocationManager::new() };
    let delegate = LocDelegate::new(mtm, reply);
    unsafe {
        manager.setDesiredAccuracy(kCLLocationAccuracyKilometer);
        manager.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    }
    delegate.check(&manager);
    ACTIVE.with(|a| *a.borrow_mut() = Some((id, manager, delegate)));
}

fn stop(id: u64) {
    ACTIVE.with(|a| {
        let mut a = a.borrow_mut();
        if a.as_ref().is_some_and(|(cur, _, _)| *cur == id) {
            if let Some((_, manager, _)) = a.take() {
                unsafe {
                    manager.stopUpdatingLocation();
                    manager.setDelegate(None);
                }
            }
        }
    });
}

pub async fn locate(app: &AppHandle, timeout: Duration) -> Fix {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel();
    app.run_on_main_thread(move || start(id, tx)).map_err(|e| e.to_string())?;
    let res = tokio::time::timeout(timeout, rx).await;
    let _ = app.run_on_main_thread(move || stop(id));
    match res {
        Ok(Ok(fix)) => fix,
        Ok(Err(_)) => Err("定位服务没有返回结果".into()),
        Err(_) => Err("定位超时".into()),
    }
}

//! Two services talking over 127.0.0.1, with fast timeouts.

use super::protocol::*;
use super::*;
use std::time::Duration;

struct TestHost {
    dir: PathBuf,
    events: Mutex<Vec<(String, Value)>>,
}

impl LanHost for TestHost {
    fn emit(&self, event: &str, payload: Value) {
        self.events.lock().unwrap().push((event.into(), payload));
    }
    fn receive_dir(&self) -> Option<PathBuf> {
        Some(self.dir.clone())
    }
    fn attention(&self) {}
}

impl TestHost {
    fn events(&self, name: &str) -> Vec<Value> {
        self.events.lock().unwrap().iter().filter(|(e, _)| e == name).map(|(_, v)| v.clone()).collect()
    }
}

fn cfg() -> LanConfig {
    LanConfig {
        bind_ip: IpAddr::V4(Ipv4Addr::LOCALHOST),
        tcp_port: 0,
        udp_port: 0,
        query_port: 0,
        discovery_targets: Vec::new(),
        offer_timeout: Duration::from_secs(3),
        poll_idle: Duration::from_millis(800),
        poll_wait: Duration::from_millis(200),
        upload_start: Duration::from_secs(3),
        chunk_idle: Duration::from_millis(400),
        sync_idle: Duration::from_millis(400),
        lost_end: Duration::from_secs(3),
        heartbeat: Duration::from_millis(100),
        sync_timeout: Duration::from_millis(500),
        tick: Duration::from_millis(30),
        query_every: Duration::from_millis(150),
        device_ttl: Duration::from_millis(500),
    }
}

struct Node {
    svc: LanService,
    host: Arc<TestHost>,
    _dir: tempfile::TempDir,
}

fn node(cfg: LanConfig) -> Node {
    let dir = tempfile::tempdir().unwrap();
    let host = Arc::new(TestHost { dir: dir.path().join("LightPlayer"), events: Mutex::new(Vec::new()) });
    let svc = LanService::new(host.clone(), cfg, "1.6.7");
    Node { svc, host, _dir: dir }
}

async fn receiver() -> Node {
    let b = node(cfg());
    let st = b.svc.configure(true, "Receiver").await;
    assert!(st.running);
    b
}

fn addr(n: &Node) -> String {
    format!("127.0.0.1:{}", n.svc.port().unwrap())
}

fn target(n: &Node) -> Target {
    Target { addr: addr(n), id: String::new(), name: "B".into(), platform: "linux".into() }
}

/// Waits until `f` finds something in the host's events.
async fn until<T>(host: &TestHost, what: &str, mut f: impl FnMut(&TestHost) -> Option<T>) -> T {
    let end = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(v) = f(host) {
            return v;
        }
        assert!(Instant::now() < end, "timed out waiting for {what}");
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

fn session(host: &TestHost, id: &str, stage: &str) -> Option<Value> {
    host.events(events::SESSION).into_iter().rev().find(|v| v["id"] == id && v["stage"] == stage)
}

async fn ended(host: &TestHost, id: &str) -> String {
    let v = until(host, "end", |h| session(h, id, "ended")).await;
    v["reason"].as_str().unwrap_or("").to_string()
}

async fn offered(b: &Node) -> String {
    let v = until(&b.host, "offer", |h| h.events(events::OFFER).last().cloned()).await;
    v["id"].as_str().unwrap().to_string()
}

fn media_file(dir: &Path, name: &str, len: usize) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let p = dir.join(name);
    let data: Vec<u8> = (0..len).map(|i| (i * 31 % 251) as u8).collect();
    std::fs::write(&p, data).unwrap();
    p
}

fn partials(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.extension().and_then(|x| x.to_str()) == Some(PARTIAL_EXT)).collect())
        .unwrap_or_default()
}

async fn no_partials(dir: &Path) {
    let end = Instant::now() + Duration::from_secs(3);
    while !partials(dir).is_empty() {
        assert!(Instant::now() < end, "partial file left behind: {:?}", partials(dir));
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

fn http() -> reqwest::Client {
    reqwest::Client::builder().no_proxy().build().unwrap()
}

fn raw_offer_body(session: &str, name: &str, size: u64) -> String {
    serde_json::json!({
        "session": session, "proto": PROTO,
        "from": { "id": "raw", "name": "Raw", "platform": "linux" },
        "file": { "name": name, "size": size, "kind": "video" },
    })
    .to_string()
}

async fn raw_offer(b: &Node, session: &str, name: &str, size: u64) -> reqwest::Response {
    http()
        .post(format!("http://{}/lan/v1/offer", addr(b)))
        .header(HEADER, "1")
        .header("content-type", "application/json")
        .body(raw_offer_body(session, name, size))
        .send()
        .await
        .unwrap()
}

/// Offers, accepts and returns the session token.
async fn raw_accepted(b: &Node, session: &str, name: &str, size: u64, follow: bool) -> String {
    assert_eq!(raw_offer(b, session, name, size).await.status(), 202);
    assert!(b.svc.answer(session, true, follow));
    let r = http().get(format!("http://{}/lan/v1/offer/{session}", addr(b))).header(HEADER, "1").send().await.unwrap();
    let st: OfferState = serde_json::from_slice(&r.bytes().await.unwrap()).unwrap();
    assert_eq!(st.state, "accepted");
    st.token.unwrap()
}

/// A request body that sends `first` and then whatever arrives on the channel.
fn slow_body(first: Vec<u8>) -> (reqwest::Body, tokio::sync::mpsc::Sender<Vec<u8>>) {
    let (tx, rx) = tokio::sync::mpsc::channel::<Vec<u8>>(4);
    let head = futures_util::stream::once(async move { Ok::<_, std::io::Error>(first) });
    let rest = futures_util::stream::unfold(rx, |mut rx| async move { rx.recv().await.map(|c| (Ok(c), rx)) });
    (reqwest::Body::wrap_stream(futures_util::StreamExt::chain(head, rest)), tx)
}

#[tokio::test(flavor = "multi_thread")]
async fn sends_a_file_and_follows_playback() {
    let b = receiver().await;
    let a = node(cfg());
    let src = tempfile::tempdir().unwrap();
    let file = media_file(src.path(), "Movie.mp4", 5 * 1024 * 1024 + 123);
    let path = file.to_string_lossy().into_owned();
    a.svc.publish(path.clone(), 12.0, true, 1.0, None);

    let id = a.svc.send(target(&b), &file).unwrap();
    let bid = offered(&b).await;
    assert_eq!(bid, id);
    let offer = b.host.events(events::OFFER).pop().unwrap();
    assert_eq!(offer["file"]["name"], "Movie.mp4");
    assert_eq!(offer["peer"]["name"], node_name(&a));
    until(&a.host, "waiting", |h| session(h, &id, "waiting")).await;
    assert!(b.svc.answer(&id, true, true));

    let got = until(&b.host, "received", |h| session(h, &id, "received")).await;
    let saved = PathBuf::from(got["path"].as_str().unwrap());
    assert_eq!(saved, b.host.dir.join("Movie.mp4"));
    assert_eq!(std::fs::read(&saved).unwrap(), std::fs::read(&file).unwrap());
    assert!(partials(&b.host.dir).is_empty());

    // Both sides report steadily growing progress that ends at the full size.
    for (host, role) in [(&a.host, "send"), (&b.host, "receive")] {
        let p: Vec<u64> = host.events(events::PROGRESS).iter().filter(|v| v["role"] == role).map(|v| v["bytes"].as_u64().unwrap()).collect();
        assert!(!p.is_empty(), "{role} progress");
        assert!(p.windows(2).all(|w| w[0] <= w[1]), "{role} progress goes back: {p:?}");
        assert_eq!(*p.last().unwrap(), std::fs::metadata(&file).unwrap().len());
    }

    // Playback state arrives, extrapolated while playing.
    until(&a.host, "syncing", |h| session(h, &id, "syncing")).await;
    let s = until(&b.host, "sync", |h| h.events(events::SYNC).last().cloned()).await;
    assert_eq!(s["id"], id.as_str());
    assert!(s["playing"].as_bool().unwrap());
    assert!(s["pos"].as_f64().unwrap() >= 12.0);
    a.svc.publish(path.clone(), 30.0, false, 1.5, None);
    until(&b.host, "paused state", |h| {
        h.events(events::SYNC).into_iter().find(|v| v["playing"] == false && v["pos"].as_f64() == Some(30.0) && v["rate"].as_f64() == Some(1.5))
    })
    .await;

    // Following off on B shows up on A.
    b.svc.follow(&id, false);
    until(&a.host, "not following", |h| h.events(events::SESSION).into_iter().find(|v| v["id"] == id.as_str() && v["following"] == false)).await;

    // A plays something else: the share ends on both sides.
    a.svc.publish("/elsewhere.mp3".into(), 0.0, true, 1.0, None);
    assert_eq!(ended(&a.host, &id).await, reason::SWITCHED);
    assert_eq!(ended(&b.host, &id).await, reason::SWITCHED);
}

fn node_name(n: &Node) -> String {
    n.svc.status().name
}

#[tokio::test(flavor = "multi_thread")]
async fn declined_and_unanswered_offers() {
    let b = receiver().await;
    let a = node(cfg());
    let src = tempfile::tempdir().unwrap();
    let file = media_file(src.path(), "a.flac", 1000);

    let id = a.svc.send(target(&b), &file).unwrap();
    offered(&b).await;
    assert!(b.svc.answer(&id, false, false));
    assert_eq!(ended(&a.host, &id).await, reason::DECLINED);
    assert!(!b.svc.answer(&id, true, true), "already answered");

    let mut c = cfg();
    c.offer_timeout = Duration::from_millis(300);
    let b2 = node(c);
    b2.svc.configure(true, "").await;
    let id = a.svc.send(target(&b2), &file).unwrap();
    assert_eq!(ended(&a.host, &id).await, reason::TIMEOUT);
    assert_eq!(ended(&b2.host, &id).await, reason::TIMEOUT);
}

#[tokio::test(flavor = "multi_thread")]
async fn sender_gives_up_while_waiting() {
    let b = receiver().await;
    let a = node(cfg());
    let src = tempfile::tempdir().unwrap();
    let file = media_file(src.path(), "a.mp4", 1000);
    let id = a.svc.send(target(&b), &file).unwrap();
    until(&a.host, "waiting", |h| session(h, &id, "waiting")).await;
    a.svc.cancel(&id);
    assert_eq!(ended(&a.host, &id).await, reason::CANCELED);
    assert_eq!(ended(&b.host, &id).await, reason::CANCELED);

    // A sender that vanishes (stops polling) has its offer withdrawn.
    assert_eq!(raw_offer(&b, "gone1", "x.mp4", 10).await.status(), 202);
    assert_eq!(ended(&b.host, "gone1").await, reason::CANCELED);
}

#[tokio::test(flavor = "multi_thread")]
async fn refuses_bad_offers() {
    let b = receiver().await;
    let r = raw_offer(&b, "big1", "big.mp4", MAX_SIZE + 1).await;
    assert_eq!(r.status(), 413);
    assert_eq!(r.text().await.unwrap(), r#"{"reason":"too_large"}"#);
    assert_eq!(raw_offer(&b, "exe1", "tool.exe", 10).await.status(), 400);
    // One pending offer per address.
    assert_eq!(raw_offer(&b, "one1", "a.mp4", 10).await.status(), 202);
    assert_eq!(raw_offer(&b, "two1", "b.mp4", 10).await.status(), 429);
    // Web pages cannot talk to the service.
    let url = format!("http://{}/lan/v1/offer", addr(&b));
    let r = http().post(&url).header("content-type", "text/plain").body(raw_offer_body("web1", "a.mp4", 10)).send().await.unwrap();
    assert_eq!(r.status(), 403);
    let r = http().post(&url).header(HEADER, "1").header("origin", "http://evil.example").body(raw_offer_body("web2", "a.mp4", 10)).send().await.unwrap();
    assert_eq!(r.status(), 403);
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_rules() {
    let b = receiver().await;
    let base = format!("http://{}/lan/v1", addr(&b));

    // Wrong token.
    let token = raw_accepted(&b, "tok1", "t.mp4", 4, true).await;
    let r = http().put(format!("{base}/upload/tok1")).header(HEADER, "1").header(TOKEN_HEADER, "nope").body("abcd").send().await.unwrap();
    assert_eq!(r.status(), 403);
    // More bytes than offered.
    let r = http().put(format!("{base}/upload/tok1")).header(HEADER, "1").header(TOKEN_HEADER, &token).body(vec![1u8; 4096]).send().await.unwrap();
    assert_eq!(r.status(), 422);
    assert_eq!(ended(&b.host, "tok1").await, reason::TOO_LARGE);
    no_partials(&b.host.dir).await;

    // Fewer bytes than offered.
    let token = raw_accepted(&b, "short1", "s.mp4", 100, true).await;
    let r = http().put(format!("{base}/upload/short1")).header(HEADER, "1").header(TOKEN_HEADER, &token).body(vec![1u8; 10]).send().await.unwrap();
    assert_eq!(r.status(), 422);
    assert_eq!(ended(&b.host, "short1").await, reason::INCOMPLETE);
    no_partials(&b.host.dir).await;

    // Name taken: saved next to it. Not following: the share ends once saved.
    std::fs::create_dir_all(&b.host.dir).unwrap();
    std::fs::write(b.host.dir.join("dup.mp4"), b"old").unwrap();
    let token = raw_accepted(&b, "dup1", "../dup.mp4", 3, false).await;
    let r = http().put(format!("{base}/upload/dup1")).header(HEADER, "1").header(TOKEN_HEADER, &token).body("new").send().await.unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(std::fs::read(b.host.dir.join("dup (1).mp4")).unwrap(), b"new");
    assert_eq!(std::fs::read(b.host.dir.join("dup.mp4")).unwrap(), b"old");
    assert_eq!(ended(&b.host, "dup1").await, reason::DONE);
    // ...so sync is refused with the reason.
    let r = http()
        .post(format!("{base}/sync/dup1"))
        .header(HEADER, "1")
        .header(TOKEN_HEADER, &token)
        .header("content-type", "application/json")
        .body(r#"{"seq":1,"playing":true,"pos":1,"rate":1}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 410);
}

#[tokio::test(flavor = "multi_thread")]
async fn interrupted_uploads_leave_nothing_behind() {
    let b = receiver().await;
    let base = format!("http://{}/lan/v1", addr(&b));

    // The receiver cancels mid-way.
    let token = raw_accepted(&b, "cut1", "c.mp4", 1000, true).await;
    let (body, tx) = slow_body(vec![7u8; 100]);
    let req = http().put(format!("{base}/upload/cut1")).header(HEADER, "1").header(TOKEN_HEADER, &token).header("content-length", 1000).body(body).send();
    let task = tokio::spawn(req);
    until(&b.host, "receiving", |h| session(h, "cut1", "receiving")).await;
    // Only one upload per session.
    let r = http().put(format!("{base}/upload/cut1")).header(HEADER, "1").header(TOKEN_HEADER, &token).body(vec![1u8; 1000]).send().await.unwrap();
    assert_eq!(r.status(), 409);
    b.svc.cancel("cut1");
    assert_eq!(ended(&b.host, "cut1").await, reason::CANCELED);
    no_partials(&b.host.dir).await;
    drop(tx);
    let _ = task.await;

    // The sender stalls.
    let token = raw_accepted(&b, "stall1", "s.mp4", 1000, true).await;
    let (body, tx) = slow_body(vec![7u8; 100]);
    let req = http().put(format!("{base}/upload/stall1")).header(HEADER, "1").header(TOKEN_HEADER, &token).header("content-length", 1000).body(body).send();
    let task = tokio::spawn(req);
    assert_eq!(ended(&b.host, "stall1").await, reason::STALLED);
    no_partials(&b.host.dir).await;
    drop(tx);
    let _ = task.await;

    // The service is switched off mid-way; afterwards nobody can connect.
    let token = raw_accepted(&b, "off1", "o.mp4", 1000, true).await;
    let (body, tx) = slow_body(vec![7u8; 100]);
    let req = http().put(format!("{base}/upload/off1")).header(HEADER, "1").header(TOKEN_HEADER, &token).header("content-length", 1000).body(body).send();
    let task = tokio::spawn(req);
    until(&b.host, "receiving", |h| session(h, "off1", "receiving")).await;
    let st = b.svc.configure(false, "").await;
    assert!(!st.running);
    assert_eq!(ended(&b.host, "off1").await, reason::DISABLED);
    no_partials(&b.host.dir).await;
    drop(tx);
    let _ = task.await;
    assert!(http().get(format!("{base}/info")).header(HEADER, "1").send().await.is_err());
}

#[tokio::test(flavor = "multi_thread")]
async fn sync_messages_and_endings() {
    let b = receiver().await;
    let base = format!("http://{}/lan/v1", addr(&b));
    let token = raw_accepted(&b, "sync1", "m.mp4", 3, true).await;
    let r = http().put(format!("{base}/upload/sync1")).header(HEADER, "1").header(TOKEN_HEADER, &token).body("abc").send().await.unwrap();
    assert_eq!(r.status(), 200);
    let post = |seq: u64, pos: f64| {
        http()
            .post(format!("{base}/sync/sync1"))
            .header(HEADER, "1")
            .header(TOKEN_HEADER, token.clone())
            .header("content-type", "application/json")
            .body(format!(r#"{{"seq":{seq},"playing":false,"pos":{pos},"rate":1,"lat":5}}"#))
            .send()
    };
    assert_eq!(post(2, 20.0).await.unwrap().status(), 200);
    // An older message arriving late is ignored.
    assert_eq!(post(1, 10.0).await.unwrap().status(), 200);
    let positions: Vec<f64> = b.host.events(events::SYNC).iter().map(|v| v["pos"].as_f64().unwrap()).collect();
    assert_eq!(positions, vec![20.0]);
    // Silence: shown as a lost connection, back to syncing on the next message.
    until(&b.host, "lost", |h| session(h, "sync1", "lost")).await;
    assert_eq!(post(3, 21.0).await.unwrap().status(), 200);
    assert!(session(&b.host, "sync1", "syncing").is_some());
    // B stops following for good: the sender is told.
    b.svc.cancel("sync1");
    let r = post(4, 22.0).await.unwrap();
    assert_eq!(r.status(), 410);
    assert_eq!(r.text().await.unwrap(), r#"{"reason":"left"}"#);
}

#[tokio::test(flavor = "multi_thread")]
async fn sender_learns_when_receiver_leaves_and_says_goodbye() {
    let b = receiver().await;
    let a = node(cfg());
    let src = tempfile::tempdir().unwrap();
    let file = media_file(src.path(), "song.mp3", 2048);
    let path = file.to_string_lossy().into_owned();
    a.svc.publish(path.clone(), 0.0, true, 1.0, None);

    let id = a.svc.send(target(&b), &file).unwrap();
    offered(&b).await;
    b.svc.answer(&id, true, true);
    until(&b.host, "sync", |h| h.events(events::SYNC).last().cloned()).await;
    b.svc.cancel(&id);
    assert_eq!(ended(&a.host, &id).await, reason::LEFT);

    // Quitting tells the receiver.
    let id = a.svc.send(target(&b), &file).unwrap();
    offered_again(&b, &id).await;
    b.svc.answer(&id, true, true);
    until(&a.host, "syncing", |h| session(h, &id, "syncing")).await;
    a.svc.shutdown(Duration::from_millis(500)).await;
    assert_eq!(ended(&b.host, &id).await, reason::EXIT);
}

async fn offered_again(b: &Node, id: &str) {
    until(&b.host, "offer", |h| h.events(events::OFFER).into_iter().find(|v| v["id"] == id)).await;
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread")]
async fn sessions_are_bound_to_the_sender_address() {
    let b = receiver().await;
    assert_eq!(raw_offer(&b, "ip1", "a.mp4", 10).await.status(), 202);
    let other = reqwest::Client::builder().no_proxy().local_address(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 2))).build().unwrap();
    let r = other.get(format!("http://{}/lan/v1/offer/ip1", addr(&b))).header(HEADER, "1").send().await.unwrap();
    assert_eq!(r.status(), 403);
    let r = other.delete(format!("http://{}/lan/v1/session/ip1", addr(&b))).header(HEADER, "1").send().await.unwrap();
    assert_eq!(r.status(), 403);
}

#[tokio::test(flavor = "multi_thread")]
async fn discovery_finds_receivers() {
    let b = receiver().await;
    let udp = b.svc.udp_port().unwrap();
    let mut c = cfg();
    c.discovery_targets = vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), udp)];
    let a = node(c);

    // Junk does not upset the responder.
    let s = tokio::net::UdpSocket::bind("127.0.0.1:0").await.unwrap();
    s.send_to(b"garbage", ("127.0.0.1", udp)).await.unwrap();
    s.send_to(&[0u8; 2000], ("127.0.0.1", udp)).await.unwrap();

    a.svc.discover(true);
    let list = until(&a.host, "device", |h| {
        h.events(events::DEVICES).into_iter().rev().find(|v| v["devices"].as_array().is_some_and(|d| !d.is_empty()))
    })
    .await;
    let d = &list["devices"][0];
    assert_eq!(d["name"], "Receiver");
    assert_eq!(d["addr"], addr(&b));
    assert_eq!(d["version"], "1.6.7");

    // Switched off: it drops out of the list.
    b.svc.configure(false, "").await;
    until(&a.host, "expired", |h| {
        h.events(events::DEVICES).last().filter(|v| v["devices"].as_array().unwrap().is_empty()).cloned()
    })
    .await;
    a.svc.discover(false);
}

#[tokio::test(flavor = "multi_thread")]
async fn ignores_its_own_queries() {
    let port = std::net::UdpSocket::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let mut c = cfg();
    c.udp_port = port;
    c.discovery_targets = vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)];
    let b = node(c);
    b.svc.configure(true, "").await;
    assert_eq!(b.svc.udp_port(), Some(port));
    b.svc.discover(true);
    tokio::time::sleep(Duration::from_millis(500)).await;
    let lists = b.host.events(events::DEVICES);
    assert!(!lists.is_empty());
    assert!(lists.iter().all(|v| v["devices"].as_array().unwrap().is_empty()));
    b.svc.discover(false);
}

#[tokio::test(flavor = "multi_thread")]
async fn probes_an_address() {
    let b = receiver().await;
    let a = node(cfg());
    let d = a.svc.probe(&addr(&b)).await.unwrap();
    assert_eq!(d.name, "Receiver");
    assert!(d.manual);
    assert_eq!(a.svc.probe("127.0.0.1:1").await, Err(reason::UNREACHABLE));
    assert_eq!(a.svc.probe("nonsense").await, Err(reason::UNREACHABLE));
}

#[test]
fn send_checks_the_file() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let _g = rt.enter();
    let a = node(cfg());
    let dir = tempfile::tempdir().unwrap();
    let t = Target { addr: "127.0.0.1:9".into(), id: String::new(), name: String::new(), platform: String::new() };
    assert_eq!(a.svc.send(t.clone(), &dir.path().join("missing.mp4")), Err(reason::NOT_FOUND));
    let txt = media_file(dir.path(), "notes.txt", 10);
    assert_eq!(a.svc.send(t.clone(), &txt), Err(reason::UNSUPPORTED));
    let big = dir.path().join("big.mp4");
    std::fs::File::create(&big).unwrap().set_len(MAX_SIZE + 1).unwrap();
    assert_eq!(a.svc.send(t, &big), Err(reason::TOO_LARGE));
}

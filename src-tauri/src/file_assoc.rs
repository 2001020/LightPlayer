//! "Open with LightPlayer by default": makes the app the default handler for
//! the audio and video types it declares (`bundle.fileAssociations` in
//! tauri.conf.json, kept in sync by a test below), via LaunchServices.

use serde::Serialize;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const AUDIO: &[&str] = &[
    "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "ape", "wma", "aiff", "aif", "alac", "wv", "dsf", "dff", "tta", "mka",
];

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const VIDEO: &[&str] = &[
    "mp4", "m4v", "mov", "mkv", "avi", "webm", "flv", "wmv", "ts", "m2ts", "mpg", "mpeg", "3gp", "rmvb", "rm", "vob", "ogv",
];

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KindStatus {
    /// Extensions opened by this app by default.
    pub ours: Vec<String>,
    /// Extensions opened by another app (or none).
    pub others: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub supported: bool,
    pub audio: KindStatus,
    pub video: KindStatus,
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::c_void;

    type CFStringRef = *const c_void;
    const UTF8: u32 = 0x0800_0100;
    const ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithBytes(alloc: *const c_void, bytes: *const u8, len: isize, encoding: u32, external: u8) -> CFStringRef;
        fn CFStringGetCString(s: CFStringRef, buf: *mut u8, size: isize, encoding: u32) -> u8;
        fn CFRelease(cf: *const c_void);
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        static kUTTagClassFilenameExtension: CFStringRef;
        fn UTTypeCreatePreferredIdentifierForTag(class: CFStringRef, tag: CFStringRef, conforming: CFStringRef) -> CFStringRef;
        fn LSCopyDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(content_type: CFStringRef, role: u32, handler: CFStringRef) -> i32;
    }

    /// An owned CFString, released on drop.
    struct Cf(CFStringRef);

    impl Cf {
        fn new(s: &str) -> Cf {
            Cf(unsafe { CFStringCreateWithBytes(std::ptr::null(), s.as_ptr(), s.len() as isize, UTF8, 0) })
        }

        fn string(&self) -> Option<String> {
            if self.0.is_null() {
                return None;
            }
            let mut buf = [0u8; 512];
            let ok = unsafe { CFStringGetCString(self.0, buf.as_mut_ptr(), buf.len() as isize, UTF8) };
            if ok == 0 {
                return None;
            }
            let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
            Some(String::from_utf8_lossy(&buf[..end]).into_owned())
        }
    }

    impl Drop for Cf {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) };
            }
        }
    }

    fn uti(ext: &str) -> Cf {
        let tag = Cf::new(ext);
        Cf(unsafe { UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, tag.0, std::ptr::null()) })
    }

    pub fn handler(ext: &str) -> Option<String> {
        let t = uti(ext);
        if t.0.is_null() {
            return None;
        }
        Cf(unsafe { LSCopyDefaultRoleHandlerForContentType(t.0, ROLES_ALL) }).string()
    }

    pub fn set_handler(ext: &str, bundle_id: &str) -> Result<(), String> {
        let t = uti(ext);
        if t.0.is_null() {
            return Err(format!("{ext}：无法识别的类型"));
        }
        let id = Cf::new(bundle_id);
        match unsafe { LSSetDefaultRoleHandlerForContentType(t.0, ROLES_ALL, id.0) } {
            0 => Ok(()),
            code => Err(format!("{ext}：系统返回错误 {code}")),
        }
    }
}

#[cfg(target_os = "macos")]
fn kind_status(exts: &[&str], bundle_id: &str) -> KindStatus {
    let mut st = KindStatus::default();
    for ext in exts {
        let ours = imp::handler(ext).is_some_and(|h| h.eq_ignore_ascii_case(bundle_id));
        if ours { &mut st.ours } else { &mut st.others }.push(ext.to_string());
    }
    st
}

#[cfg(target_os = "macos")]
pub fn status(bundle_id: &str) -> Status {
    Status { supported: true, audio: kind_status(AUDIO, bundle_id), video: kind_status(VIDEO, bundle_id) }
}

#[cfg(not(target_os = "macos"))]
pub fn status(_bundle_id: &str) -> Status {
    Status::default()
}

/// Makes this app the default for the chosen kinds; returns the failures.
#[cfg(target_os = "macos")]
pub fn associate(bundle_id: &str, audio: bool, video: bool) -> Vec<String> {
    let mut exts: Vec<&str> = vec![];
    if audio {
        exts.extend(AUDIO);
    }
    if video {
        exts.extend(VIDEO);
    }
    exts.into_iter().filter_map(|e| imp::set_handler(e, bundle_id).err()).collect()
}

#[cfg(not(target_os = "macos"))]
pub fn associate(_bundle_id: &str, _audio: bool, _video: bool) -> Vec<String> {
    vec!["只有 macOS 版本支持设置文件关联".into()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_bundle_declaration() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let assoc = conf["bundle"]["fileAssociations"].as_array().unwrap();
        let exts = |name: &str| -> Vec<String> {
            let a = assoc.iter().find(|a| a["name"] == name).unwrap();
            a["ext"].as_array().unwrap().iter().map(|e| e.as_str().unwrap().to_string()).collect()
        };
        assert_eq!(exts("Audio"), AUDIO);
        assert_eq!(exts("Video"), VIDEO);
    }
}

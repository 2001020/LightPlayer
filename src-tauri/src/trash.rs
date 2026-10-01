//! Moving files to the Trash.

/// Moves one file to the user's Trash (recoverable from Finder).
#[cfg(target_os = "macos")]
pub fn trash(path: &str) -> Result<(), String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    if !std::path::Path::new(path).exists() {
        return Err("文件不存在".into());
    }
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, None)
        .map_err(|e| e.localizedDescription().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn trash(path: &str) -> Result<(), String> {
    let _ = path;
    Err("此系统不支持移到废纸篓".into())
}

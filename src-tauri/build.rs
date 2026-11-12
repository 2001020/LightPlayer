fn main() {
    link_clang_runtime();
    tauri_build::build()
}

/// whisper.cpp's Metal code checks the system version with `@available`,
/// which newer Xcode compiles to a call into clang's runtime library. Rust
/// links without the C compiler's default libraries, so name it here.
fn link_clang_runtime() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let Ok(out) = std::process::Command::new("clang").arg("--print-resource-dir").output() else {
        return;
    };
    let dir = std::path::Path::new(String::from_utf8_lossy(&out.stdout).trim()).join("lib").join("darwin");
    if dir.join("libclang_rt.osx.a").exists() {
        println!("cargo:rustc-link-search=native={}", dir.display());
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
}

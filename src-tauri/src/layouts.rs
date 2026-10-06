//! Player page layouts: pictures added in the layout editor (kept in the app's
//! data folder under a name made from their content), the check of layouts a
//! plugin ships, and exporting a layout as a `.lpplugin` package.

use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};

pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "svg"];
const MAX_IMAGE: u64 = 20 * 1024 * 1024;
const MAX_LAYOUT: u64 = 512 * 1024;
const MAX_ELEMENTS: usize = 60;
const KINDS: &[&str] = &["cover", "title", "artist", "album", "chips", "lyric", "text", "image", "clock", "progress", "time"];

fn ext(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// Copies a picture into `assets`; returns its "asset:<name>" source.
pub fn add_asset(src: &Path, assets: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let ext = ext(src);
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("只能使用 PNG、JPG、WebP、GIF 或 SVG 图片".into());
    }
    let meta = std::fs::metadata(src).map_err(|_| "找不到这张图片".to_string())?;
    if meta.len() > MAX_IMAGE {
        return Err("图片太大（最多 20 MB）".into());
    }
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    let hash = Sha256::digest(&bytes);
    let name = format!("{}.{ext}", hex::encode(&hash[..16]));
    std::fs::create_dir_all(assets).map_err(|e| e.to_string())?;
    let dest = assets.join(&name);
    if !dest.is_file() {
        std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    }
    Ok(format!("asset:{name}"))
}

/// An added picture by name (`/asset/{name}`): only names `add_asset` makes.
pub fn asset_file(assets: &Path, name: &str) -> Option<PathBuf> {
    let (stem, ext) = name.split_once('.')?;
    let ok = (16..=64).contains(&stem.len()) && stem.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) && IMAGE_EXTS.contains(&ext);
    let file = assets.join(name);
    (ok && file.is_file()).then_some(file)
}

/// Checks a layout file of a plugin (`layouts` in its manifest).
pub fn check_plugin_layout(dir: &Path, file: &Path, shown: &str) -> Result<(), String> {
    if std::fs::metadata(file).map(|m| m.len()).unwrap_or(0) > MAX_LAYOUT {
        return Err(format!("{shown} 超过 512 KB"));
    }
    let text = std::fs::read_to_string(file).map_err(|_| format!("无法读取 {shown}"))?;
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("{shown} 格式错误：{e}"))?;
    let at = |e: String| format!("{shown}：{e}");
    let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("");
    if name.trim().is_empty() || name.chars().count() > 40 {
        return Err(at("name 应为 1–40 个字符".into()));
    }
    let Some(elements) = v.get("elements").and_then(|e| e.as_array()) else {
        return Err(at("缺少 elements 数组".into()));
    };
    if elements.is_empty() || elements.len() > MAX_ELEMENTS {
        return Err(at(format!("elements 应有 1–{MAX_ELEMENTS} 项")));
    }
    let mut ids = std::collections::HashSet::new();
    for e in elements {
        let kind = e.get("kind").and_then(|k| k.as_str()).unwrap_or("");
        if !KINDS.contains(&kind) {
            return Err(at(format!("未知的元素 kind：{kind}（可用：{}）", KINDS.join("、"))));
        }
        let id = e.get("id").and_then(|i| i.as_str()).unwrap_or("");
        if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') || !ids.insert(id) {
            return Err(at(format!("元素 id 无效或重复：{id}")));
        }
        if kind == "image" {
            match e.get("src").and_then(|s| s.as_str()) {
                None | Some("") => {}
                Some(s) if s.starts_with("data:image/") => {}
                Some(s) => {
                    crate::plugins::plugin_file(dir, s, IMAGE_EXTS).map_err(at)?;
                }
            }
        }
    }
    Ok(())
}

/// A file name that is safe inside the package.
fn safe_name(s: &str) -> String {
    let n: String = s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' }).collect();
    n.trim_matches('.').to_string()
}

/// Writes `layout` ({name, elements}) as a plugin package at `dest`, with the
/// pictures it uses.
pub fn export(layout: &Value, dest: &Path, assets: &Path, plugins: &Path) -> Result<(), String> {
    let name: String = layout.get("name").and_then(|n| n.as_str()).unwrap_or("").trim().chars().take(40).collect();
    let name = if name.is_empty() { "我的布局".to_string() } else { name };
    let mut elements = layout.get("elements").and_then(|e| e.as_array()).cloned().ok_or("布局没有元素")?;
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    for e in elements.iter_mut() {
        let Some(src) = e.get("src").and_then(|s| s.as_str()).map(str::to_string) else {
            continue;
        };
        let local = if let Some(n) = src.strip_prefix("asset:") {
            asset_file(assets, n).map(|f| (n.to_string(), f))
        } else if let Some(rest) = src.strip_prefix("plugin:") {
            rest.split_once('/').and_then(|(id, path)| {
                let f = crate::plugins::served_file(plugins, id, path)?;
                let base = f.file_name()?.to_string_lossy().into_owned();
                Some((safe_name(&format!("{id}-{base}")), f))
            })
        } else {
            None
        };
        match local {
            Some((file_name, path)) => {
                if !files.iter().any(|(n, _)| *n == file_name) {
                    files.push((file_name.clone(), path));
                }
                e["src"] = json!(format!("images/{file_name}"));
            }
            None if src.starts_with("data:image/") => {}
            None => e["src"] = json!(""),
        }
    }
    // The same layout exported again replaces the earlier install.
    let id = {
        use sha2::{Digest, Sha256};
        format!("user.layout.{}", hex::encode(&Sha256::digest(name.as_bytes())[..5]))
    };
    let version = env!("CARGO_PKG_VERSION");
    let manifest = json!({
        "manifestVersion": 1,
        "id": id,
        "name": name,
        "version": "1.0.0",
        "minAppVersion": version,
        "description": "用 LightPlayer 布局编辑器导出的播放页布局。启用后在播放页的“布局”菜单中选用。",
        "layouts": ["layout.json"],
    });
    let layout_json = json!({ "name": name, "elements": elements });

    // Built in a scratch folder and checked like any plugin before zipping.
    let tmp = std::env::temp_dir().join(format!("lp-export-{:016x}", rand::random::<u64>()));
    let result = (|| {
        std::fs::create_dir_all(tmp.join("images")).map_err(|e| e.to_string())?;
        std::fs::write(tmp.join(crate::plugins::MANIFEST), serde_json::to_vec_pretty(&manifest).unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(tmp.join("layout.json"), serde_json::to_vec_pretty(&layout_json).unwrap()).map_err(|e| e.to_string())?;
        for (n, path) in &files {
            std::fs::copy(path, tmp.join("images").join(n)).map_err(|e| e.to_string())?;
        }
        crate::plugins::validate_dir(&tmp).map_err(|e| format!("导出的插件无效：{e}"))?;
        let f = std::fs::File::create(dest).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(f);
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut add = |rel: &str, path: &Path| -> Result<(), String> {
            zip.start_file(rel, opts).map_err(|e| e.to_string())?;
            zip.write_all(&std::fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        };
        add(crate::plugins::MANIFEST, &tmp.join(crate::plugins::MANIFEST))?;
        add("layout.json", &tmp.join("layout.json"))?;
        for (n, _) in &files {
            add(&format!("images/{n}"), &tmp.join("images").join(n))?;
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    if result.is_err() {
        let _ = std::fs::remove_file(dest);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n not really";

    #[test]
    fn adds_and_serves_assets() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("Sticker.PNG");
        std::fs::write(&src, PNG).unwrap();
        let assets = tmp.path().join("assets");
        let a = add_asset(&src, &assets).unwrap();
        let name = a.strip_prefix("asset:").unwrap();
        assert!(name.ends_with(".png") && name.len() == 36, "{a}");
        // Same picture, same name.
        assert_eq!(add_asset(&src, &assets).unwrap(), a);
        assert!(asset_file(&assets, name).is_some());
        for bad in ["../x.png", "abc.png", "0123456789abcdef0123456789abcdef.exe", "0123456789ABCDEF0123456789ABCDEF.png"] {
            assert!(asset_file(&assets, bad).is_none(), "{bad}");
        }
        let txt = tmp.path().join("a.txt");
        std::fs::write(&txt, "x").unwrap();
        assert!(add_asset(&txt, &assets).is_err());
    }

    #[test]
    fn exports_a_layout_that_installs() {
        let tmp = tempfile::tempdir().unwrap();
        let assets = tmp.path().join("assets");
        let plugins = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins).unwrap();
        let src = tmp.path().join("s.png");
        std::fs::write(&src, PNG).unwrap();
        let asset = add_asset(&src, &assets).unwrap();
        let layout = json!({
            "name": "我的唱片",
            "elements": [
                { "id": "cover", "kind": "cover", "x": 50, "y": 40, "w": 60, "cover": { "shape": "vinyl" } },
                { "id": "image-1", "kind": "image", "x": 10, "y": 10, "w": 10, "src": asset },
                { "id": "image-2", "kind": "image", "x": 10, "y": 10, "w": 10, "src": "asset:ffffffffffffffffffffffffffffffff.png" },
                { "id": "text-1", "kind": "text", "x": 50, "y": 90, "w": 40, "content": "{title}" }
            ]
        });
        let dest = tmp.path().join("out.lpplugin");
        export(&layout, &dest, &assets, &plugins).unwrap();
        let id = crate::plugins::install(&dest, &plugins, false).unwrap();
        assert!(id.starts_with("user.layout."));
        let dir = plugins.join(&id);
        let m = crate::plugins::validate_dir(&dir).unwrap();
        assert_eq!(m["layouts"], json!(["layout.json"]));
        let l: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("layout.json")).unwrap()).unwrap();
        let src = l["elements"][1]["src"].as_str().unwrap();
        assert!(src.starts_with("images/") && dir.join(src).is_file(), "{src}");
        // A missing picture is dropped rather than failing the export.
        assert_eq!(l["elements"][2]["src"], json!(""));
        // Exporting again gives the same id (installing replaces).
        export(&layout, &dest, &assets, &plugins).unwrap();
        assert_eq!(crate::plugins::install(&dest, &plugins, false).unwrap_err(), crate::plugins::EXISTS);
    }

    #[test]
    fn checks_plugin_layouts() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let check = |v: Value| {
            std::fs::write(dir.join("l.json"), v.to_string()).unwrap();
            check_plugin_layout(dir, &dir.join("l.json"), "l.json")
        };
        let el = |kind: &str, id: &str| json!({ "id": id, "kind": kind });
        assert!(check(json!({ "name": "A", "elements": [el("cover", "cover")] })).is_ok());
        assert!(check(json!({ "name": "", "elements": [el("cover", "cover")] })).is_err());
        assert!(check(json!({ "name": "A", "elements": [] })).is_err());
        assert!(check(json!({ "name": "A", "elements": [el("script", "x")] })).is_err());
        assert!(check(json!({ "name": "A", "elements": [el("text", "a"), el("text", "a")] })).is_err());
        let img = |src: &str| json!({ "name": "A", "elements": [{ "id": "i", "kind": "image", "src": src }] });
        assert!(check(img("https://example.com/a.png")).is_err());
        assert!(check(img("../a.png")).is_err());
        assert!(check(img("missing.png")).is_err());
        std::fs::write(dir.join("a.png"), PNG).unwrap();
        assert!(check(img("a.png")).is_ok());
        assert!(check(img("data:image/png;base64,AAAA")).is_ok());
    }
}

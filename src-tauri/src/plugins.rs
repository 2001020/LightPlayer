//! Declarative plugins: a folder with `manifest.json`, style sheets, fonts and
//! a table of replacement UI strings. Plugins never run code; this module
//! checks a plugin against the rules in `docs/plugins/README.md`, installs it
//! from a folder or a `.lpplugin` (zip) file and lists the installed ones.
//! The files themselves are served to the WebView by the media server.

use serde::Serialize;
use serde_json::{Map, Value};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

pub const MANIFEST: &str = "manifest.json";
const MAX_CSS: u64 = 1024 * 1024;
const MAX_TOTAL: u64 = 30 * 1024 * 1024;
const MAX_FILES: usize = 1000;

/// App settings a plugin may set (`config`).
pub const CONFIG_KEYS: &[&str] = &[
    "theme",
    "accent",
    "dynamicAccent",
    "coverBackground",
    "playerStyle",
    "lyricFontSize",
    "lyricAlign",
    "showTranslation",
    "karaoke",
    "lyricHighlight",
    "desktopLyrics.color",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntry {
    /// The folder name (equal to the manifest id when valid).
    pub id: String,
    pub manifest: Option<Value>,
    /// Why the plugin cannot be used.
    pub error: Option<String>,
    /// The plugin needs a newer LightPlayer (`minAppVersion`).
    pub incompatible: bool,
}

pub fn valid_id(id: &str) -> bool {
    let ok_char = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-';
    (3..=64).contains(&id.len())
        && id.chars().all(ok_char)
        && id.starts_with(|c: char| c.is_ascii_alphanumeric())
        && id.ends_with(|c: char| c.is_ascii_alphanumeric())
        && !id.contains("..")
}

fn valid_css_ident(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_var(s: &str) -> bool {
    s.len() > 2 && s.starts_with("--") && valid_css_ident(&s[2..].replace('-', "_"))
}

fn valid_color(s: &str) -> bool {
    let hex = s.strip_prefix('#').unwrap_or("");
    s.starts_with('#') && (hex.len() == 6 || hex.len() == 3) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

/// `1.6.0` → (1, 6, 0); a pre-release suffix is ignored.
pub fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim().trim_start_matches('v');
    let core = core.split(|c: char| c == '-' || c == '+' || c.is_ascii_alphabetic()).next()?;
    let mut it = core.split('.').map(|p| p.parse::<u64>().ok());
    let v = (it.next()??, it.next().unwrap_or(Some(0))?, it.next().unwrap_or(Some(0))?);
    Some(v)
}

/// A relative path inside the plugin folder, written with `/`.
fn rel_path(s: &str) -> Result<PathBuf, String> {
    if s.is_empty() || s.contains('\\') || s.starts_with('/') || s.contains(':') {
        return Err(format!("路径无效：{s}（只能使用插件文件夹内、以 / 分隔的相对路径）"));
    }
    let p = PathBuf::from(s);
    if !p.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(format!("路径无效：{s}（不能包含 . 或 ..）"));
    }
    Ok(p)
}

/// The file a manifest path names, which must exist and stay inside `dir`.
pub fn plugin_file(dir: &Path, s: &str, exts: &[&str]) -> Result<PathBuf, String> {
    let rel = rel_path(s)?;
    let ext = rel.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !exts.contains(&ext.as_str()) {
        return Err(format!("{s}：文件类型应为 {}", exts.join(" / ")));
    }
    let path = dir.join(&rel);
    let meta = std::fs::symlink_metadata(&path).map_err(|_| format!("找不到文件：{s}"))?;
    if !meta.is_file() {
        return Err(format!("{s} 不是普通文件"));
    }
    Ok(path)
}

/// Strings inside `url(…)`, `@import` and quotes that point somewhere other
/// than the plugin folder (`http:`, `//host`, `file:`; `data:` is allowed).
pub fn remote_reference(css: &str) -> Option<String> {
    // Drop comments first so a commented-out URL does not count.
    let mut text = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(i) = rest.find("/*") {
        text.push_str(&rest[..i]);
        rest = match rest[i + 2..].find("*/") {
            Some(j) => &rest[i + 2 + j + 2..],
            None => "",
        };
    }
    text.push_str(rest);
    let lower = text.to_ascii_lowercase();
    let remote = |arg: &str| {
        let a = arg.trim().trim_matches(|c| c == '"' || c == '\'').trim();
        if a.starts_with("//") {
            return true;
        }
        match a.find(':') {
            // A scheme is letters (plus + - .) before the colon.
            Some(i) if i > 0 && a[..i].chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) => {
                !a[..i].eq_ignore_ascii_case("data")
            }
            _ => false,
        }
    };
    // Arguments of url( … ).
    let mut from = 0;
    while let Some(i) = lower[from..].find("url(") {
        let start = from + i + 4;
        let end = lower[start..].find(')').map(|j| start + j).unwrap_or(lower.len());
        if remote(&text[start..end]) {
            return Some(text[start..end].trim().to_string());
        }
        from = end.min(lower.len());
    }
    // Quoted strings (@import "…", image-set("…")): only what reads as an
    // address, so `content: "Tip:"` stays fine.
    let address = |s: &str| {
        let s = s.trim();
        s.starts_with("//") || s.find("://").is_some_and(|i| i > 0 && s[..i].chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)))
            || s.to_ascii_lowercase().starts_with("file:")
    };
    for q in ['"', '\''] {
        let mut parts = text.split(q);
        parts.next();
        while let Some(inner) = parts.next() {
            if address(inner) {
                return Some(inner.to_string());
            }
            parts.next();
        }
    }
    if lower.contains("http://") || lower.contains("https://") {
        return Some("http(s)://…".into());
    }
    None
}

fn strings_table(v: &Value, what: &str) -> Result<(), String> {
    let Some(map) = v.as_object() else {
        return Err(format!("{what} 应为 {{\"原文\": \"替换文字\"}} 对象"));
    };
    if map.len() > 5000 {
        return Err(format!("{what} 条目过多（最多 5000 条）"));
    }
    for (k, v) in map {
        if k.trim().is_empty() || !v.is_string() {
            return Err(format!("{what} 中的“{k}”：原文不能为空，替换文字必须是字符串"));
        }
    }
    Ok(())
}

fn str_field<'a>(m: &'a Map<String, Value>, key: &str, required: bool, max: usize) -> Result<Option<&'a str>, String> {
    match m.get(key) {
        None | Some(Value::Null) if !required => Ok(None),
        None | Some(Value::Null) => Err(format!("缺少字段 {key}")),
        Some(Value::String(s)) if !s.trim().is_empty() && s.chars().count() <= max => Ok(Some(s)),
        Some(Value::String(s)) if s.trim().is_empty() => Err(format!("{key} 不能为空")),
        Some(Value::String(_)) => Err(format!("{key} 过长（最多 {max} 个字符）")),
        Some(_) => Err(format!("{key} 应为字符串")),
    }
}

fn check_config(v: &Value) -> Result<(), String> {
    let Some(map) = v.as_object() else {
        return Err("config 应为对象".into());
    };
    for (k, v) in map {
        let one_of = |opts: &[&str]| v.as_str().is_some_and(|s| opts.contains(&s));
        let ok = match k.as_str() {
            "theme" => one_of(&["system", "light", "dark", "weather"]),
            "playerStyle" => one_of(&["classic", "flow"]),
            "lyricAlign" => one_of(&["center", "left"]),
            "accent" | "desktopLyrics.color" => v.as_str().is_some_and(valid_color),
            "lyricHighlight" => v.is_null() || v.as_str().is_some_and(valid_color),
            "dynamicAccent" | "coverBackground" | "showTranslation" | "karaoke" => v.is_boolean(),
            "lyricFontSize" => v.as_f64().is_some_and(|n| (14.0..=56.0).contains(&n)),
            _ => return Err(format!("config 不支持 {k}（可用：{}）", CONFIG_KEYS.join("、"))),
        };
        if !ok {
            return Err(format!("config.{k} 的值无效：{v}"));
        }
    }
    Ok(())
}

fn check_options(v: &Value) -> Result<(), String> {
    let Some(list) = v.as_array() else {
        return Err("options 应为数组".into());
    };
    if list.len() > 50 {
        return Err("options 最多 50 项".into());
    }
    let mut ids = std::collections::HashSet::new();
    for o in list {
        let Some(o) = o.as_object() else {
            return Err("options 的每一项应为对象".into());
        };
        let id = str_field(o, "id", true, 64)?.unwrap();
        if !valid_css_ident(id) || !ids.insert(id.to_string()) {
            return Err(format!("选项 id 无效或重复：{id}"));
        }
        let at = |e: String| format!("选项 {id}：{e}");
        str_field(o, "label", true, 40).map_err(at)?;
        str_field(o, "description", false, 200).map_err(at)?;
        let var = str_field(o, "var", false, 64).map_err(at)?;
        if var.is_some_and(|v| !valid_var(v)) {
            return Err(at("var 应为以 -- 开头的 CSS 变量名".into()));
        }
        let class = str_field(o, "class", false, 64).map_err(at)?;
        if class.is_some_and(|c| !valid_css_ident(c)) {
            return Err(at("class 不是有效的 CSS 类名".into()));
        }
        let def = o.get("default");
        match o.get("type").and_then(|t| t.as_str()) {
            Some("range") => {
                let num = |k: &str| o.get(k).and_then(|v| v.as_f64());
                let (Some(min), Some(max)) = (num("min"), num("max")) else {
                    return Err(at("range 需要 min 和 max".into()));
                };
                let step = num("step").unwrap_or(1.0);
                let d = def.and_then(|d| d.as_f64());
                if min >= max || step <= 0.0 || !d.is_some_and(|d| (min..=max).contains(&d)) {
                    return Err(at("需要 min < max、step > 0，且 default 在范围内".into()));
                }
                str_field(o, "unit", false, 8).map_err(at)?;
                if var.is_none() {
                    return Err(at("range 需要 var".into()));
                }
            }
            Some("color") => {
                if !def.and_then(|d| d.as_str()).is_some_and(valid_color) {
                    return Err(at("default 应为 #RRGGBB 颜色".into()));
                }
                if var.is_none() {
                    return Err(at("color 需要 var".into()));
                }
            }
            Some("toggle") => {
                if !def.is_some_and(|d| d.is_boolean()) {
                    return Err(at("default 应为 true 或 false".into()));
                }
                if var.is_none() && class.is_none() {
                    return Err(at("toggle 需要 class 或 var".into()));
                }
            }
            Some("select") => {
                let Some(choices) = o.get("choices").and_then(|c| c.as_array()).filter(|c| !c.is_empty() && c.len() <= 30)
                else {
                    return Err(at("select 需要 1–30 个 choices".into()));
                };
                let mut values = Vec::new();
                for c in choices {
                    let Some(c) = c.as_object() else {
                        return Err(at("choices 的每一项应为对象".into()));
                    };
                    let value = str_field(c, "value", true, 64).map_err(at)?.unwrap();
                    str_field(c, "label", true, 40).map_err(at)?;
                    if str_field(c, "class", false, 64).map_err(at)?.is_some_and(|c| !valid_css_ident(c)) {
                        return Err(at(format!("choice {value} 的 class 无效")));
                    }
                    values.push(value);
                }
                if !def.and_then(|d| d.as_str()).is_some_and(|d| values.contains(&d)) {
                    return Err(at("default 应为 choices 中的某个 value".into()));
                }
            }
            _ => return Err(at("type 应为 range / color / select / toggle".into())),
        }
    }
    Ok(())
}

/// Every file in the folder: refuses links, too many files and too many bytes.
fn walk(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    let mut total = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let entries = std::fs::read_dir(&d).map_err(|e| e.to_string())?;
        for e in entries.flatten() {
            let meta = std::fs::symlink_metadata(e.path()).map_err(|e| e.to_string())?;
            if meta.file_type().is_symlink() {
                return Err(format!("插件中不能包含链接：{}", e.file_name().to_string_lossy()));
            }
            if meta.is_dir() {
                stack.push(e.path());
            } else {
                total += meta.len();
                out.push(e.path());
            }
        }
        if out.len() > MAX_FILES || total > MAX_TOTAL {
            return Err("插件过大（最多 1000 个文件、30 MB）".into());
        }
    }
    Ok(out)
}

/// Checks a plugin folder and returns its manifest.
pub fn validate_dir(dir: &Path) -> Result<Value, String> {
    walk(dir)?;
    let text = std::fs::read_to_string(dir.join(MANIFEST)).map_err(|_| "找不到 manifest.json".to_string())?;
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("manifest.json 格式错误：{e}"))?;
    let Some(m) = v.as_object() else {
        return Err("manifest.json 应为对象".into());
    };
    if m.get("manifestVersion").and_then(|v| v.as_u64()) != Some(1) {
        return Err("manifestVersion 应为 1".into());
    }
    let id = str_field(m, "id", true, 64)?.unwrap();
    if !valid_id(id) {
        return Err(format!("id 无效：{id}（3–64 个字符，只能使用小写字母、数字、. 和 -）"));
    }
    str_field(m, "name", true, 40)?;
    let version = str_field(m, "version", true, 32)?.unwrap();
    if parse_version(version).is_none() {
        return Err(format!("version 无效：{version}（例如 1.0.0）"));
    }
    if let Some(min) = str_field(m, "minAppVersion", false, 32)? {
        if parse_version(min).is_none() {
            return Err(format!("minAppVersion 无效：{min}"));
        }
    }
    str_field(m, "author", false, 64)?;
    str_field(m, "description", false, 300)?;
    if let Some(h) = str_field(m, "homepage", false, 300)? {
        if !h.starts_with("https://") && !h.starts_with("http://") {
            return Err("homepage 应为 http(s) 链接".into());
        }
    }
    if let Some(p) = str_field(m, "preview", false, 200)? {
        plugin_file(dir, p, &["png", "jpg", "jpeg", "webp", "gif", "svg"])?;
    }
    if let Some(styles) = m.get("styles") {
        let list = styles.as_array().filter(|l| l.len() <= 20).ok_or("styles 应为最多 20 个文件的数组")?;
        for s in list {
            let s = s.as_str().ok_or("styles 中应为文件路径")?;
            let path = plugin_file(dir, s, &["css"])?;
            if std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > MAX_CSS {
                return Err(format!("{s} 超过 1 MB"));
            }
            let css = std::fs::read_to_string(&path).map_err(|_| format!("{s} 不是 UTF-8 文本"))?;
            if let Some(r) = remote_reference(&css) {
                return Err(format!("{s} 引用了外部资源：{r}（插件只能使用自己文件夹中的文件）"));
            }
        }
    }
    if let Some(fonts) = m.get("fonts") {
        let list = fonts.as_array().filter(|l| l.len() <= 20).ok_or("fonts 应为最多 20 项的数组")?;
        for f in list {
            let f = f.as_object().ok_or("fonts 的每一项应为对象")?;
            let family = str_field(f, "family", true, 64)?.unwrap();
            if family.contains(['"', '\'', ';', '{', '}', '\\']) {
                return Err(format!("字体名无效：{family}"));
            }
            plugin_file(dir, str_field(f, "src", true, 200)?.unwrap(), &["woff2", "woff", "ttf", "otf"])?;
            for k in ["weight", "style"] {
                match f.get(k) {
                    None => {}
                    Some(Value::Number(_)) if k == "weight" => {}
                    Some(Value::String(s)) if s.len() <= 16 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ') => {}
                    Some(v) => return Err(format!("字体 {family} 的 {k} 无效：{v}")),
                }
            }
        }
    }
    match m.get("strings") {
        None => {}
        Some(Value::String(s)) => {
            let path = plugin_file(dir, s, &["json"])?;
            let text = std::fs::read_to_string(&path).map_err(|_| format!("无法读取 {s}"))?;
            let table: Value = serde_json::from_str(&text).map_err(|e| format!("{s} 格式错误：{e}"))?;
            strings_table(&table, s)?;
        }
        Some(v) => strings_table(v, "strings")?,
    }
    if let Some(c) = m.get("config") {
        check_config(c)?;
    }
    if let Some(o) = m.get("options") {
        check_options(o)?;
    }
    if let Some(layouts) = m.get("layouts") {
        let list = layouts.as_array().filter(|l| l.len() <= 10).ok_or("layouts 应为最多 10 个文件的数组")?;
        for l in list {
            let s = l.as_str().ok_or("layouts 中应为文件路径")?;
            let path = plugin_file(dir, s, &["json"])?;
            crate::layouts::check_plugin_layout(dir, &path, s)?;
        }
    }
    Ok(v)
}

/// Installed plugins, valid or not (an author wants to see why one fails).
pub fn list(plugins_dir: &Path, app_version: &str) -> Vec<PluginEntry> {
    let app = parse_version(app_version).unwrap_or((0, 0, 0));
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(plugins_dir)
        .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    dirs.retain(|p| !p.file_name().and_then(|n| n.to_str()).unwrap_or(".").starts_with('.'));
    dirs.sort();
    dirs.into_iter()
        .map(|dir| {
            let id = dir.file_name().unwrap().to_string_lossy().into_owned();
            match validate_dir(&dir) {
                Ok(m) => {
                    let mid = m["id"].as_str().unwrap_or_default().to_string();
                    let error = (mid != id).then(|| format!("文件夹名 {id} 与 id {mid} 不一致"));
                    let incompatible = m["minAppVersion"].as_str().and_then(parse_version).is_some_and(|min| min > app);
                    PluginEntry { id, manifest: Some(m), error, incompatible }
                }
                Err(e) => PluginEntry { id, manifest: None, error: Some(e), incompatible: false },
            }
        })
        .collect()
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for file in walk(from)? {
        let rel = file.strip_prefix(from).map_err(|e| e.to_string())?;
        let dest = to.join(rel);
        if let Some(p) = dest.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        std::fs::copy(&file, &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn unzip(file: &Path, to: &Path) -> Result<(), String> {
    let f = std::fs::File::open(file).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(f).map_err(|_| "不是有效的插件包（.lpplugin / .zip）".to_string())?;
    if zip.len() > MAX_FILES * 2 {
        return Err("插件过大（最多 1000 个文件、30 MB）".into());
    }
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else {
            return Err(format!("插件包中的路径无效：{}", entry.name()));
        };
        if entry.is_symlink() {
            return Err(format!("插件中不能包含链接：{}", entry.name()));
        }
        let dest = to.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = dest.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        // Counted while reading: the sizes in the zip directory can lie.
        (&mut entry).take(MAX_TOTAL + 1 - total).read_to_end(&mut buf).map_err(|e| e.to_string())?;
        total += buf.len() as u64;
        if total > MAX_TOTAL {
            return Err("插件过大（最多 1000 个文件、30 MB）".into());
        }
        std::fs::write(&dest, buf).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The folder holding manifest.json: the root or a single top folder
/// (ignoring macOS archive leftovers).
fn package_root(dir: &Path) -> Option<PathBuf> {
    if dir.join(MANIFEST).is_file() {
        return Some(dir.to_path_buf());
    }
    let subdirs: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            n != "__MACOSX" && !n.starts_with('.')
        })
        .map(|e| e.path())
        .collect();
    match subdirs.as_slice() {
        [one] if one.join(MANIFEST).is_file() => Some(one.clone()),
        _ => None,
    }
}

/// Error text when a plugin with the same id is installed and `replace` is off.
pub const EXISTS: &str = "PLUGIN_EXISTS";

/// Installs a plugin folder or package; returns its id.
pub fn install(src: &Path, plugins_dir: &Path, replace: bool) -> Result<String, String> {
    std::fs::create_dir_all(plugins_dir).map_err(|e| e.to_string())?;
    let staging = plugins_dir.join(format!(".install-{:016x}", rand::random::<u64>()));
    let result = (|| {
        if src.is_dir() {
            copy_dir(src, &staging)?;
        } else if src.is_file() {
            unzip(src, &staging)?;
        } else {
            return Err("找不到所选的插件".to_string());
        }
        let root = package_root(&staging).ok_or("插件包中没有 manifest.json")?;
        let manifest = validate_dir(&root)?;
        let id = manifest["id"].as_str().unwrap_or_default().to_string();
        let target = plugins_dir.join(&id);
        if target.exists() {
            if !replace {
                return Err(EXISTS.to_string());
            }
            std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&root, &target).map_err(|e| e.to_string())?;
        Ok(id)
    })();
    let _ = std::fs::remove_dir_all(&staging);
    result
}

pub fn remove(plugins_dir: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err(format!("id 无效：{id}"));
    }
    let dir = plugins_dir.join(id);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A file a plugin serves (`/plugin/{id}/{path}`), if it stays in its folder.
pub fn served_file(plugins_dir: &Path, id: &str, path: &str) -> Option<PathBuf> {
    if !valid_id(id) {
        return None;
    }
    let rel = rel_path(path).ok()?;
    let root = plugins_dir.join(id).canonicalize().ok()?;
    let file = root.join(rel).canonicalize().ok()?;
    (file.starts_with(&root) && file.is_file()).then_some(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write;

    fn plugin(dir: &Path, manifest: Value, files: &[(&str, &str)]) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(MANIFEST), manifest.to_string()).unwrap();
        for (name, text) in files {
            let p = dir.join(name);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, text).unwrap();
        }
    }

    fn base(id: &str) -> Value {
        json!({ "manifestVersion": 1, "id": id, "name": "Test", "version": "1.0.0", "styles": ["style.css"] })
    }

    fn with(mut v: Value, k: &str, x: Value) -> Value {
        v[k] = x;
        v
    }

    #[test]
    fn ids_versions_and_colors() {
        assert!(valid_id("com.example.my-plugin"));
        assert!(valid_id("abc"));
        assert!(!valid_id("ab"));
        assert!(!valid_id("Abc"));
        assert!(!valid_id("a..b"));
        assert!(!valid_id("-abc"));
        assert!(!valid_id("a/b"));
        assert_eq!(parse_version("1.6.0"), Some((1, 6, 0)));
        assert_eq!(parse_version("v1.6.0b1"), Some((1, 6, 0)));
        assert_eq!(parse_version("2"), Some((2, 0, 0)));
        assert_eq!(parse_version("x"), None);
        assert!(valid_color("#ff00AA") && valid_color("#fff") && !valid_color("red") && !valid_color("#ggg"));
        assert!(valid_var("--my-var") && !valid_var("my-var") && !valid_var("--a;b"));
    }

    #[test]
    fn finds_remote_references() {
        assert_eq!(remote_reference("a { background: url(img/a.png) }"), None);
        assert_eq!(remote_reference("a { background: url('data:image/png;base64,xx') }"), None);
        assert_eq!(remote_reference("/* url(https://x.com/a.png) */ a{}"), None);
        assert_eq!(remote_reference("a::after { content: \"a: b\" }"), None);
        assert_eq!(remote_reference("a::after { content: \"Tip:\" } b::after { content: 'x:y' }"), None);
        assert!(remote_reference("a { background: url(https://x.com/a.png) }").is_some());
        assert!(remote_reference("a { background: url( \"//x.com/a.png\" ) }").is_some());
        assert!(remote_reference("@import \"https://x.com/a.css\";").is_some());
        assert!(remote_reference("@import url(file:///etc/passwd);").is_some());
        assert!(remote_reference("a { background: image-set('http://x/a.png' 1x) }").is_some());
    }

    #[test]
    fn validates_manifests() {
        let root = tempfile::tempdir().unwrap();
        let ok = |m: Value, files: &[(&str, &str)]| {
            let d = root.path().join(format!("p{}", rand::random::<u32>()));
            plugin(&d, m, files);
            validate_dir(&d)
        };
        let css = [("style.css", "a{}")];
        assert!(ok(base("com.test.a"), &css).is_ok());
        // Required fields, id and version.
        assert!(ok(with(base("com.test.a"), "manifestVersion", json!(2)), &css).is_err());
        assert!(ok(with(base("Bad Id"), "x", json!(1)), &css).is_err());
        assert!(ok(with(base("com.test.a"), "name", json!("")), &css).is_err());
        assert!(ok(with(base("com.test.a"), "version", json!("abc")), &css).is_err());
        // Paths stay inside the folder and must exist.
        assert!(ok(base("com.test.a"), &[]).unwrap_err().contains("找不到文件"));
        let e = ok(with(base("com.test.a"), "styles", json!(["../x.css"])), &css).unwrap_err();
        assert!(e.contains("路径无效"), "{e}");
        assert!(ok(with(base("com.test.a"), "styles", json!(["/etc/x.css"])), &css).is_err());
        assert!(ok(with(base("com.test.a"), "styles", json!(["style.txt"])), &[("style.txt", "")]).is_err());
        // No remote resources.
        let e = ok(base("com.test.a"), &[("style.css", "a{background:url(https://t.co/x.png)}")]).unwrap_err();
        assert!(e.contains("外部资源"), "{e}");
        // Fonts and strings.
        let m = with(base("com.test.a"), "fonts", json!([{ "family": "My Font", "src": "f/a.woff2", "weight": 400 }]));
        assert!(ok(m.clone(), &[("style.css", ""), ("f/a.woff2", "x")]).is_ok());
        assert!(ok(m, &css).is_err());
        let m = with(base("com.test.a"), "strings", json!("s.json"));
        assert!(ok(m.clone(), &[("style.css", ""), ("s.json", r#"{"媒体库":"Library"}"#)]).is_ok());
        assert!(ok(m.clone(), &[("style.css", ""), ("s.json", r#"{"媒体库":1}"#)]).is_err());
        assert!(ok(m, &[("style.css", ""), ("s.json", "nope")]).is_err());
        assert!(ok(with(base("com.test.a"), "strings", json!({ "设置": "Settings" })), &css).is_ok());
        // Config whitelist and values.
        let cfg = |c: Value| ok(with(base("com.test.a"), "config", c), &css);
        assert!(cfg(json!({ "lyricAlign": "left", "lyricFontSize": 30, "lyricHighlight": null, "desktopLyrics.color": "#fff" })).is_ok());
        assert!(cfg(json!({ "lyricFontSize": 100 })).is_err());
        assert!(cfg(json!({ "volume": 1 })).unwrap_err().contains("不支持"));
        assert!(cfg(json!({ "theme": "pink" })).is_err());
        // Options.
        let opt = |o: Value| ok(with(base("com.test.a"), "options", json!([o])), &css);
        assert!(opt(json!({ "id": "g", "label": "G", "type": "range", "min": 0, "max": 10, "default": 5, "var": "--t-g" })).is_ok());
        assert!(opt(json!({ "id": "g", "label": "G", "type": "range", "min": 0, "max": 10, "default": 50, "var": "--t-g" })).is_err());
        assert!(opt(json!({ "id": "g", "label": "G", "type": "range", "min": 0, "max": 10, "default": 5 })).is_err());
        assert!(opt(json!({ "id": "c", "label": "C", "type": "color", "default": "#123456", "var": "--t-c" })).is_ok());
        assert!(opt(json!({ "id": "t", "label": "T", "type": "toggle", "default": true, "class": "t-on" })).is_ok());
        assert!(opt(json!({ "id": "t", "label": "T", "type": "toggle", "default": true, "class": "t on" })).is_err());
        assert!(opt(json!({ "id": "s", "label": "S", "type": "select", "default": "a",
            "choices": [{ "value": "a", "label": "A", "class": "t-a" }, { "value": "b", "label": "B" }] })).is_ok());
        assert!(opt(json!({ "id": "s", "label": "S", "type": "select", "default": "z", "choices": [{ "value": "a", "label": "A" }] })).is_err());
        assert!(opt(json!({ "id": "x", "label": "X", "type": "script" })).is_err());
    }

    #[test]
    fn example_plugins_are_valid() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../examples/plugins");
        let mut n = 0;
        for e in std::fs::read_dir(&dir).unwrap().flatten() {
            let m = validate_dir(&e.path()).unwrap_or_else(|err| panic!("{}: {err}", e.path().display()));
            assert_eq!(m["id"].as_str(), e.file_name().to_str(), "folder name = id");
            n += 1;
        }
        assert_eq!(n, 4);
    }

    fn zip_file(path: &Path, entries: &[(&str, &str)]) {
        let mut z = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let o = zip::write::SimpleFileOptions::default();
        for (name, text) in entries {
            z.start_file(*name, o).unwrap();
            z.write_all(text.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn installs_lists_and_removes() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins = tmp.path().join("plugins");
        let manifest = base("com.test.zip").to_string();

        // A package with the files at its root.
        let pkg = tmp.path().join("a.lpplugin");
        zip_file(&pkg, &[("manifest.json", &manifest), ("style.css", "a{}")]);
        assert_eq!(install(&pkg, &plugins, false).unwrap(), "com.test.zip");
        assert!(plugins.join("com.test.zip/style.css").is_file());
        // Installing again needs `replace`.
        assert_eq!(install(&pkg, &plugins, false).unwrap_err(), EXISTS);
        assert_eq!(install(&pkg, &plugins, true).unwrap(), "com.test.zip");

        // A package with a single top folder (as Finder and Explorer zip a folder).
        let pkg2 = tmp.path().join("b.zip");
        let m2 = base("com.test.nested").to_string();
        zip_file(&pkg2, &[("nested/manifest.json", &m2), ("nested/style.css", ""), ("__MACOSX/._x", "")]);
        assert_eq!(install(&pkg2, &plugins, false).unwrap(), "com.test.nested");

        // Zip slip and invalid plugins are refused, leaving nothing behind.
        let evil = tmp.path().join("evil.zip");
        zip_file(&evil, &[("../evil.css", "a{}"), ("manifest.json", &manifest)]);
        assert!(install(&evil, &plugins, true).unwrap_err().contains("路径无效"));
        assert!(!tmp.path().join("evil.css").exists());
        let bad = tmp.path().join("bad.zip");
        zip_file(&bad, &[("manifest.json", &manifest)]);
        assert!(install(&bad, &plugins, true).is_err());
        assert!(plugins.join("com.test.zip/style.css").is_file(), "a failed install keeps the old version");

        // A folder.
        let folder = tmp.path().join("src-folder");
        plugin(&folder, base("com.test.folder"), &[("style.css", "b{}")]);
        assert_eq!(install(&folder, &plugins, false).unwrap(), "com.test.folder");

        // A broken plugin and a renamed folder are listed with their error.
        plugin(&plugins.join("broken"), json!({ "manifestVersion": 1 }), &[]);
        plugin(&plugins.join("com.test.renamed"), base("com.test.other"), &[("style.css", "")]);
        plugin(&plugins.join("com.test.future"), with(base("com.test.future"), "minAppVersion", json!("9.0.0")), &[("style.css", "")]);
        let all = list(&plugins, "1.6.0");
        let ids: Vec<_> = all.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["broken", "com.test.folder", "com.test.future", "com.test.nested", "com.test.renamed", "com.test.zip"]);
        assert!(all[0].error.is_some() && all[0].manifest.is_none());
        assert!(all[1].error.is_none() && !all[1].incompatible);
        assert!(all[2].incompatible);
        assert!(all[4].error.as_deref().unwrap().contains("不一致"));
        assert!(std::fs::read_dir(&plugins).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with('.')));

        // Served files stay inside the plugin.
        assert!(served_file(&plugins, "com.test.zip", "style.css").is_some());
        assert!(served_file(&plugins, "com.test.zip", "../com.test.folder/style.css").is_none());
        assert!(served_file(&plugins, "com.test.zip", "manifest.json").is_some());
        assert!(served_file(&plugins, "..", "x").is_none());

        remove(&plugins, "com.test.zip").unwrap();
        assert!(!plugins.join("com.test.zip").exists());
        assert!(remove(&plugins, "../x").is_err());
    }
}

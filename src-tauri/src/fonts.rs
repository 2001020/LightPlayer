//! The custom interface font (Settings > 外观): the chosen file is copied into
//! the app's data folder in a form the web view can load. Font collections
//! (.ttc / .otc, as most system CJK fonts are) are not loadable as they are,
//! so their first font is written out as a font of its own.

use std::path::{Path, PathBuf};

const MAX_FONT: u64 = 300 * 1024 * 1024;

#[derive(serde::Serialize, Debug)]
pub struct ImportedFont {
    /// The copy in the app's data folder.
    pub path: String,
    /// The font's own name, or the file's.
    pub name: String,
}

fn u16_at(b: &[u8], i: usize) -> Option<u16> {
    Some(u16::from_be_bytes(b.get(i..i + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], i: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(i..i + 4)?.try_into().ok()?))
}

/// Whether `b` starts like a single TrueType / OpenType font.
fn is_sfnt(b: &[u8]) -> bool {
    matches!(b.get(..4), Some([0, 1, 0, 0]) | Some(b"OTTO") | Some(b"true") | Some(b"typ1"))
}

/// The extension the copy gets: what the data is, whatever the file was called.
fn kind(b: &[u8], ext: &str) -> String {
    match b.get(..4) {
        Some(b"wOFF") => "woff".into(),
        Some(b"wOF2") => "woff2".into(),
        Some(b"OTTO") => "otf".into(),
        _ if is_sfnt(b) => "ttf".into(),
        // Anything else is passed on as it is: the web view has the last word.
        _ if !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()) => ext.into(),
        _ => "font".into(),
    }
}

fn checksum(data: &[u8]) -> u32 {
    data.chunks(4).fold(0u32, |sum, c| {
        let mut w = [0u8; 4];
        w[..c.len()].copy_from_slice(c);
        sum.wrapping_add(u32::from_be_bytes(w))
    })
}

/// The first font of a collection ("ttcf") as a standalone font.
fn first_of_collection(b: &[u8]) -> Option<Vec<u8>> {
    if b.get(..4)? != b"ttcf" || u32_at(b, 8)? == 0 {
        return None;
    }
    let dir = u32_at(b, 12)? as usize;
    let n = u16_at(b, dir + 4)? as usize;
    if n == 0 || n > 512 {
        return None;
    }
    let head_len = 12 + 16 * n;
    let mut out = b.get(dir..dir + head_len)?.to_vec();
    let mut head_at = None;
    for i in 0..n {
        let rec = dir + 12 + 16 * i;
        let (offset, len) = (u32_at(b, rec + 8)? as usize, u32_at(b, rec + 12)? as usize);
        let table = b.get(offset..offset.checked_add(len)?)?;
        let at = out.len();
        if &b[rec..rec + 4] == b"head" && len >= 12 {
            head_at = Some(at);
        }
        out[12 + 16 * i + 8..12 + 16 * i + 12].copy_from_slice(&(at as u32).to_be_bytes());
        out.extend_from_slice(table);
        out.resize(out.len().div_ceil(4) * 4, 0);
    }
    // The whole-file checksum in "head" covered the collection: make it this font's.
    if let Some(h) = head_at {
        out[h + 8..h + 12].fill(0);
        let adjust = 0xB1B0_AFBAu32.wrapping_sub(checksum(&out));
        out[h + 8..h + 12].copy_from_slice(&adjust.to_be_bytes());
    }
    Some(out)
}

/// The family name in a single font's "name" table.
fn family(b: &[u8]) -> Option<String> {
    if !is_sfnt(b) {
        return None;
    }
    let n = u16_at(b, 4)? as usize;
    let rec = (0..n).map(|i| 12 + 16 * i).find(|&r| b.get(r..r + 4) == Some(b"name"))?;
    let t = b.get(u32_at(b, rec + 8)? as usize..)?;
    let (count, strings) = (u16_at(t, 2)? as usize, u16_at(t, 4)? as usize);
    let mut best: Option<(u8, String)> = None;
    for i in 0..count {
        let r = 6 + 12 * i;
        let (platform, lang, id) = (u16_at(t, r)?, u16_at(t, r + 4)?, u16_at(t, r + 6)?);
        if id != 1 && id != 4 {
            continue;
        }
        let (len, off) = (u16_at(t, r + 8)? as usize, u16_at(t, r + 10)? as usize);
        let Some(raw) = t.get(strings + off..strings + off + len) else { continue };
        let text = match platform {
            0 | 3 => String::from_utf16_lossy(&raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect::<Vec<_>>()),
            1 if raw.is_ascii() => String::from_utf8_lossy(raw).into_owned(),
            _ => continue,
        };
        let text = text.trim().to_string();
        if text.is_empty() || text.chars().any(|c| c.is_control()) {
            continue;
        }
        // The family (1) rather than the full name (4); Windows English first.
        let rank = (if id == 1 { 0 } else { 4 }) + match (platform, lang) {
            (3, 0x409) => 0,
            (3, _) | (0, _) => 1,
            _ => 2,
        };
        if best.as_ref().map_or(true, |(r, _)| rank < *r) {
            best = Some((rank, text));
        }
    }
    best.map(|(_, s)| s.chars().take(80).collect())
}

/// The bytes to keep for a chosen font file, their extension and the font's name.
pub fn prepare(bytes: Vec<u8>, ext: &str) -> Result<(Vec<u8>, String, Option<String>), String> {
    let bytes = if bytes.starts_with(b"ttcf") {
        first_of_collection(&bytes).ok_or_else(|| "无法读取这个字体文件".to_string())?
    } else {
        bytes
    };
    if bytes.len() < 12 {
        return Err("无法读取这个字体文件".into());
    }
    let kind = kind(&bytes, ext);
    let name = family(&bytes);
    Ok((bytes, kind, name))
}

/// Copies a font into `dir` (replacing the one imported before).
pub fn import(src: &Path, dir: &Path) -> Result<ImportedFont, String> {
    use sha2::{Digest, Sha256};
    let meta = std::fs::metadata(src).map_err(|_| "找不到这个字体文件".to_string())?;
    if !meta.is_file() || meta.len() > MAX_FONT {
        return Err("字体文件太大（最多 300 MB）".into());
    }
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let (bytes, kind, name) = prepare(std::fs::read(src).map_err(|e| e.to_string())?, &ext)?;
    let file = format!("font-{}.{kind}", hex::encode(&Sha256::digest(&bytes)[..8]));
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let dest: PathBuf = dir.join(&file);
    if !dest.is_file() {
        std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    }
    // Only one font is in use at a time.
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        if e.path() != dest && e.file_name().to_string_lossy().starts_with("font-") {
            let _ = std::fs::remove_file(e.path());
        }
    }
    let name = name.unwrap_or_else(|| src.file_stem().and_then(|s| s.to_str()).unwrap_or("字体").to_string());
    Ok(ImportedFont { path: dest.to_string_lossy().into_owned(), name })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn be16(v: u16) -> [u8; 2] {
        v.to_be_bytes()
    }

    fn be32(v: u32) -> [u8; 4] {
        v.to_be_bytes()
    }

    /// A "name" table with one Windows English family record.
    fn name_table(family: &str) -> Vec<u8> {
        let text: Vec<u8> = family.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
        let mut t = vec![];
        t.extend(be16(0));
        t.extend(be16(1));
        t.extend(be16(18));
        for v in [3u16, 1, 0x409, 1, text.len() as u16, 0] {
            t.extend(be16(v));
        }
        t.extend(text);
        t
    }

    /// The table directory and tables of a font, placed at `base` in a file.
    fn font(tables: &[(&[u8; 4], Vec<u8>)], base: usize) -> Vec<u8> {
        let mut out = vec![0, 1, 0, 0];
        out.extend(be16(tables.len() as u16));
        out.extend([0; 6]);
        let mut at = base + 12 + 16 * tables.len();
        let mut body = vec![];
        for (tag, data) in tables {
            out.extend(*tag);
            out.extend(be32(checksum(data)));
            out.extend(be32(at as u32));
            out.extend(be32(data.len() as u32));
            body.extend(data);
            body.resize(body.len().div_ceil(4) * 4, 0);
            at = base + 12 + 16 * tables.len() + body.len();
        }
        out.extend(body);
        out
    }

    fn tables(family: &str) -> Vec<(&'static [u8; 4], Vec<u8>)> {
        vec![(b"head", vec![7u8; 54]), (b"name", name_table(family)), (b"glyf", vec![1, 2, 3, 4, 5])]
    }

    #[test]
    fn keeps_single_fonts_and_names_them() {
        let f = font(&tables("Test Sans"), 0);
        let (bytes, kind, name) = prepare(f.clone(), "bin").unwrap();
        assert_eq!(bytes, f);
        assert_eq!(kind, "ttf");
        assert_eq!(name.as_deref(), Some("Test Sans"));
        // Other formats pass through under their own extension.
        let (_, kind, name) = prepare(b"wOF2 some compressed data".to_vec(), "ttf").unwrap();
        assert_eq!((kind.as_str(), name), ("woff2", None));
        let (_, kind, _) = prepare(b"%!PS-AdobeFont-1.0".to_vec(), "pfa").unwrap();
        assert_eq!(kind, "pfa");
        assert!(prepare(vec![1, 2, 3], "ttf").is_err());
    }

    #[test]
    fn takes_the_first_font_out_of_a_collection() {
        // ttcf header for two fonts, then the fonts one after the other.
        let first_at = 12 + 8;
        let first = font(&tables("甲体"), first_at);
        let second_at = first_at + first.len();
        let second = font(&tables("Second"), second_at);
        let mut ttc = b"ttcf".to_vec();
        ttc.extend(be32(0x0001_0000));
        ttc.extend(be32(2));
        ttc.extend(be32(first_at as u32));
        ttc.extend(be32(second_at as u32));
        ttc.extend(&first);
        ttc.extend(&second);

        let (bytes, kind, name) = prepare(ttc, "ttc").unwrap();
        assert_eq!(kind, "ttf");
        assert_eq!(name.as_deref(), Some("甲体"));
        assert!(is_sfnt(&bytes));
        // Every table is where the new directory says, unchanged apart from the
        // file checksum in "head", and the file sums to the magic number.
        let expect = tables("甲体");
        for (i, (tag, data)) in expect.iter().enumerate() {
            let rec = 12 + 16 * i;
            assert_eq!(&bytes[rec..rec + 4], *tag);
            let (off, len) = (u32_at(&bytes, rec + 8).unwrap() as usize, u32_at(&bytes, rec + 12).unwrap() as usize);
            assert_eq!(off % 4, 0);
            assert_eq!(len, data.len());
            if *tag != b"head" {
                assert_eq!(&bytes[off..off + len], &data[..]);
            }
        }
        assert_eq!(checksum(&bytes), 0xB1B0_AFBA);
        // A broken collection is refused rather than copied.
        assert!(prepare(b"ttcf\0\x01\0\0\0\0\0\x01\0\0\xff\xff".to_vec(), "ttc").is_err());
    }

    #[test]
    fn imports_into_the_folder_and_replaces_the_previous_font() {
        let dir = tempfile::tempdir().unwrap();
        let fonts = dir.path().join("fonts");
        let a = dir.path().join("A.ttf");
        std::fs::write(&a, font(&tables("Alpha"), 0)).unwrap();
        let b = dir.path().join("无名.woff2");
        std::fs::write(&b, b"wOF2 some compressed data").unwrap();

        let first = import(&a, &fonts).unwrap();
        assert_eq!(first.name, "Alpha");
        assert!(Path::new(&first.path).is_file());
        let second = import(&b, &fonts).unwrap();
        assert_eq!(second.name, "无名");
        assert!(second.path.ends_with(".woff2"));
        assert!(!Path::new(&first.path).exists());
        assert_eq!(std::fs::read_dir(&fonts).unwrap().count(), 1);
        assert!(import(&dir.path().join("missing.ttf"), &fonts).is_err());
    }
}

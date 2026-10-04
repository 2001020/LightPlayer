//! Experimental NetEase Cloud Music client.
//!
//! NetEase has no public API for third-party players, so this speaks the web
//! client's own protocol ("weapi": AES + RSA wrapped form posts). It can break
//! whenever the site changes, and using it is against NetEase's terms; the UI
//! keeps it off until the user turns it on and says so.
//!
//! Scope: the signed-in user's playlists, liked songs, daily recommendations,
//! search, the stream URL NetEase itself hands out for a song (so VIP songs
//! only play in full for VIP accounts) and lyrics. Nothing is downloaded or
//! decrypted.

use crate::error::{AppError, AppResult};
use base64::Engine;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

/// Media paths of NetEase songs: `netease:<song id>`.
pub const PREFIX: &str = "netease:";

const BASE: &str = "https://music.163.com";
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ------------------------------------------------------------------ weapi

const PRESET_KEY: &[u8; 16] = b"0CoJUm6Qyw8W8jud";
const IV: &[u8; 16] = b"0102030405060708";
const MODULUS: &str = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
const BASE62: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

fn aes_b64(data: &[u8], key: &[u8; 16]) -> String {
    use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
    let ct = cbc::Encryptor::<aes::Aes128>::new(key.into(), IV.into()).encrypt_padded_vec_mut::<Pkcs7>(data);
    base64::engine::general_purpose::STANDARD.encode(ct)
}

/// `params` and `encSecKey` for a weapi request body, with the per-request
/// `secret` (16 base62 characters).
pub fn weapi(json: &str, secret: &[u8; 16]) -> (String, String) {
    let params = aes_b64(aes_b64(json.as_bytes(), PRESET_KEY).as_bytes(), secret);
    // Textbook RSA (no padding) of the reversed secret.
    let mut rev = secret.to_vec();
    rev.reverse();
    let n = BigUint::parse_bytes(MODULUS.as_bytes(), 16).expect("modulus");
    let c = BigUint::from_bytes_be(&rev).modpow(&BigUint::from(0x10001u32), &n);
    (params, format!("{:0>256}", c.to_str_radix(16)))
}

fn random_secret() -> [u8; 16] {
    let mut s = [0u8; 16];
    for b in &mut s {
        *b = BASE62[rand::random::<usize>() % BASE62.len()];
    }
    s
}

// ------------------------------------------------------------------ models

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: u64,
    pub name: String,
    pub artists: Vec<String>,
    pub album: String,
    pub cover: Option<String>,
    /// Seconds.
    pub duration: f64,
    /// Needs a VIP account for the full song.
    pub vip: bool,
    /// Greyed out on NetEase (no copyright / taken down).
    pub unavailable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: u64,
    pub name: String,
    pub count: u64,
    pub cover: Option<String>,
    /// Created by the user (otherwise saved from someone else).
    pub mine: bool,
    /// The "liked songs" playlist.
    pub liked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: u64,
    pub nickname: String,
    pub avatar: Option<String>,
    pub vip: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrStart {
    pub key: String,
    /// The QR code as an SVG document.
    pub svg: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrState {
    /// 800 expired, 801 waiting for a scan, 802 scanned, 803 signed in.
    pub code: i64,
    pub message: String,
}

/// The stream NetEase gives out for a song.
pub struct Stream {
    pub url: String,
    /// Only a preview clip (VIP song on a non-VIP account).
    pub trial: bool,
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_string()
}

fn https(url: Option<&str>) -> Option<String> {
    url.filter(|u| !u.is_empty()).map(|u| u.replacen("http://", "https://", 1))
}

/// A song object from any endpoint (`ar`/`al`/`dt` or the older
/// `artists`/`album`/`duration`), with its privilege record when known.
pub fn parse_song(v: &Value, privilege: Option<&Value>) -> Option<Song> {
    let id = v["id"].as_u64()?;
    let artists = v.get("ar").or_else(|| v.get("artists")).and_then(|a| a.as_array()).cloned().unwrap_or_default();
    let album = v.get("al").or_else(|| v.get("album")).cloned().unwrap_or(Value::Null);
    let ms = v.get("dt").or_else(|| v.get("duration")).and_then(|d| d.as_f64()).unwrap_or(0.0);
    let privilege = privilege.or_else(|| v.get("privilege")).filter(|p| p.is_object());
    let fee = v["fee"].as_i64().or_else(|| privilege.and_then(|p| p["fee"].as_i64())).unwrap_or(0);
    let st = privilege.and_then(|p| p["st"].as_i64()).unwrap_or(0);
    Some(Song {
        id,
        name: s(&v["name"]),
        artists: artists.iter().map(|a| s(&a["name"])).filter(|n| !n.is_empty()).collect(),
        album: s(&album["name"]),
        cover: https(album["picUrl"].as_str()),
        duration: ms / 1000.0,
        vip: fee == 1 || fee == 4,
        unavailable: st < 0 || v["noCopyrightRcmd"].is_object(),
    })
}

fn parse_songs(songs: &Value, privileges: Option<&Value>) -> Vec<Song> {
    let privs: HashMap<u64, &Value> = privileges
        .and_then(|p| p.as_array())
        .map(|a| a.iter().filter_map(|p| Some((p["id"].as_u64()?, p))).collect())
        .unwrap_or_default();
    songs
        .as_array()
        .map(|a| a.iter().filter_map(|v| parse_song(v, v["id"].as_u64().and_then(|id| privs.get(&id).copied()))).collect())
        .unwrap_or_default()
}

fn api_error(v: &Value) -> AppError {
    let code = v["code"].as_i64().unwrap_or(0);
    let msg = v["message"].as_str().or_else(|| v["msg"].as_str()).unwrap_or("");
    AppError::msg(match code {
        301 => "网易云音乐登录已失效，请重新登录".to_string(),
        -460 | 8821 => "网易云音乐要求安全验证（可能被风控），请稍后再试，或改用 Cookie 登录".to_string(),
        _ if msg.is_empty() => format!("网易云音乐返回错误（{code}）"),
        _ => format!("网易云音乐：{msg}"),
    })
}

fn ok(v: Value) -> AppResult<Value> {
    if v["code"].as_i64() == Some(200) {
        Ok(v)
    } else {
        Err(api_error(&v))
    }
}

// ------------------------------------------------------------------ client

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct Session {
    cookies: BTreeMap<String, String>,
    device: String,
}

pub struct Netease {
    http: reqwest::Client,
    file: PathBuf,
    session: Mutex<Session>,
    /// Songs seen in lists, for playing them without another lookup.
    songs: Mutex<HashMap<u64, Song>>,
}

impl Netease {
    pub fn new(data_dir: &Path) -> Self {
        let file = data_dir.join("netease.json");
        let mut session: Session = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        if session.device.is_empty() {
            session.device = format!("{:032x}", rand::random::<u128>());
        }
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .user_agent(UA)
            .build()
            .expect("http client");
        Netease { http, file, session: Mutex::new(session), songs: Mutex::new(HashMap::new()) }
    }

    pub fn signed_in(&self) -> bool {
        self.session.lock().unwrap().cookies.contains_key("MUSIC_U")
    }

    fn save(&self) {
        let s = self.session.lock().unwrap().clone();
        if let Ok(b) = serde_json::to_vec(&s) {
            let _ = std::fs::write(&self.file, b);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&self.file, std::fs::Permissions::from_mode(0o600));
            }
        }
    }

    fn cookie_header(&self) -> String {
        let s = self.session.lock().unwrap();
        let mut parts = vec![
            "os=pc".to_string(),
            "appver=2.10.13".to_string(),
            "__remember_me=true".to_string(),
            format!("_ntes_nuid={}", s.device),
        ];
        parts.extend(s.cookies.iter().map(|(k, v)| format!("{k}={v}")));
        parts.join("; ")
    }

    fn take_cookies(&self, headers: &reqwest::header::HeaderMap) {
        let mut changed = false;
        {
            let mut s = self.session.lock().unwrap();
            for h in headers.get_all(reqwest::header::SET_COOKIE) {
                let Ok(h) = h.to_str() else { continue };
                let Some((k, v)) = h.split(';').next().and_then(|kv| kv.split_once('=')) else { continue };
                let (k, v) = (k.trim(), v.trim());
                if k.is_empty() {
                    continue;
                }
                // Expired cookies (sign-out) come back empty.
                if v.is_empty() || v.eq_ignore_ascii_case("deleted") {
                    changed |= s.cookies.remove(k).is_some();
                } else if s.cookies.get(k).map(String::as_str) != Some(v) {
                    s.cookies.insert(k.to_string(), v.to_string());
                    changed = true;
                }
            }
        }
        if changed {
            self.save();
        }
    }

    async fn call(&self, path: &str, mut data: Value) -> AppResult<Value> {
        let csrf = self.session.lock().unwrap().cookies.get("__csrf").cloned().unwrap_or_default();
        data["csrf_token"] = Value::String(csrf.clone());
        let (params, key) = weapi(&data.to_string(), &random_secret());
        let resp = self
            .http
            .post(format!("{BASE}/weapi/{path}?csrf_token={csrf}"))
            .header("Referer", BASE)
            .header("Origin", BASE)
            .header("Cookie", self.cookie_header())
            .form(&[("params", params), ("encSecKey", key)])
            .send()
            .await?;
        self.take_cookies(resp.headers());
        let status = resp.status();
        let body = resp.bytes().await?;
        serde_json::from_slice(&body).map_err(|_| AppError::msg(format!("网易云音乐返回了无法识别的内容（HTTP {status}）")))
    }

    fn remember(&self, songs: &[Song]) {
        let mut map = self.songs.lock().unwrap();
        for s in songs {
            map.insert(s.id, s.clone());
        }
    }

    // -------------------------------------------------------------- account

    pub async fn qr_start(&self) -> AppResult<QrStart> {
        let v = ok(self.call("login/qrcode/unikey", json!({ "type": 1 })).await?)?;
        let key = s(&v["unikey"]);
        if key.is_empty() {
            return Err(AppError::msg("没有拿到登录二维码"));
        }
        let code = qrcode::QrCode::new(format!("{BASE}/login?codekey={key}")).map_err(|e| AppError::msg(e.to_string()))?;
        let svg = code
            .render::<qrcode::render::svg::Color>()
            .min_dimensions(220, 220)
            .quiet_zone(true)
            .build();
        Ok(QrStart { key, svg })
    }

    pub async fn qr_check(&self, key: &str) -> AppResult<QrState> {
        let v = self.call("login/qrcode/client/login", json!({ "key": key, "type": 1 })).await?;
        let code = v["code"].as_i64().unwrap_or(0);
        if !(800..=803).contains(&code) {
            return Err(api_error(&v));
        }
        Ok(QrState { code, message: s(&v["message"]) })
    }

    /// Signs in with cookies copied from a browser (`MUSIC_U=...; __csrf=...`,
    /// or just the MUSIC_U value).
    pub async fn set_cookie(&self, text: &str) -> AppResult<Account> {
        let text = text.trim().trim_start_matches("Cookie:").trim();
        let mut found = BTreeMap::new();
        if text.contains('=') {
            for kv in text.split(';') {
                if let Some((k, v)) = kv.split_once('=') {
                    let (k, v) = (k.trim(), v.trim());
                    if matches!(k, "MUSIC_U" | "__csrf" | "NMTID" | "MUSIC_A_T" | "MUSIC_R_T") && !v.is_empty() {
                        found.insert(k.to_string(), v.to_string());
                    }
                }
            }
        } else if !text.is_empty() {
            found.insert("MUSIC_U".to_string(), text.to_string());
        }
        if !found.contains_key("MUSIC_U") {
            return Err(AppError::msg("没有找到 MUSIC_U，请检查粘贴的内容"));
        }
        self.session.lock().unwrap().cookies.extend(found);
        self.save();
        match self.account().await? {
            Some(a) => Ok(a),
            None => {
                self.logout();
                Err(AppError::msg("这个 Cookie 无效或已过期"))
            }
        }
    }

    pub async fn account(&self) -> AppResult<Option<Account>> {
        if !self.signed_in() {
            return Ok(None);
        }
        let v = ok(self.call("nuser/account/get", json!({})).await?)?;
        let p = &v["profile"];
        let Some(id) = p["userId"].as_u64() else { return Ok(None) };
        Ok(Some(Account {
            id,
            nickname: s(&p["nickname"]),
            avatar: https(p["avatarUrl"].as_str()),
            vip: v["account"]["vipType"].as_i64().unwrap_or(0) > 0,
        }))
    }

    pub fn logout(&self) {
        self.session.lock().unwrap().cookies.clear();
        self.save();
    }

    // -------------------------------------------------------------- music

    pub async fn playlists(&self) -> AppResult<Vec<Playlist>> {
        let Some(me) = self.account().await? else {
            return Err(AppError::msg("请先登录网易云音乐"));
        };
        let v = ok(self.call("user/playlist", json!({ "uid": me.id, "limit": 1000, "offset": 0, "includeVideo": true })).await?)?;
        Ok(v["playlist"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|p| {
                        Some(Playlist {
                            id: p["id"].as_u64()?,
                            name: s(&p["name"]),
                            count: p["trackCount"].as_u64().unwrap_or(0),
                            cover: https(p["coverImgUrl"].as_str()),
                            mine: p["creator"]["userId"].as_u64() == Some(me.id),
                            liked: p["specialType"].as_i64() == Some(5),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    async fn song_details(&self, ids: &[u64]) -> AppResult<Vec<Song>> {
        let mut out = Vec::with_capacity(ids.len());
        for chunk in ids.chunks(400) {
            let c: Vec<Value> = chunk.iter().map(|id| json!({ "id": id })).collect();
            let v = ok(self.call("v3/song/detail", json!({ "c": Value::Array(c).to_string() })).await?)?;
            out.extend(parse_songs(&v["songs"], v.get("privileges")));
        }
        self.remember(&out);
        Ok(out)
    }

    pub async fn playlist_songs(&self, id: u64) -> AppResult<Vec<Song>> {
        let v = ok(self.call("v6/playlist/detail", json!({ "id": id, "n": 100000, "s": 8 })).await?)?;
        let ids: Vec<u64> = v["playlist"]["trackIds"]
            .as_array()
            .map(|a| a.iter().filter_map(|t| t["id"].as_u64()).collect())
            .unwrap_or_default();
        if ids.is_empty() {
            let songs = parse_songs(&v["playlist"]["tracks"], v.get("privileges"));
            self.remember(&songs);
            return Ok(songs);
        }
        self.song_details(&ids).await
    }

    pub async fn daily(&self) -> AppResult<Vec<Song>> {
        let v = ok(self.call("v3/discovery/recommend/songs", json!({})).await?)?;
        let songs = parse_songs(&v["data"]["dailySongs"], None);
        self.remember(&songs);
        Ok(songs)
    }

    pub async fn search(&self, query: &str) -> AppResult<Vec<Song>> {
        let v = ok(self.call("cloudsearch/get/web", json!({ "s": query, "type": 1, "limit": 60, "offset": 0 })).await?)?;
        let songs = parse_songs(&v["result"]["songs"], None);
        self.remember(&songs);
        Ok(songs)
    }

    pub async fn song(&self, id: u64) -> AppResult<Song> {
        if let Some(s) = self.songs.lock().unwrap().get(&id) {
            return Ok(s.clone());
        }
        self.song_details(&[id]).await?.into_iter().next().ok_or_else(|| AppError::msg("找不到这首歌"))
    }

    /// `level`: standard / higher / exhigh / lossless / hires.
    pub async fn stream(&self, id: u64, level: &str) -> AppResult<Stream> {
        let v = ok(self
            .call("song/enhance/player/url/v1", json!({ "ids": format!("[{id}]"), "level": level, "encodeType": "flac" }))
            .await?)?;
        let d = &v["data"][0];
        match https(d["url"].as_str()) {
            Some(url) => Ok(Stream { url, trial: d["freeTrialInfo"].is_object() }),
            None if !self.signed_in() => Err(AppError::msg("需要登录网易云音乐才能播放这首歌")),
            None => Err(AppError::msg("这首歌暂时无法播放（可能需要会员、需要购买或已下架）")),
        }
    }

    /// LRC with the translation lines (same timestamps) appended.
    pub async fn lyrics(&self, id: u64) -> AppResult<Option<String>> {
        let resp = self
            .http
            .get(format!("{BASE}/api/song/lyric?id={id}&lv=-1&tv=-1"))
            .header("Referer", BASE)
            .header("Cookie", self.cookie_header())
            .send()
            .await?;
        let v: Value = serde_json::from_slice(&resp.bytes().await?)?;
        let lrc = v["lrc"]["lyric"].as_str().unwrap_or("").trim();
        if lrc.is_empty() {
            return Ok(None);
        }
        let tr = v["tlyric"]["lyric"].as_str().unwrap_or("").trim();
        Ok(Some(if tr.is_empty() { lrc.to_string() } else { format!("{lrc}\n{tr}\n") }))
    }
}

/// The song id in a `netease:<id>` path.
pub fn song_id(path: &str) -> Option<u64> {
    path.strip_prefix(PREFIX)?.parse().ok()
}

/// Hosts the media server may fetch for the WebView (audio and image CDNs).
pub fn allowed_remote(url: &str) -> bool {
    let Ok(u) = reqwest::Url::parse(url) else { return false };
    if u.scheme() != "https" && u.scheme() != "http" {
        return false;
    }
    let host = u.host_str().unwrap_or("");
    if cfg!(test) && host == "127.0.0.1" {
        return true;
    }
    ["126.net", "127.net", "163.com", "netease.com"].iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weapi_matches_reference() {
        // Reference values from an independent implementation (openssl + Python pow).
        let (params, key) = weapi(r#"{"id":1}"#, b"abcdefghijklmnop");
        assert_eq!(params, include_str!("../tests/netease_params.txt").trim());
        assert_eq!(key, include_str!("../tests/netease_enckey.txt").trim());
        assert_eq!(key.len(), 256);
    }

    #[test]
    fn parses_songs_from_both_shapes() {
        let v: Value = serde_json::from_str(
            r#"{"id":5,"name":"晴天","ar":[{"name":"周杰伦"}],"al":{"name":"叶惠美","picUrl":"http://p1.music.126.net/x.jpg"},"dt":269000,"fee":1}"#,
        )
        .unwrap();
        let p: Value = serde_json::from_str(r#"{"id":5,"st":0,"fee":1}"#).unwrap();
        let s = parse_song(&v, Some(&p)).unwrap();
        assert_eq!((s.id, s.name.as_str(), s.artists[0].as_str(), s.album.as_str()), (5, "晴天", "周杰伦", "叶惠美"));
        assert_eq!(s.cover.as_deref(), Some("https://p1.music.126.net/x.jpg"));
        assert!((s.duration - 269.0).abs() < 1e-9 && s.vip && !s.unavailable);
        let old: Value = serde_json::from_str(r#"{"id":6,"name":"a","artists":[{"name":"b"}],"album":{"name":"c"},"duration":1000,"privilege":{"st":-200}}"#).unwrap();
        let s = parse_song(&old, None).unwrap();
        assert_eq!((s.artists[0].as_str(), s.album.as_str(), s.unavailable), ("b", "c", true));
    }

    #[test]
    fn remote_hosts() {
        assert!(allowed_remote("https://m701.music.126.net/a.mp3"));
        assert!(allowed_remote("https://p2.music.126.net/a.jpg?param=64y64"));
        assert!(!allowed_remote("https://evil.example/126.net"));
        assert!(!allowed_remote("file:///etc/passwd"));
        assert_eq!(song_id("netease:123"), Some(123));
        assert_eq!(song_id("/music/a.mp3"), None);
    }
}

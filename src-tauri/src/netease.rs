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
const PC_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.0.18.203152";

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

const EAPI_KEY: &[u8; 16] = b"e82ckenh8dichen8";

/// `params` for an eapi request (the desktop client's protocol): `path` is
/// the `/api/...` path, `json` the request body.
pub fn eapi(path: &str, json: &str) -> String {
    use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyInit};
    use md5::{Digest, Md5};
    let digest = hex::encode(Md5::digest(format!("nobody{path}use{json}md5forencrypt").as_bytes()));
    let data = format!("{path}-36cd479b6b5-{json}-36cd479b6b5-{digest}");
    let ct = ecb::Encryptor::<aes::Aes128>::new(EAPI_KEY.into()).encrypt_padded_vec_mut::<Pkcs7>(data.as_bytes());
    hex::encode_upper(ct)
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
#[derive(Debug, Clone)]
pub struct Stream {
    pub url: String,
    /// Only a preview clip (VIP song on a non-VIP account).
    pub trial: bool,
    /// Why only a preview, for the user.
    pub notice: Option<String>,
    /// The quality NetEase actually gave ("standard", "exhigh", "lossless", "hires"...).
    pub level: Option<String>,
    /// Bit rate in kbit/s.
    pub kbps: Option<u32>,
}

/// One entry of a song/enhance/player/url answer.
fn stream_entry(v: &Value) -> Option<Stream> {
    if v["code"].as_i64() != Some(200) {
        return None;
    }
    let d = &v["data"][0];
    let url = https(d["url"].as_str())?;
    Some(Stream {
        url,
        trial: d["freeTrialInfo"].is_object(),
        notice: None,
        level: d["level"].as_str().filter(|l| !l.is_empty()).map(str::to_string),
        kbps: d["br"].as_u64().filter(|&b| b > 0).map(|b| ((b + 500) / 1000) as u32),
    })
}

/// Why NetEase gave no (full) stream, from its answer and the account.
pub fn explain(d: &Value, signed_in: bool, vip: Option<bool>) -> String {
    let code = d["code"].as_i64().unwrap_or(0);
    let fee = d["fee"].as_i64().unwrap_or(-1);
    let why = if !signed_in {
        "需要登录网易云音乐才能播放这首歌".to_string()
    } else if fee == 4 {
        "这首歌属于付费专辑，需要在网易云音乐单独购买".to_string()
    } else if fee == 1 && vip == Some(false) {
        "这首歌需要网易云音乐会员，当前账号不是会员".to_string()
    } else if fee == 1 && vip == Some(true) {
        "账号是会员，但网易云音乐没有给出完整的播放地址（可能是地区版权限制或风控）".to_string()
    } else if fee == 1 {
        "这首歌需要网易云音乐会员".to_string()
    } else if code == 404 || code == -110 {
        "网易云音乐暂无这首歌的版权，或在当前网络所在的地区不能播放".to_string()
    } else {
        "这首歌暂时无法播放".to_string()
    };
    format!("{why}（网易云返回 code={code}，fee={fee}）")
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
    /// VIP state of the signed-in account, once known.
    vip: Mutex<Option<bool>>,
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
        Netease { http, file, session: Mutex::new(session), vip: Mutex::new(None), songs: Mutex::new(HashMap::new()) }
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

    /// A request the way the desktop client makes it (eapi). Used for stream
    /// URLs, where it is more reliable for VIP songs and higher qualities.
    async fn call_eapi(&self, path: &str, mut data: Value) -> AppResult<Value> {
        let header = {
            let s = self.session.lock().unwrap();
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            let mut h = BTreeMap::new();
            h.insert("osver", "Microsoft-Windows-10-Professional-build-22631-64bit".to_string());
            h.insert("deviceId", s.device.clone());
            h.insert("os", "pc".to_string());
            h.insert("appver", "3.0.18.203152".to_string());
            h.insert("versioncode", "140".to_string());
            h.insert("mobilename", String::new());
            h.insert("buildver", now.as_secs().to_string());
            h.insert("resolution", "1920x1080".to_string());
            h.insert("__csrf", s.cookies.get("__csrf").cloned().unwrap_or_default());
            h.insert("channel", "netease".to_string());
            h.insert("requestId", format!("{}_{:04}", now.as_millis(), rand::random::<u16>() % 1000));
            if let Some(u) = s.cookies.get("MUSIC_U") {
                h.insert("MUSIC_U", u.clone());
            }
            h
        };
        let cookie = header
            .iter()
            .map(|(k, v)| format!("{}={}", crate::server::urlencode(k), crate::server::urlencode(v)))
            .collect::<Vec<_>>()
            .join("; ");
        data["header"] = serde_json::to_value(&header)?;
        let params = eapi(path, &data.to_string());
        let resp = self
            .http
            .post(format!("https://interface.music.163.com/eapi/{}", path.trim_start_matches("/api/")))
            .header("User-Agent", PC_UA)
            .header("Cookie", cookie)
            .form(&[("params", params)])
            .send()
            .await?;
        let status = resp.status();
        let body = resp.bytes().await?;
        serde_json::from_slice(&body).map_err(|_| AppError::msg(format!("网易云音乐电脑端接口返回了无法识别的内容（HTTP {status}）")))
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
        let vip = v["account"]["vipType"].as_i64().unwrap_or(0) > 0 || p["vipType"].as_i64().unwrap_or(0) > 0;
        *self.vip.lock().unwrap() = Some(vip);
        Ok(Some(Account { id, nickname: s(&p["nickname"]), avatar: https(p["avatarUrl"].as_str()), vip }))
    }

    pub fn logout(&self) {
        self.session.lock().unwrap().cookies.clear();
        *self.vip.lock().unwrap() = None;
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

    /// `level`: standard / higher / exhigh / lossless / hires. Asks the
    /// desktop client's endpoint first and the web one if that gives no full
    /// song; a preview clip is the last resort.
    pub async fn stream(&self, id: u64, level: &str) -> AppResult<Stream> {
        let data = json!({ "ids": format!("[{id}]"), "level": level, "encodeType": "flac" });
        let pc = self.call_eapi("/api/song/enhance/player/url/v1", data.clone()).await;
        let pc_entry = pc.as_ref().ok().and_then(stream_entry);
        if let Some(s) = pc_entry.as_ref().filter(|s| !s.trial) {
            return Ok(s.clone());
        }
        let web = self.call("song/enhance/player/url/v1", data).await;
        let web_entry = web.as_ref().ok().and_then(stream_entry);
        if let Some(s) = web_entry.as_ref().filter(|s| !s.trial) {
            return Ok(s.clone());
        }
        let answer = pc.as_ref().ok().filter(|v| v["code"].as_i64() == Some(200)).or(web.as_ref().ok()).map(|v| v["data"][0].clone()).unwrap_or(Value::Null);
        let vip = *self.vip.lock().unwrap();
        if let Some(s) = pc_entry.or(web_entry) {
            let why = explain(&answer, self.signed_in(), vip);
            return Ok(Stream { notice: Some(format!("只能试听片段：{why}")), ..s });
        }
        // Neither gave anything: say why, including a failed request.
        let mut msg = explain(&answer, self.signed_in(), vip);
        for (name, r) in [("电脑端接口", &pc), ("网页接口", &web)] {
            match r {
                Err(e) => msg.push_str(&format!("；{name}：{e}")),
                Ok(v) if v["code"].as_i64() != Some(200) => msg.push_str(&format!("；{name}：{}", api_error(v))),
                _ => {}
            }
        }
        Err(AppError::msg(msg))
    }

    /// Saves a stream to `dest`, for decoding into the exact-seeking copy the
    /// player switches to (WebKit lands off when jumping in a remote stream).
    pub async fn fetch_stream(&self, url: &str, dest: &Path) -> AppResult<()> {
        use tokio::io::AsyncWriteExt;
        if !allowed_remote(url) {
            return Err(AppError::msg("不支持的音频地址"));
        }
        let mut resp = self.http.get(url).header("Referer", BASE).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::msg(format!("下载音频失败：HTTP {}", resp.status().as_u16())));
        }
        let mut f = tokio::fs::File::create(dest).await?;
        let mut total = 0u64;
        while let Some(chunk) = resp.chunk().await? {
            total += chunk.len() as u64;
            if total > 1 << 30 {
                drop(f);
                let _ = tokio::fs::remove_file(dest).await;
                return Err(AppError::msg("音频文件过大"));
            }
            f.write_all(&chunk).await?;
        }
        f.flush().await?;
        Ok(())
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
    fn eapi_matches_reference() {
        let p = eapi("/api/song/enhance/player/url/v1", r#"{"ids":"[1]","level":"exhigh"}"#);
        assert_eq!(p, include_str!("../tests/netease_eapi.txt").trim());
    }

    #[tokio::test]
    async fn fetches_and_decodes_a_stream_exactly() {
        use std::io::{Read, Write};
        let dir = tempfile::tempdir().unwrap();
        let mp3 = dir.path().join("s.mp3");
        let ok = crate::tools::command(&crate::tools::tools().ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "libmp3lame", "-b:a", "320k"])
            .arg(&mp3)
            .status()
            .await
            .is_ok_and(|s| s.success());
        if !ok {
            return; // No ffmpeg with an MP3 encoder here.
        }
        let body = std::fs::read(&mp3).unwrap();
        // A one-request HTTP server standing in for the CDN.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let served = body.clone();
        std::thread::spawn(move || {
            let (mut c, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let _ = c.read(&mut buf);
            let _ = write!(c, "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", served.len());
            let _ = c.write_all(&served);
        });
        let ne = Netease::new(dir.path());
        let got = dir.path().join("got.download");
        ne.fetch_stream(&format!("http://127.0.0.1:{port}/a.mp3"), &got).await.unwrap();
        assert_eq!(std::fs::read(&got).unwrap(), body);
        let probe = crate::media::probe::probe(&got).await.unwrap();
        let wav = dir.path().join("out.wav");
        crate::media::transcode::decode_wav(&got, &probe, &wav).await.unwrap();
        let p = crate::media::probe::probe(&wav).await.unwrap();
        assert!((p.duration().unwrap() - 3.0).abs() < 0.1, "{:?}", p.duration());
        assert!(ne.fetch_stream("https://example.com/a.mp3", &got).await.is_err());
    }

    #[test]
    fn reads_stream_quality() {
        let v = json!({ "code": 200, "data": [{ "url": "http://m701.music.126.net/a.flac", "level": "lossless", "br": 925_000 }] });
        let s = stream_entry(&v).unwrap();
        assert_eq!(s.url, "https://m701.music.126.net/a.flac");
        assert_eq!((s.level.as_deref(), s.kbps, s.trial), (Some("lossless"), Some(925), false));
        let t = json!({ "code": 200, "data": [{ "url": "https://x.126.net/b.mp3", "freeTrialInfo": { "start": 0 }, "br": 0 }] });
        let s = stream_entry(&t).unwrap();
        assert!(s.trial && s.kbps.is_none() && s.level.is_none());
        assert!(stream_entry(&json!({ "code": 200, "data": [{ "url": null }] })).is_none());
    }

    #[test]
    fn explains_missing_streams() {
        let d = |code: i64, fee: i64| json!({ "code": code, "fee": fee });
        assert!(explain(&d(200, 4), true, Some(true)).contains("付费专辑"));
        assert!(explain(&d(200, 1), true, Some(false)).contains("不是会员"));
        assert!(explain(&d(200, 1), true, Some(true)).contains("账号是会员"));
        assert!(explain(&d(404, 0), true, None).contains("版权"));
        assert!(explain(&d(200, 1), false, None).contains("登录"));
        assert!(explain(&d(404, 8), true, None).ends_with("（网易云返回 code=404，fee=8）"));
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

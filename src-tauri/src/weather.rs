//! Weather theme data: where the user is and what the sky looks like there.
//!
//! Location comes from the system location service (CoreLocation on macOS)
//! and falls back to a coarse IP lookup. Weather, city search and reverse
//! geocoding use free services that need no account or API key:
//! Open-Meteo (forecast, city search), BigDataCloud (place names),
//! GeoJS / ipwho.is (IP location).

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The UI language's code for place names ("zh", "en", "ja", "ko").
static PLACE_LANG: RwLock<&'static str> = RwLock::new("zh");

/// Place names follow the UI language (`zh-Hans`, `en`, …).
pub fn set_language(ui: &str) {
    let code = match ui {
        "en" => "en",
        "ja" => "ja",
        "ko" => "ko",
        _ => "zh",
    };
    *PLACE_LANG.write().unwrap() = code;
}

fn place_lang() -> &'static str {
    *PLACE_LANG.read().unwrap()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub lat: f64,
    pub lon: f64,
    /// "gps" (system location service) or "ip" (coarse network location).
    pub source: String,
    /// City name when the provider knows it.
    pub name: Option<String>,
    /// Why the precise location was not used, for the settings page.
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WeatherReport {
    pub place: String,
    pub lat: f64,
    pub lon: f64,
    /// WMO weather interpretation code.
    pub code: i32,
    pub temperature: f64,
    pub apparent: f64,
    pub humidity: f64,
    pub is_day: bool,
    pub cloud_cover: f64,
    pub precipitation: f64,
    pub wind_speed: f64,
    pub wind_direction: f64,
    pub high: Option<f64>,
    pub low: Option<f64>,
    /// Unix seconds.
    pub sunrise: Option<i64>,
    pub sunset: Option<i64>,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CityHit {
    pub name: String,
    /// Province / state and country, for telling same-named places apart.
    pub region: String,
    pub lat: f64,
    pub lon: f64,
}

fn client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(12))
        .user_agent(concat!("LightPlayer/", env!("CARGO_PKG_VERSION")))
        .build()?)
}

async fn get_json<T: for<'de> Deserialize<'de>>(client: &reqwest::Client, url: &str) -> AppResult<T> {
    let resp = client.get(url).send().await?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::msg(format!("天气服务返回 HTTP {status}")));
    }
    let body = resp.bytes().await?;
    Ok(serde_json::from_slice(&body)?)
}

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

// ------------------------------------------------------------------ location

#[derive(Deserialize)]
struct GeoJs {
    latitude: String,
    longitude: String,
    city: Option<String>,
}

#[derive(Deserialize)]
struct IpWho {
    success: Option<bool>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    city: Option<String>,
}

async fn ip_locate(client: &reqwest::Client) -> AppResult<Place> {
    let place = |lat: f64, lon: f64, name: Option<String>| Place { lat, lon, source: "ip".into(), name, note: None };
    match get_json::<GeoJs>(client, "https://get.geojs.io/v1/ip/geo.json").await {
        Ok(g) => {
            if let (Ok(lat), Ok(lon)) = (g.latitude.parse::<f64>(), g.longitude.parse::<f64>()) {
                return Ok(place(lat, lon, g.city.filter(|c| !c.is_empty())));
            }
        }
        Err(e) => log::warn!("geojs: {e}"),
    }
    let w: IpWho = get_json(client, "https://ipwho.is/").await?;
    match (w.success.unwrap_or(true), w.latitude, w.longitude) {
        (true, Some(lat), Some(lon)) => Ok(place(lat, lon, w.city.filter(|c| !c.is_empty()))),
        _ => Err(AppError::msg("无法通过网络确定大致位置")),
    }
}

/// The user's position: the system location service first, then the IP.
pub async fn locate(app: &tauri::AppHandle) -> AppResult<Place> {
    #[cfg(target_os = "macos")]
    let note = match crate::location_macos::locate(app, Duration::from_secs(20)).await {
        Ok((lat, lon)) => return Ok(Place { lat, lon, source: "gps".into(), name: None, note: None }),
        Err(e) => {
            log::warn!("CoreLocation: {e}");
            Some(e)
        }
    };
    #[cfg(not(target_os = "macos"))]
    let note = {
        let _ = app;
        Some("此系统不支持定位服务".to_string())
    };
    let mut p = ip_locate(&client()?).await?;
    p.note = note;
    Ok(p)
}

// ------------------------------------------------------------------ weather

#[derive(Deserialize)]
struct Forecast {
    utc_offset_seconds: Option<i64>,
    current: Current,
    daily: Option<Daily>,
}

#[derive(Deserialize)]
struct Current {
    temperature_2m: f64,
    apparent_temperature: Option<f64>,
    relative_humidity_2m: Option<f64>,
    is_day: Option<i32>,
    weather_code: i32,
    cloud_cover: Option<f64>,
    precipitation: Option<f64>,
    wind_speed_10m: Option<f64>,
    wind_direction_10m: Option<f64>,
}

#[derive(Deserialize)]
struct Daily {
    temperature_2m_max: Option<Vec<Option<f64>>>,
    temperature_2m_min: Option<Vec<Option<f64>>>,
    sunrise: Option<Vec<Option<String>>>,
    sunset: Option<Vec<Option<String>>>,
}

/// Days since 1970-01-01 for a proleptic Gregorian date.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// "2026-10-01T06:03" in the place's local time to Unix seconds.
fn local_iso_to_unix(s: &str, utc_offset: i64) -> Option<i64> {
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-').map(|x| x.parse::<i64>().ok());
    let (y, mo, da) = (d.next()??, d.next()??, d.next()??);
    let mut t = time.split(':').map(|x| x.parse::<i64>().ok());
    let (h, mi) = (t.next()??, t.next().flatten().unwrap_or(0));
    Some(days_from_civil(y, mo, da) * 86400 + h * 3600 + mi * 60 - utc_offset)
}

fn first<T: Clone>(v: &Option<Vec<Option<T>>>) -> Option<T> {
    v.as_ref().and_then(|v| v.first().cloned().flatten())
}

fn parse_forecast(body: &[u8], lat: f64, lon: f64, place: String, fetched_at: i64) -> AppResult<WeatherReport> {
    let f: Forecast = serde_json::from_slice(body)?;
    let off = f.utc_offset_seconds.unwrap_or(0);
    let c = f.current;
    let daily = f.daily.as_ref();
    let sun = |v: Option<&Option<Vec<Option<String>>>>| v.and_then(first).and_then(|s| local_iso_to_unix(&s, off));
    Ok(WeatherReport {
        place,
        lat,
        lon,
        code: c.weather_code,
        temperature: c.temperature_2m,
        apparent: c.apparent_temperature.unwrap_or(c.temperature_2m),
        humidity: c.relative_humidity_2m.unwrap_or(0.0),
        is_day: c.is_day.unwrap_or(1) != 0,
        cloud_cover: c.cloud_cover.unwrap_or(0.0),
        precipitation: c.precipitation.unwrap_or(0.0),
        wind_speed: c.wind_speed_10m.unwrap_or(0.0),
        wind_direction: c.wind_direction_10m.unwrap_or(0.0),
        high: daily.and_then(|d| first(&d.temperature_2m_max)),
        low: daily.and_then(|d| first(&d.temperature_2m_min)),
        sunrise: sun(daily.map(|d| &d.sunrise)),
        sunset: sun(daily.map(|d| &d.sunset)),
        fetched_at,
    })
}

#[derive(Deserialize)]
struct Reverse {
    city: Option<String>,
    locality: Option<String>,
    #[serde(rename = "principalSubdivision")]
    subdivision: Option<String>,
}

async fn place_name(client: &reqwest::Client, lat: f64, lon: f64) -> Option<String> {
    let url = format!(
        "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage={}",
        place_lang()
    );
    let r: Reverse = get_json(client, &url).await.map_err(|e| log::warn!("reverse geocode: {e}")).ok()?;
    [r.city, r.locality, r.subdivision].into_iter().flatten().find(|s| !s.trim().is_empty())
}

pub async fn fetch(lat: f64, lon: f64, name: Option<String>) -> AppResult<WeatherReport> {
    let client = client()?;
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat:.4}&longitude={lon:.4}\
         &current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m\
         &daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1"
    );
    let forecast = async {
        let resp = client.get(&url).send().await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(AppError::msg(format!("天气服务返回 HTTP {status}")));
        }
        Ok(resp.bytes().await?)
    };
    let named = async {
        match name.filter(|n| !n.trim().is_empty()) {
            Some(n) => Some(n),
            None => place_name(&client, lat, lon).await,
        }
    };
    let (body, place) = futures_util::join!(forecast, named);
    parse_forecast(&body?, lat, lon, place.unwrap_or_else(|| "当前位置".into()), now_secs())
}

// ------------------------------------------------------------------ city search

#[derive(Deserialize)]
struct Search {
    results: Option<Vec<SearchHit>>,
}

#[derive(Deserialize)]
struct SearchHit {
    name: String,
    latitude: f64,
    longitude: f64,
    admin1: Option<String>,
    country: Option<String>,
}

fn parse_search(body: &[u8]) -> AppResult<Vec<CityHit>> {
    let s: Search = serde_json::from_slice(body)?;
    Ok(s.results
        .unwrap_or_default()
        .into_iter()
        .map(|h| {
            let region = [h.admin1, h.country].into_iter().flatten().filter(|x| !x.is_empty() && *x != h.name).collect::<Vec<_>>();
            CityHit { name: h.name, region: region.join("，"), lat: h.latitude, lon: h.longitude }
        })
        .collect())
}

pub async fn search(query: &str) -> AppResult<Vec<CityHit>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let client = client()?;
    let mut url = reqwest::Url::parse("https://geocoding-api.open-meteo.com/v1/search").expect("static url");
    url.query_pairs_mut().append_pair("name", q).append_pair("count", "8").append_pair("language", place_lang()).append_pair("format", "json");
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::msg(format!("城市搜索失败：HTTP {}", resp.status())));
    }
    parse_search(&resp.bytes().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_local_times() {
        // 2026-10-01 06:00 at UTC+8 is 2026-09-30 22:00 UTC.
        assert_eq!(local_iso_to_unix("2026-10-01T06:00", 8 * 3600), Some(1790805600));
        assert_eq!(local_iso_to_unix("1970-01-01T00:00", 0), Some(0));
        assert_eq!(local_iso_to_unix("garbage", 0), None);
    }

    #[test]
    fn parses_open_meteo() {
        let body = br#"{"latitude":31.25,"longitude":121.5,"utc_offset_seconds":28800,"timezone":"Asia/Shanghai",
            "current":{"time":"2026-10-01T14:00","interval":900,"temperature_2m":24.3,"apparent_temperature":26.1,
            "relative_humidity_2m":71,"is_day":1,"weather_code":61,"cloud_cover":88,"precipitation":0.4,
            "wind_speed_10m":12.6,"wind_direction_10m":95},
            "daily":{"time":["2026-10-01"],"temperature_2m_max":[26.0],"temperature_2m_min":[20.5],
            "sunrise":["2026-10-01T05:51"],"sunset":["2026-10-01T17:41"]}}"#;
        let r = parse_forecast(body, 31.25, 121.5, "上海".into(), 5).unwrap();
        assert_eq!(r.code, 61);
        assert!(r.is_day);
        assert_eq!(r.high, Some(26.0));
        assert_eq!(r.low, Some(20.5));
        assert_eq!(r.sunrise, local_iso_to_unix("2026-10-01T05:51", 28800));
        assert!(r.sunset.unwrap() > r.sunrise.unwrap());
        assert_eq!(r.place, "上海");
    }

    #[test]
    fn tolerates_missing_fields() {
        let body = br#"{"current":{"temperature_2m":-3.0,"weather_code":71}}"#;
        let r = parse_forecast(body, 0.0, 0.0, "x".into(), 0).unwrap();
        assert_eq!(r.apparent, -3.0);
        assert!(r.is_day);
        assert_eq!(r.sunrise, None);
    }

    #[test]
    fn parses_city_search() {
        let body = r#"{"results":[{"name":"杭州市","latitude":30.29,"longitude":120.16,"admin1":"浙江省","country":"中国"},
            {"name":"上海","latitude":31.22,"longitude":121.45,"admin1":"上海","country":"中国"}]}"#;
        let hits = parse_search(body.as_bytes()).unwrap();
        assert_eq!(hits[0].region, "浙江省，中国");
        assert_eq!(hits[1].region, "中国");
        assert!(parse_search(b"{}").unwrap().is_empty());
    }
}

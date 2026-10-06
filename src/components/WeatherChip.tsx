// Titlebar weather readout for the weather theme, with a details popover.

import { refreshWeather } from "../core/weather/service";
import { describeCode, sceneIcon } from "../core/weather/scene";
import { useWeatherScene } from "../hooks";
import { useUI } from "../stores/player";
import { useWeather } from "../stores/weather";
import { Icon } from "./Icon";
import { Popover } from "./Popover";
import { locale } from "../i18n";

const deg = (v: number | null | undefined) => (v === null || v === undefined ? "--" : `${Math.round(v)}°`);

function hm(sec?: number | null) {
  if (!sec) return "--";
  return new Date(sec * 1000).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function WeatherChip() {
  const report = useWeather((s) => s.report);
  const status = useWeather((s) => s.status);
  const error = useWeather((s) => s.error);
  const preview = useWeather((s) => s.preview);
  const scene = useWeatherScene();
  const busy = status === "locating" || status === "loading";
  const label = preview ? `预览：${scene.label}` : report ? `${report.place} ${describeCode(report.code).label} ${deg(report.temperature)}` : busy ? "正在获取天气…" : "天气暂不可用";

  return (
    <Popover
      down
      trigger={(open, toggle) => (
        <button className={`weather-chip ${open ? "active" : ""}`} onClick={toggle} data-tip={label}>
          <Icon name={sceneIcon(scene)} size={16} />
          <span>{report && !preview ? deg(report.temperature) : preview ? scene.label : busy ? "…" : "--"}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="weather-pop">
          {report ? (
            <>
              <div className="place">
                <Icon name="location" size={13} /> {report.place}
              </div>
              <div className="temp">{deg(report.temperature)}</div>
              <div className="cond">{describeCode(report.code).label}</div>
              <div className="range">
                最高 {deg(report.high)}　最低 {deg(report.low)}
              </div>
              <div className="grid">
                <span>体感</span>
                <b>{deg(report.apparent)}</b>
                <span>湿度</span>
                <b>{Math.round(report.humidity)}%</b>
                <span>风速</span>
                <b>{Math.round(report.windSpeed)} 公里/小时</b>
                <span>日出 / 日落</span>
                <b>
                  {hm(report.sunrise)} / {hm(report.sunset)}
                </b>
              </div>
              <div className="updated">
                {status === "error" ? `更新失败：${error}` : busy ? "正在更新…" : `更新于 ${hm(report.fetchedAt)}`}
              </div>
            </>
          ) : (
            <div className="updated">{busy ? "正在获取当前位置的天气…" : `暂时无法获取天气${error ? `：${error}` : ""}`}</div>
          )}
          {preview && <div className="updated">正在预览“{scene.label}”效果，可在设置中切回实时天气</div>}
          <div className="acts">
            <button className="btn small" disabled={busy} onClick={() => void refreshWeather(true)}>
              <Icon name="refresh" size={14} /> 刷新
            </button>
            <button
              className="btn small ghost"
              onClick={() => {
                close();
                useUI.setState({ overlay: "settings", settingsTab: "appearance" });
              }}
            >
              更改位置…
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

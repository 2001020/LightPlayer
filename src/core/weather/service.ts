// Keeps the weather report fresh while the weather theme is on.

import { api } from "../../lib/ipc";
import { useSettings } from "../../stores/settings";
import { useWeather } from "../../stores/weather";

const REFRESH_MS = 30 * 60 * 1000;
const LOCATION_TTL_MS = 60 * 60 * 1000;

let running: Promise<void> | null = null;
/** A refresh asked for while one was running (true: also re-locate). */
let again: boolean | null = null;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function update(force: boolean) {
  const s = useSettings.getState();
  let lat: number;
  let lon: number;
  let name: string | null = null;
  let fallbackName: string | null = null;
  if (s.weather.source === "city" && s.weather.city) {
    ({ lat, lon, name } = s.weather.city);
  } else {
    let place = useWeather.getState().place;
    if (force || !place || Date.now() - place.at > LOCATION_TTL_MS) {
      useWeather.setState({ status: "locating", error: null });
      place = { ...(await api.weatherLocate()), at: Date.now() };
      useWeather.setState({ place });
    }
    ({ lat, lon } = place);
    fallbackName = place.name ?? null;
  }
  useWeather.setState({ status: "loading", error: null });
  const report = await api.weatherFetch(lat, lon, name);
  if (report.place === "当前位置" && fallbackName) report.place = fallbackName;
  useWeather.setState({ report, status: "ready", error: null });
}

/** Fetches a new report; `force` also asks for a fresh position. */
export function refreshWeather(force = false): Promise<void> {
  if (useSettings.getState().theme !== "weather") return Promise.resolve();
  if (running) {
    again = (again ?? false) || force;
    return running;
  }
  running = update(force)
    .catch((e) => {
      console.warn("weather", e);
      useWeather.setState({ status: "error", error: errText(e) });
    })
    .finally(() => {
      running = null;
      if (again !== null) {
        const f = again;
        again = null;
        void refreshWeather(f);
      }
    });
  return running;
}

function stale() {
  const r = useWeather.getState().report;
  return !r || Date.now() - r.fetchedAt * 1000 > REFRESH_MS;
}

let started = false;

export function startWeather() {
  if (started) return;
  started = true;
  if (stale()) void refreshWeather();
  useSettings.subscribe((s, prev) => {
    if (s.theme === "weather" && prev.theme !== "weather") void refreshWeather(stale());
    const w = s.weather;
    const p = prev.weather;
    if (s.theme === "weather" && (w.source !== p.source || w.city?.lat !== p.city?.lat || w.city?.lon !== p.city?.lon)) {
      void refreshWeather(w.source === "auto");
    }
  });
  window.setInterval(() => stale() && void refreshWeather(), 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && stale()) void refreshWeather();
  });
}

import { useEffect, useMemo, useState } from "react";
import { lastDays, topArtists, topSongs, totals, type DayTime } from "../core/listening";
import { confirmDialog } from "../lib/confirm";
import { locale, monthDay } from "../i18n";
import { useListening } from "../stores/listening";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";
import { Row, Seg, Switch } from "./SettingsControls";
import { tip } from "./Tooltip";

/** A listening time in words: 不到 1 分钟, 42 分钟, 3 小时, 3 小时 5 分钟. */
export function listenTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return seconds > 0 ? "不到 1 分钟" : `${0} 分钟`;
  const h = Math.floor(m / 60);
  if (!h) return `${m} 分钟`;
  return m % 60 ? `${h} 小时 ${m % 60} 分钟` : `${h} 小时`;
}

/** Axis tops (minutes) the chart may use: the first that fits the longest day. */
const TOPS = [10, 20, 30, 60, 90, 120, 180, 240, 360, 480, 720, 960, 1440];

/** The current time, refreshed every minute (the day can change while the page is open). */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function DayChart({ days }: { days: DayTime[] }) {
  const top = useMemo(() => {
    const max = Math.max(0, ...days.map((d) => d.seconds)) / 60;
    return (TOPS.find((t) => t >= max) ?? TOPS[TOPS.length - 1]) * 60;
  }, [days]);
  const week = days.length <= 7;
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale(), { weekday: "short" }), []);
  const label = (d: DayTime, i: number) => {
    if (week) return weekday.format(d.date);
    const day = d.date.getDate();
    // Every fifth day, counted back from today, and the first of a month.
    return (days.length - 1 - i) % 5 === 0 || day === 1 ? String(day) : "";
  };
  return (
    <div className={`listen-chart ${week ? "week" : "month"}`} role="img" aria-label="每天的听歌时长">
      <div className="axis">
        <span>{listenTime(top)}</span>
        <span>{listenTime(top / 2)}</span>
        <span />
      </div>
      <div className="plot">
        <div className="bars">
          {days.map((d) => (
            <div key={d.key} className="col" {...tip(`${monthDay(d.date)}：${listenTime(d.seconds)}`)}>
              <div className="bar" style={{ height: `${Math.min(100, (d.seconds / top) * 100)}%` }} data-empty={d.seconds > 0 ? undefined : ""} />
            </div>
          ))}
        </div>
        <div className="days">
          {days.map((d, i) => (
            <span key={d.key} data-lp-raw>
              {label(d, i)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Rank({ rows }: { rows: { key: string; name: string; sub?: string | null; seconds: number }[] }) {
  const max = rows[0]?.seconds ?? 0;
  return (
    <ol className="listen-rank">
      {rows.map((r, i) => (
        <li key={r.key}>
          <span className="n">{i + 1}</span>
          <span className="who">
            <span className="name" data-lp-raw>
              {r.name}
            </span>
            {r.sub && (
              <span className="sub" data-lp-raw>
                {r.sub}
              </span>
            )}
            <span className="meter">
              <span style={{ width: `${max ? Math.max(2, (r.seconds / max) * 100) : 0}%` }} />
            </span>
          </span>
          <span className="t">{listenTime(r.seconds)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The library's "听歌时长" page. */
export function ListeningView() {
  const data = useListening();
  const on = useSettings((s) => s.listeningStats);
  const privateMode = useSettings((s) => s.privateMode);
  const [range, setRange] = useState<7 | 30>(7);
  const now = useNow();
  const t = useMemo(() => totals(data, now), [data, now]);
  const days = useMemo(() => lastDays(data, range, now), [data, range, now]);
  const songs = useMemo(() => topSongs(data, 10), [data]);
  const artists = useMemo(() => topArtists(data, 10), [data]);
  const clear = async () => {
    if (await confirmDialog("清空全部听歌时长记录？此操作无法撤销。", "清空记录")) data.clear();
  };
  const tiles: [string, number][] = [
    ["今天", t.today],
    ["本周", t.week],
    ["本月", t.month],
    ["累计", t.all],
  ];
  return (
    <>
      <div className="lib-head">
        <div className="lib-title">
          <div>
            <h1>听歌时长</h1>
            <div className="sub">{data.since ? `从 ${monthDay(new Date(data.since), true)} 开始记录，有 ${t.activeDays} 天听过歌` : "播放歌曲时自动记录"}</div>
          </div>
        </div>
      </div>
      <div className="listen-page">
        <div className="listen-tiles">
          {tiles.map(([label, seconds]) => (
            <div key={label} className="tile">
              <div className="k">{label}</div>
              <div className="v">{listenTime(seconds)}</div>
            </div>
          ))}
        </div>

        <div className="listen-block">
          <div className="listen-block-head">
            <h3>每天</h3>
            <Seg
              value={range}
              options={[
                [7, "最近 7 天"],
                [30, "最近 30 天"],
              ]}
              onChange={setRange}
            />
          </div>
          <DayChart days={days} />
        </div>

        {songs.length > 0 && (
          <div className="listen-cols">
            <div className="listen-block">
              <div className="listen-block-head">
                <h3>听得最多的歌曲</h3>
              </div>
              <Rank rows={songs.map((s) => ({ key: s.path, name: s.title, sub: s.artist, seconds: s.seconds }))} />
            </div>
            {artists.length > 0 && (
              <div className="listen-block">
                <div className="listen-block-head">
                  <h3>听得最多的艺术家</h3>
                </div>
                <Rank rows={artists.map((a) => ({ key: a.name, name: a.name, seconds: a.seconds }))} />
              </div>
            )}
          </div>
        )}

        <div className="listen-block listen-options">
          <Row label="记录听歌时长" hint="只统计歌曲实际播放的时间，暂停和视频不算；记录只保存在这台电脑上">
            <Switch on={on} onChange={(listeningStats) => useSettings.getState().set({ listeningStats })} />
          </Row>
          {on && privateMode && (
            <p className="note">
              <Icon name="incognito" size={14} /> 无痕播放已开启，现在听的歌不会计入。
            </p>
          )}
          <Row label="清空记录" hint="删除全部听歌时长记录，重新开始统计">
            <button className="btn" onClick={() => void clear()} disabled={!data.since}>
              清空…
            </button>
          </Row>
        </div>
      </div>
    </>
  );
}

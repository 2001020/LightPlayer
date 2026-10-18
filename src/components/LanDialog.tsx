import { useEffect, useMemo, useState } from "react";
import { addByAddress, cancelShare, sendTo, startDiscovery, stopDiscovery } from "../core/lan";
import { okEnd, reasonText } from "../core/lan/reasons";
import { api, isCloudPath, LAN_MAX_SIZE, type LanDevice } from "../lib/ipc";
import { formatBytes } from "../lib/format";
import { isWindows } from "../lib/platform";
import { sendingShares, useLan, type LanShare } from "../stores/lan";
import { usePlayer, usePlaylist, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";

export const platformLabel = (p: string) => (p === "macos" ? "Mac" : p === "windows" ? "Windows" : p === "linux" ? "Linux" : p);

/** Where received files go, as the system names the folder. */
export const RECEIVE_FOLDER = isWindows ? "视频\\LightPlayer" : "影片/LightPlayer";

export function etaText(bytes: number, total: number, speed: number): string | null {
  if (!speed || speed <= 0 || bytes >= total) return null;
  const s = Math.ceil((total - bytes) / speed);
  return s >= 60 ? `剩余 ${Math.floor(s / 60)} 分 ${s % 60} 秒` : `剩余 ${s} 秒`;
}

/** Seconds left until `at` (Date.now() based), ticking once a second. */
export function useCountdown(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [at]);
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

export function TransferBar({ s }: { s: LanShare }) {
  const pct = s.total ? Math.min(100, (s.bytes / s.total) * 100) : 0;
  const eta = etaText(s.bytes, s.total, s.speed);
  return (
    <div className="lan-transfer-bar">
      <div className="progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="lan-transfer-meta muted">
        <span>{`${Math.floor(pct)}%`}</span>
        <span>
          {formatBytes(s.bytes)} / {formatBytes(s.total)}
        </span>
        {s.speed > 0 && <span>{`${formatBytes(s.speed)}/s`}</span>}
        {eta && <span>{eta}</span>}
      </div>
    </div>
  );
}

function ShareRow({ s, onRetry }: { s: LanShare; onRetry: (s: LanShare) => void }) {
  const left = useCountdown(s.stage === "waiting" ? s.expiresAt : null);
  return (
    <div className={`lan-share ${s.stage}`}>
      <div className="lan-share-head">
        <Icon name="devices" size={18} />
        <span className="lan-share-name" data-lp-raw>
          {s.peer.name}
        </span>
        <span className="lan-share-state">
          {s.stage === "connecting" && "正在连接…"}
          {s.stage === "waiting" && (left !== null ? `等待对方接收（${left} 秒）` : "等待对方接收…")}
          {s.stage === "sending" && "正在发送"}
          {s.stage === "syncing" && (s.following ? "正在同步播放进度" : "对方暂停了跟随")}
          {s.stage === "ended" && <span className={okEnd(s.reason) ? "muted" : "lan-error"}>{reasonText(s.reason, "send")}</span>}
        </span>
        {s.stage === "syncing" ? (
          <button className="btn small" onClick={() => cancelShare(s.id)}>
            停止同步
          </button>
        ) : s.stage === "ended" ? (
          !okEnd(s.reason) &&
          s.reason !== "declined" && (
            <button className="btn small" onClick={() => onRetry(s)}>
              重试
            </button>
          )
        ) : (
          <button className="btn small" onClick={() => cancelShare(s.id)}>
            取消
          </button>
        )}
      </div>
      {s.stage === "sending" && <TransferBar s={s} />}
    </div>
  );
}

function DeviceRow({ d, busy, blocked }: { d: LanDevice; busy: boolean; blocked: boolean }) {
  return (
    <div className="lan-device">
      <Icon name="devices" size={20} />
      <div className="lan-device-text">
        <div className="lan-device-name" data-lp-raw>
          {d.name}
        </div>
        <div className="muted lan-device-meta">
          <span>{platformLabel(d.platform)}</span>
          <span data-lp-raw>{d.addr.replace(/:47390$/, "")}</span>
        </div>
      </div>
      <button className="btn small primary" disabled={busy || blocked} onClick={() => void sendTo(d)}>
        {busy ? "已发送" : "发送"}
      </button>
    </div>
  );
}

function AddByAddress() {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<"add" | "scan" | null>(null);
  if (!open) {
    return (
      <button className="link-btn lan-more" onClick={() => setOpen(true)}>
        找不到设备？输入 IP 地址
      </button>
    );
  }
  const add = async () => {
    if (!addr.trim()) return;
    setWorking("add");
    setError(await addByAddress(addr));
    setWorking(null);
  };
  const scan = async () => {
    setWorking("scan");
    setError(null);
    const n = await api.lanScanSubnet().catch(() => 0);
    if (!n) setError("本网段中没有找到其他 LightPlayer");
    setWorking(null);
  };
  return (
    <div className="lan-manual">
      <div className="lan-manual-row">
        <input
          type="text"
          value={addr}
          placeholder="例如 192.168.1.20"
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          autoFocus
        />
        <button className="btn small" disabled={!addr.trim() || working !== null} onClick={() => void add()}>
          添加
        </button>
        <button className="btn small" disabled={working !== null} onClick={() => void scan()}>
          {working === "scan" ? "正在搜索…" : "搜索本网段"}
        </button>
      </div>
      {error && <div className="lan-error">{error}</div>}
      <p className="note">{"对方的地址在它的“设置 > 局域网同步”中可以看到。"}</p>
    </div>
  );
}

/** Sending the open file to another device. */
export function LanDialog() {
  const media = usePlayer((s) => s.media);
  const size = usePlaylist((s) => s.items[s.index]?.size ?? 0);
  const devices = useLan((s) => s.devices);
  const discoverError = useLan((s) => s.discoverError);
  const map = useLan((s) => s.shares);
  const all = useMemo(() => sendingShares(map), [map]);
  const enabled = useSettings((s) => s.lan.enabled);
  const close = () => useUI.setState({ overlay: null });

  useEffect(() => {
    startDiscovery();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      stopDiscovery();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const shares = all.filter((s) => s.stage !== "ended" || s.path === media?.path);
  const blocked = !media
    ? "先打开一个媒体文件，再发送给其他设备"
    : isCloudPath(media.path)
      ? "网易云音乐的歌曲不能通过局域网发送，只能发送本机上的文件"
      : size > LAN_MAX_SIZE
        ? "文件超过 1 GB，不能通过局域网发送"
        : null;
  const busyWith = (d: LanDevice) => shares.some((s) => s.peer.addr === d.addr && s.path === media?.path && s.stage !== "ended");
  const retry = (s: LanShare) => {
    const d = devices.find((x) => x.addr === s.peer.addr) ?? { id: "", name: s.peer.name, platform: s.peer.platform, version: "", addr: s.peer.addr, manual: true };
    void sendTo(d);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog lan-dialog" data-lp="lan-dialog" role="dialog" aria-label="局域网同步">
        <header>
          <h2>局域网同步</h2>
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          {media && (
            <div className="lan-file">
              <Icon name={media.kind === "video" ? "film" : "music"} size={22} />
              <div className="lan-file-text">
                <div className="lan-file-name" data-lp-raw>
                  {media.fileName}
                </div>
                {size > 0 && <div className="muted">{formatBytes(size)}</div>}
              </div>
            </div>
          )}
          <p className="note">
            {`发送给同一局域网中的另一台 LightPlayer。对方接收后，文件保存在它的“${RECEIVE_FOLDER}”文件夹中，播放进度跟随本机同步。单个文件最大 1 GB。`}
          </p>
          {blocked && <div className="banner">{blocked}</div>}
          {!enabled && <p className="note">本机关闭了“允许局域网中的设备找到本机”，其他设备找不到本机，但本机仍然可以发送。</p>}

          {shares.length > 0 && (
            <section className="lan-section">
              <h3>分享</h3>
              {shares.map((s) => (
                <ShareRow key={s.id} s={s} onRetry={retry} />
              ))}
            </section>
          )}

          <section className="lan-section">
            <h3>
              局域网中的设备 <span className="spinner dark lan-spinner" aria-hidden="true" />
            </h3>
            {discoverError && <div className="banner">{reasonText(discoverError, "send")}</div>}
            {devices.length === 0 ? (
              <div className="lan-empty muted">正在查找开着 LightPlayer 的设备…</div>
            ) : (
              devices.map((d) => <DeviceRow key={d.id} d={d} busy={busyWith(d)} blocked={!!blocked} />)
            )}
            <AddByAddress />
          </section>
        </div>
      </div>
    </div>
  );
}

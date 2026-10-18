// The receiving side of LAN sync: the offer dialog, the transfer card and the
// "following" banner. Always mounted; each part shows itself when needed.

import { useState } from "react";
import { answerOffer, cancelShare, dismissFollow, playReceived, resumeFollowing, stopFollowing } from "../core/lan";
import { reasonText } from "../core/lan/reasons";
import { reveal } from "../core/library/actions";
import { formatBytes } from "../lib/format";
import { FILE_MANAGER } from "../lib/platform";
import { receiving, useLan } from "../stores/lan";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";
import { platformLabel, RECEIVE_FOLDER, TransferBar, useCountdown } from "./LanDialog";

function OfferDialog({ id }: { id: string }) {
  const s = useLan((st) => st.shares[id]);
  const [follow, setFollow] = useState(() => useSettings.getState().lan.follow);
  const left = useCountdown(s?.expiresAt ?? null);
  if (!s) return null;
  return (
    <div className="overlay lan-offer-overlay">
      <div className="dialog lan-offer" data-lp="lan-offer" role="alertdialog" aria-label="收到局域网文件">
        <div className="body">
          <div className="lan-offer-head">
            <div className="lan-offer-icon">
              <Icon name="devices" size={26} />
            </div>
            <div>
              <div className="lan-offer-title">
                <span data-lp-raw>{s.peer.name}</span> 想发送一个文件给你
              </div>
              <div className="muted lan-device-meta">
                <span>{platformLabel(s.peer.platform)}</span>
                <span data-lp-raw>{s.peer.addr}</span>
              </div>
            </div>
          </div>
          <div className="lan-file">
            <Icon name={s.file.kind === "video" ? "film" : "music"} size={22} />
            <div className="lan-file-text">
              <div className="lan-file-name" data-lp-raw>
                {s.file.name}
              </div>
              <div className="muted">{formatBytes(s.file.size)}</div>
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            接收后跟随对方的播放进度
          </label>
          <p className="note">{`保存到“${RECEIVE_FOLDER}”文件夹。${left !== null ? `${left} 秒后自动拒绝。` : ""}`}</p>
        </div>
        <footer>
          <button className="btn" onClick={() => void answerOffer(id, false, false)}>
            拒绝
          </button>
          <button className="btn primary" onClick={() => void answerOffer(id, true, follow)} autoFocus>
            接收
          </button>
        </footer>
      </div>
    </div>
  );
}

function ReceiveCard() {
  const s = useLan(receiving);
  const received = useLan((st) => st.received);
  if (s) {
    return (
      <div className="lan-card" data-lp="lan-transfer">
        <div className="lan-card-head">
          <Icon name="download" size={18} />
          <div className="lan-card-title">
            正在接收 <span data-lp-raw>{s.file.name}</span>
          </div>
          <button className="btn small" onClick={() => cancelShare(s.id)}>
            取消
          </button>
        </div>
        <div className="muted lan-card-from">
          来自 <span data-lp-raw>{s.peer.name}</span>
        </div>
        <TransferBar s={s} />
      </div>
    );
  }
  if (!received) return null;
  return (
    <div className="lan-card" data-lp="lan-transfer">
      <div className="lan-card-head">
        <Icon name="check" size={18} />
        <div className="lan-card-title">
          已收到 <span data-lp-raw>{received.name}</span>
        </div>
        <button className="icon-btn" onClick={() => useLan.setState({ received: null })} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="muted lan-card-from">{`保存在“${RECEIVE_FOLDER}”文件夹中`}</div>
      <div className="lan-card-actions">
        <button className="btn small" onClick={() => void reveal(received.path)}>
          {`在${FILE_MANAGER}中显示`}
        </button>
        <button className="btn small primary" onClick={() => void playReceived()}>
          播放
        </button>
      </div>
    </div>
  );
}

function FollowBanner() {
  const f = useLan((st) => st.follow);
  if (f.mode === "off") return null;
  return (
    <div className={`lan-banner ${f.mode}${f.lost ? " lost" : ""}`} data-lp="lan-banner" role="status">
      <Icon name="devices" size={16} />
      <span className="lan-banner-text">
        {f.mode === "following" && (f.lost ? "与对方的连接中断，正在等待…" : "正在跟随对方的播放进度")}
        {f.mode === "paused" && "已暂停跟随"}
        {f.mode === "ended" && reasonText(f.reason, "receive")}
      </span>
      {f.mode !== "ended" && (
        <span className="lan-banner-peer" data-lp-raw>
          {f.peer}
        </span>
      )}
      {f.mode === "paused" && (
        <button className="btn small primary" onClick={resumeFollowing}>
          恢复跟随
        </button>
      )}
      {f.mode !== "ended" ? (
        <button className="btn small" onClick={stopFollowing}>
          停止跟随
        </button>
      ) : (
        <button className="icon-btn" onClick={dismissFollow} aria-label="关闭">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function LanHost() {
  const offer = useLan((st) => st.offers[0]);
  return (
    <>
      <FollowBanner />
      <ReceiveCard />
      {offer && <OfferDialog key={offer} id={offer} />}
    </>
  );
}

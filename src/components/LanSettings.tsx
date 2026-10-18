import { useEffect } from "react";
import { refreshStatus } from "../core/lan";
import { reasonText } from "../core/lan/reasons";
import { api, isTauri } from "../lib/ipc";
import { isWindows } from "../lib/platform";
import { useLan } from "../stores/lan";
import { useSettings } from "../stores/settings";
import { RECEIVE_FOLDER } from "./LanDialog";
import { Row, Switch } from "./SettingsControls";

export function LanSettings() {
  const s = useSettings();
  const l = s.lan;
  const status = useLan((st) => st.status);
  const set = (p: Partial<typeof l>) => s.set({ lan: { ...l, ...p } });

  useEffect(() => {
    void refreshStatus();
  }, [l.enabled]);

  const addresses = status?.running && status.port ? status.addresses.map((a) => (status.port === 47390 ? a : `${a}:${status.port}`)) : [];
  return (
    <>
      <p className="note">
        打开一个媒体文件后，点播放栏上的“局域网同步”按钮，可以把它发送给同一局域网中的另一台 LightPlayer。对方接收后，播放进度跟随本机同步：播放、暂停、跳转和倍速都会同步过去。
      </p>
      <h3>本机</h3>
      <Row label="允许局域网中的设备找到本机并发送媒体" hint="关闭后，其他设备找不到本机，也不能向本机发送文件；本机仍然可以发送给其他设备">
        <Switch on={l.enabled} onChange={(enabled) => set({ enabled })} />
      </Row>
      <Row label="本机名称" hint="显示在其他设备上，留空则使用电脑的名称">
        <input type="text" className="lan-name-input" value={l.name} maxLength={64} placeholder={status?.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
      </Row>
      {l.enabled && (
        <Row label="本机地址" hint="其他设备找不到本机时，可以在对方的“局域网同步”窗口中输入这个地址">
          <span className="lan-addr" data-lp-raw>
            {addresses.length ? addresses.join("  ") : "—"}
          </span>
        </Row>
      )}
      {l.enabled && status?.error && <div className="banner">{reasonText(status.error, "receive")}</div>}
      <h3>接收</h3>
      <Row label="接收后跟随发送方的播放进度" hint="每次接收时也可以在确认窗口中单独选择">
        <Switch on={l.follow} onChange={(follow) => set({ follow })} />
      </Row>
      <Row label="接收的文件保存在" hint={status?.receiveDir ?? RECEIVE_FOLDER}>
        <button className="btn" disabled={!isTauri} onClick={() => void api.lanOpenReceiveDir().catch(() => {})}>
          打开
        </button>
      </Row>
      <h3>说明</h3>
      <ul className="lan-notes note">
        <li>每次有设备发来文件都会先询问，60 秒内没有接收就自动拒绝。单个文件最大 1 GB。</li>
        <li>{`收到的文件保存在“${RECEIVE_FOLDER}”文件夹中，重名时会自动改名，不会覆盖原有文件。`}</li>
        <li>传输没有加密，请只在信任的网络（例如家里的 Wi-Fi）中使用。</li>
        {isWindows ? (
          <>
            <li>{"第一次使用时 Windows 防火墙会询问是否允许 LightPlayer 访问网络，请勾选“专用网络”并点“允许”。如果点了“取消”，可以在“Windows 安全中心 > 防火墙和网络保护 > 允许应用通过防火墙”中重新打开。"}</li>
            <li>如果“视频”文件夹由 OneDrive 同步，收到的文件也会上传到 OneDrive。</li>
          </>
        ) : (
          <li>{"第一次使用时 macOS 会询问是否允许 LightPlayer 查找本地网络上的设备，请点“允许”。之后可以在“系统设置 > 隐私与安全性 > 本地网络”中更改。"}</li>
        )}
      </ul>
    </>
  );
}

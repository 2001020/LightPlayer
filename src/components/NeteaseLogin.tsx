// Sign in to NetEase Cloud Music: scan a QR code with the phone app (no
// password goes through LightPlayer), or paste a browser cookie as a fallback.

import { useEffect, useRef, useState } from "react";
import { api, type NeteaseQr } from "../lib/ipc";
import { refreshNetease } from "../stores/netease";
import { toast, useUI } from "../stores/player";
import { Icon } from "./Icon";

const STATUS: Record<number, string> = {
  801: "打开手机上的网易云音乐 App，扫描二维码登录",
  802: "已扫码，请在手机上确认登录",
  800: "二维码已过期",
};

export function NeteaseLogin() {
  const close = () => useUI.setState({ overlay: null });
  const [qr, setQr] = useState<NeteaseQr | null>(null);
  const [code, setCode] = useState(801);
  const [error, setError] = useState<string | null>(null);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);

  const done = async () => {
    close();
    await refreshNetease();
    toast("已登录网易云音乐", "success");
  };

  const start = async () => {
    const g = ++gen.current;
    setError(null);
    setCode(801);
    setQr(null);
    try {
      const q = await api.neteaseQrStart();
      if (g !== gen.current) return;
      setQr(q);
      // Poll until the code is used, expires or the dialog closes.
      while (g === gen.current) {
        await new Promise((r) => setTimeout(r, 2000));
        if (g !== gen.current) return;
        const st = await api.neteaseQrCheck(q.key);
        if (g !== gen.current) return;
        setCode(st.code);
        if (st.code === 803) return void done();
        if (st.code === 800) return;
      }
    } catch (e) {
      if (g === gen.current) setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void start();
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => {
      gen.current++;
      window.removeEventListener("keydown", h);
    };
  }, []);

  const submitCookie = async () => {
    setBusy(true);
    try {
      await api.neteaseLoginCookie(cookie);
      gen.current++;
      await done();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error", 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog ne-login">
        <header>
          <h2>登录网易云音乐</h2>
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          <div className="ne-qr">
            {qr && code !== 800 && !error ? (
              <div className="code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            ) : (
              <div className="code empty">
                {error || code === 800 ? (
                  <button className="btn" onClick={() => void start()}>
                    <Icon name="refresh" size={15} /> 刷新二维码
                  </button>
                ) : (
                  <span className="muted">正在获取二维码…</span>
                )}
              </div>
            )}
            <p className={error ? "err" : ""}>{error ?? STATUS[code] ?? ""}</p>
          </div>
          <p className="muted small">
            这是试验性功能，使用网易云音乐网页版的非官方接口，可能随时失效；使用第三方客户端也违反网易云音乐的用户协议，账号存在被限制的风险。LightPlayer 不会接触你的密码，登录状态只保存在这台电脑上。
          </p>
          <button className="link" onClick={() => setCookieOpen((v) => !v)}>
            扫码登录不了？改用 Cookie 登录
          </button>
          {cookieOpen && (
            <div className="ne-cookie">
              <p className="muted small">
                在浏览器中登录 music.163.com，打开开发者工具，在“存储”或“应用”中找到 music.163.com 的 Cookie，复制 MUSIC_U 的值（或整段 Cookie）粘贴到这里。这个值相当于你的登录凭证，不要发给别人。
              </p>
              <textarea value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder="MUSIC_U=…" rows={3} spellCheck={false} />
              <button className="btn primary" disabled={busy || !cookie.trim()} onClick={() => void submitCookie()}>
                {busy ? "正在登录…" : "登录"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

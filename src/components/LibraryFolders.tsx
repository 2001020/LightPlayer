import { useEffect } from "react";
import * as C from "../core/controller";
import { isUnder } from "../core/library/views";
import { confirmDialog } from "../lib/confirm";
import { api, isTauri } from "../lib/ipc";
import { libraryAction, useLibrary } from "../stores/library";
import { useUI } from "../stores/player";
import { useSettings } from "../stores/settings";
import { Icon } from "./Icon";
import { tip } from "./Tooltip";

export function LibraryFolders() {
  const folders = useLibrary((s) => s.data.folders);
  const tracks = useLibrary((s) => s.data.tracks);
  const progress = useLibrary((s) => s.progress);
  const s = useSettings();
  const close = () => useUI.setState({ overlay: null });
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const loose = tracks.filter((t) => t.source !== "folder").length;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog">
        <header>
          <h2>媒体库文件夹</h2>
          <button className="icon-btn" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">
          <p className="muted" style={{ marginTop: 0 }}>
            这些文件夹（包括所有子文件夹）中的音频和视频会出现在媒体库里。移除文件夹不会删除任何文件。
          </p>
          <div className="folder-list">
            {folders.map((f) => {
              const n = tracks.filter((t) => t.source === "folder" && isUnder(t.path, f.path)).length;
              return (
                <div key={f.path} className="folder-row">
                  <Icon name="folder" size={18} />
                  <div className="grow">
                    <div className="p" data-tip={f.path}>
                      {f.path}
                    </div>
                    <div className="n">{n} 个文件</div>
                  </div>
                  <button
                    className="icon-btn small"
                    onClick={async () => {
                      if (await confirmDialog(`从媒体库移除文件夹“${f.path}”？文件本身不会被删除。`)) {
                        await libraryAction(() => api.libraryRemoveFolder(f.path));
                      }
                    }}
                    {...tip("移除文件夹")}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              );
            })}
            {!folders.length && <div className="folder-empty">{isTauri ? "还没有添加文件夹" : "浏览器预览模式下请直接添加文件"}</div>}
          </div>
          {loose > 0 && <p className="muted">另有 {loose} 个播放过或拖入的单独文件。</p>}
          {progress && (
            <div className="lib-scan">
              <div className="row">
                <span>正在扫描</span>
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="progress-bar">
                <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          <label className="check-row">
            <input type="checkbox" checked={s.libraryAutoRescan} onChange={(e) => s.set({ libraryAutoRescan: e.target.checked })} />
            启动时自动检查文件夹中的新文件
          </label>
          <label className="check-row">
            <input type="checkbox" checked={s.libraryRecordPlays} onChange={(e) => s.set({ libraryRecordPlays: e.target.checked })} />
            把播放过的文件自动加入媒体库
          </label>
        </div>
        <footer>
          <button className="btn" disabled={!folders.length || !!progress} onClick={() => void api.libraryRescan()}>
            <Icon name="refresh" size={15} /> 重新扫描
          </button>
          <button className="btn primary" onClick={() => void C.addLibraryFolderWithDialog()}>
            <Icon name="folderPlus" size={15} /> {isTauri ? "添加文件夹" : "添加文件"}
          </button>
        </footer>
      </div>
    </div>
  );
}

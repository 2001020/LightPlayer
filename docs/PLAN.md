# LightPlayer 桌面多媒体播放器 — 开发计划

## 背景与目标

LightPlayer 是一款 macOS 优先、未来可扩展到 Windows 的桌面多媒体播放器。目标功能：完整播放控制、同目录同类播放列表、封面/作者显示、歌词（自动加载 / 上传 / 手动打标）、**本地模型识别歌词**、视频详细信息、深浅色与自定义主题/背景，以及歌词页两侧低调的实时音频波形。

已确定的决策：
- 技术栈：**Tauri 2 + React + TypeScript**，并**支持全格式媒体**（借助 ffmpeg sidecar）。
- 识别模型：**首次使用时下载**，不内置进安装包。
- 平台：当前 macOS（Apple Silicon 优先，universal 打包）；Windows 为后续目标，架构上预留。

---

## 1. 总体架构

```
┌──────────────────── React 前端 (WKWebView / 未来 WebView2) ────────────────────┐
│ 播放控制、列表、歌词页、歌词编辑器、设置/主题、波形 Canvas                 │
│ <audio>/<video> ──► Web Audio: MediaElementSource → Gain(应用内音量) → Analyser │
└───────────────▲─────────────────────────────── Tauri IPC (invoke / event) ─────┘
                │ http://127.0.0.1:<随机端口>/?token=…（Range / 分块流）
┌───────────────┴──────────────── Rust 后端 ────────────────────────────────────┐
│ media: 探测(ffprobe)、目录扫描、元数据/封面(lofty)、播放路由(直放/转封装/转码) │
│ server: 本地 axum 服务（Range 直放 + ffmpeg 管道流）                             │
│ lyrics: 同名歌词查找、编码识别(GBK/UTF-8)、保存、应用歌词库                    │
│ asr: 模型管理(下载/校验)、ffmpeg 解码16k → (人声分离) → VAD → whisper-rs(Metal)  │
│ sidecar: ffmpeg / ffprobe（LGPL 构建，universal2）                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 全格式支持方案（关键设计）
WebView 原生只能播 mp3/aac/m4a/alac/wav/aiff/flac/mp4/mov(h264/hevc) 等。内置 **ffmpeg/ffprobe sidecar**，Rust 侧 `router` 按 ffprobe 结果 + 前端上报的解码能力（`canPlayType`/`MediaSource.isTypeSupported`）选择策略：

| 策略 | 触发条件 | 做法 |
|---|---|---|
| Direct 直放 | 容器与编码均被 WebView 支持 | 本地服务按 Range 返回原文件，拖动完全原生 |
| Audio 转码缓存 | ape/wma/dsf/dff/tta/wv/mka/ac3/dts… | ffmpeg 整体解码为 FLAC 放缓存目录（几百毫秒~数秒），再按 Direct 播放；LRU 缓存上限 2GB |
| Remux 转封装 | 视频编码受支持但容器不支持（mkv/flv/ts/avi 内 h264/hevc） | `ffmpeg -c:v copy -c:a aac -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof` 管道流式输出；后台同时整体转封装到缓存，完成后无缝切换为 Direct |
| Transcode 转码 | 编码不受支持（wmv/rmvb/mpeg2/vc1/divx…） | `h264_videotoolbox` 硬件编码实时转码（Windows 未来：nvenc/qsv/amf/libx264 回退） |

Remux/Transcode 使用**虚拟时间轴**：前端 `PlaybackSession{ baseOffset, duration }`，显示时间 = `baseOffset + element.currentTime`；拖动到已缓冲范围外时请求 `request_stream(path, start)` 以 `-ss start` 重启 ffmpeg 并更新 `baseOffset`。本地服务使用随机端口 + 每会话 token，只监听 127.0.0.1，并带 CORS 头以便 Web Audio 取样。

### 分发与权限
- 采用 Developer ID 签名 + 公证（非 App Store 沙盒），否则“扫描同目录文件/同名歌词”需要逐目录授权；sidecar 二进制需一并签名（hardened runtime）。
- 通过 `tauri.conf.json` 的 `fileAssociations` 注册音视频类型，处理 macOS `RunEvent::Opened { urls }` 实现 Finder 双击/“打开方式”。

---

## 2. 目录结构（计划）

```
LightPlayer/
├─ docs/PLAN.md                      # 本文档
├─ package.json / vite.config.ts / tsconfig.json / index.html
├─ scripts/fetch-ffmpeg.sh           # 下载并放置 ffmpeg/ffprobe sidecar（不入库）
├─ src/                              # React 前端
│  ├─ core/player/PlaybackController.ts   # 包装 media 元素、虚拟时间轴、流会话
│  ├─ core/player/audioGraph.ts           # Gain(应用内音量) + Analyser(波形)
│  ├─ core/playlist/queue.ts              # 顺序/列表循环/单曲循环/随机（纯函数，可测）
│  ├─ core/lyrics/{lrcParser,lrcSerializer,lyricSync}.ts
│  ├─ stores/{player,playlist,lyrics,settings}Store.ts   # zustand
│  ├─ components/  TransportBar, ProgressBar, VolumeSlider, PlayModeButton,
│  │               PlaylistPanel, NowPlaying, CoverArt, VideoSurface, VideoInfoDialog,
│  │               LyricsView, LyricsEditor, AiLyricsBanner, WaveformSide, ThemeSettings
│  ├─ pages/ {PlayerPage, LyricsPage, SettingsPage}
│  ├─ styles/tokens.css                   # 主题 CSS 变量
│  ├─ i18n/{zh-CN,en}.json
│  └─ lib/ipc.ts                          # 类型化 invoke 封装
└─ src-tauri/
   ├─ tauri.conf.json / capabilities/default.json / binaries/
   └─ src/
      ├─ lib.rs, commands.rs, settings.rs
      ├─ media/{kinds,scan,probe,metadata,router}.rs
      ├─ server/{mod,range,stream}.rs
      ├─ lyrics/{mod,encoding,store}.rs
      └─ asr/{models,pipeline,separate,postprocess}.rs
```

主要依赖：Rust — `tauri 2`、`tauri-plugin-{dialog,fs,store,shell}`、`axum`、`tokio`、`lofty`、`whisper-rs`(features=`metal`)、`ort`(ONNX: Silero VAD / 人声分离)、`reqwest`、`sha2`、`chardetng`+`encoding_rs`、`natord`、`ferrous-opencc`、`souvlaki`(系统媒体键/正在播放)。前端 — React 18、zustand、Vite、Vitest、`culori`(OKLCH 取色)。

### IPC 接口
- `open_media(path) -> MediaItem { kind: Audio|Video, play_url, strategy, duration, meta }`
- `scan_playlist(path) -> Vec<MediaEntry>`
- `get_metadata(path) -> { title, artist, album, cover_url }`
- `get_video_info(path) -> VideoInfo`
- `request_stream(path, start_secs) -> url`
- `find_lyrics(path) -> Option<LyricsSource { content, origin: Sidecar|Embedded|Library|Ai }>`
- `save_lyrics(path, content, target: SameDir|Library)`
- `asr_list_models / asr_download_model / asr_start(path, opts) / asr_cancel`
- 事件：`asr://progress`、`model://download-progress`、`app://open-files`

---

## 3. 需求逐项实现方案

**1. 播放/暂停**：中央按钮 + 空格键 + 系统媒体键（`souvlaki`，macOS 控制中心“正在播放”，未来直接支持 Windows SMTC）。

**2. 播放模式**：单按钮循环切换 顺序 → 列表循环 → 单曲循环 → 随机，图标 + tooltip，状态持久化。`queue.ts` 纯函数实现；随机模式使用 Fisher-Yates 洗牌序列（一轮内不重复）+ 历史栈，保证“上一曲”回到真正听过的上一首。

**3. 上一曲/下一曲**：按模式计算；当前进度 > 3s 时“上一曲”先回到开头（主流播放器惯例）。顺序模式到末尾停止。快捷键 ⌘← / ⌘→。

**4. ±15 秒**：两个按钮；快捷键 J / L。步长可在设置中改。

**5. 进度条与音量**：
- 自定义进度条：拖动时只更新预览、松开再 seek（避免拖动卡顿）；悬停显示时间提示；显示已缓冲区间。←/→ 调整进度（默认 5s，设置可改），聚焦任意位置均生效（输入框除外）。
- 音量：滑条（0–100%，可选 150% 增益），通过 Web Audio `GainNode`/元素 volume 实现，**只影响应用内音量，不触碰系统音量**；静音按钮、↑/↓ 调节、滚轮调节、音量记忆。

**6. 播放列表**：打开文件后 Rust 扫描其所在目录（非递归），按扩展名表判定类型：当前为音频则只列音频，视频则只列视频；自然排序（“2”排在“10”前）；支持搜索过滤、双击播放、当前项高亮。打开方式：菜单 ⌘O、拖拽到窗口、Finder 双击/打开方式、最近文件。

**7. 封面与信息（仅音频显示封面/作者）**：`lofty` 读取标题/艺术家/专辑/内嵌封面（缓存为文件经本地服务提供）；回退顺序：同目录 `cover/folder/同名.jpg|png` → 生成渐变占位图。艺术家缺失时尝试解析“艺术家 - 标题”文件名，仍无则不显示作者行。视频只显示文件名。

**8. 歌词页**：点击封面/名称进入（带共享元素过渡动画），Esc 返回。
- 自动加载顺序：同目录同名 `.lrc`（大小写不敏感，兼容 `名称.*.lrc`）→ 内嵌歌词（USLT/SYLT）→ 应用歌词库 → 无则显示 **“暂无歌词”**。
- 编码自动识别（`chardetng`，重点兼容 GBK/Big5 的中文 LRC）。
- 解析器：多时间戳行、`[offset:]`、`[ti/ar/al]`、同时间戳双行视为翻译、增强 LRC `<mm:ss.xx>` 逐字；纯文本 `.txt` 作为无时间轴歌词静态显示。
- 显示：当前行高亮放大、平滑滚动居中、点击行跳转、手动滚动后 3 秒再恢复跟随、歌词整体偏移 ±0.5s 微调、字号调节。
- **上传歌词**：选择 `.lrc/.txt/.srt` → 解析预览 → 保存到媒体同目录（同名）或应用歌词库（目录不可写时自动回退）。
- **手动制作（打标）编辑器**：
  - 打标模式：粘贴纯文本歌词 → 播放 → 按空格/回车为当前行打时间并前进，退格撤销，可随时暂停/回退 15s。
  - 表格模式：每行“时间 + 文本”可编辑，±0.1s 微调、插入/删除/上下移动行，点击时间跳到该处试听。
  - 预览模式：用正常歌词视图试看效果。
  - 保存为 `<媒体名>.lrc`；覆盖已有文件前确认并保留 `.lrc.bak`。

**9. 模型识别歌词（重点）**：
- 模型管理（设置页）：`tiny`/`base`/`small`/`large-v3-turbo(q5_0，Apple Silicon 推荐)`，首次点击“识别歌词”时引导下载至 `~/Library/Application Support/LightPlayer/models`；支持断点续传、SHA-256 校验、下载源可切换（Hugging Face / hf-mirror 镜像，照顾国内网络）。
- 流水线（Rust 后台线程，可取消，进度事件推送前端）：ffmpeg 解码为 16kHz 单声道 → **人声分离（可选，MDX-Net/Demucs ONNX，显著提升歌曲识别率，作为第二阶段）** → Silero VAD 切段 → `whisper-rs`（Metal GPU 加速，开启 token 时间戳，语言自动/手选，中文 initial prompt 引导简体与分句）→ 后处理：过滤幻觉（重复段、“字幕由…提供”等已知幻觉句、高 no_speech_prob 段）、长句按停顿拆行、可选 OpenCC 繁转简 → 生成 LRC（含逐字时间）。
- 结果保存在应用歌词库（标记 `origin=Ai`，不覆盖用户文件），立即作为正常歌词显示并滚动高亮，顶部横幅提示 **“本歌词由识别模型生成，可能有误”** + “编辑校对”按钮 → 打开第 8 项编辑器，保存后可写入同目录 `.lrc`，横幅变为“AI 歌词（已校对）”。

**10. 视频详细信息**：视频播放时控制栏“ⓘ”按钮（快捷键 I）弹出面板：文件大小、分辨率（含旋转/显示宽高比）、帧率（解析 `avg_frame_rate`，如 23.976）、总码率与视频/音频码率，另附编码格式、时长、容器、音频采样率/声道、HDR 信息、当前播放策略（直放/转封装/转码）。数据来自 ffprobe JSON。

**11. 外观**：
- 浅色/深色/跟随系统；全部颜色为 `tokens.css` 中的 CSS 变量。
- 自定义主题色：预设色板 + 取色器，使用 OKLCH 自动推导悬停/按下/弱化色并保证文字对比度。
- 自定义背景图：选择图片复制到应用数据目录；可调模糊（0–40px）、遮罩不透明度、填充方式；面板采用毛玻璃（backdrop-filter）；可选“音频播放时以封面作背景”。

**额外：歌词页两侧音频波形**：窗口宽度 ≥ 1100px（歌词列最大 640px，两侧各留 ≥ 200px）时显示；`AnalyserNode` 取数据，渲染为左右镜像的细竖条/柔和曲线，透明度 0.15–0.25、主题色、高平滑系数、限 30fps；暂停、窗口隐藏、系统“减少动态效果”时停止/静态。回退方案：若 WebView 对媒体源取样异常，Rust 用 ffmpeg 预计算 RMS 包络（20ms 粒度），按 currentTime 驱动动画。

---

## 4. 里程碑

| 阶段 | 内容 |
|---|---|
| M0 | 脚手架（Tauri 2 + Vite React TS）、ffmpeg sidecar 脚本、本地媒体服务、CI（macos-14） |
| M1 | 核心播放 1–5、快捷键、应用内音量 |
| M2 | 播放列表与模式 6、打开文件/拖拽/文件关联/最近文件 |
| M3 | 元数据/封面 7、视频详情 10 |
| M4 | 全格式路由：音频转码缓存、Remux、Transcode、虚拟时间轴 |
| M5 | 歌词显示、自动扫描、上传（8 上半） |
| M6 | 歌词编辑器：打标/表格/预览/保存（8 下半） |
| M7 | 模型管理 + 识别流水线 + AI 横幅（9）；M7b 人声分离 |
| M8 | 主题/背景 11、两侧波形 |
| M9 | 附加功能、性能与内存打磨、签名公证、universal 打包 |

---

## 5. 附加功能建议（实用 / 新颖 / 有趣）

实用：
1. **倍速播放** 0.5–3×（音频保持音高 `preservesPitch`）。
2. **A-B 段循环**（学语言、扒谱练琴）。
3. **睡眠定时器**：N 分钟后或“本曲结束后”淡出暂停。
4. **断点续播**：视频/长音频记住上次位置。
5. **字幕**：外挂 srt/ass/vtt 与内嵌字幕（ffmpeg 转 WebVTT）；并**复用第 9 项模型为视频生成字幕**。
6. **10 段均衡器 + 预设**、ReplayGain 响度均衡。
7. **迷你播放器 / 画中画**，置顶小窗。
8. **视频截图、逐帧步进**（, / .）。

新颖 / 有趣：
9. **桌面歌词悬浮窗**（透明置顶，可锁定穿透）。
10. **封面取色动态主题**：自动以封面主色作为主题色与背景渐变。
11. **卡拉 OK 逐字高亮**：增强 LRC 与模型逐字时间戳。
12. **歌词分享卡片**：选中几行歌词 + 封面生成精美图片。
13. **曲间交叉淡入淡出 / 无缝播放**。
14. **歌词繁简转换、双语（原文+翻译）显示**。
15. **听歌统计**：本地记录播放次数与时长，生成月度小报告。

---

## 6. 风险与应对
- WKWebView 对自定义流的兼容：采用本地 HTTP 服务而非自定义 scheme，Remux 后台整体转封装后切 Direct 以获得精确拖动。
- Whisper 对歌唱识别准确率有限：人声分离 + VAD + 幻觉过滤 + 明确提示可能有误 + 编辑器校对闭环。
- 许可证：ffmpeg 使用 LGPL 构建以 sidecar 方式调用；whisper.cpp/模型权重为 MIT。
- 未来 Windows：WebView2 编解码能力不同 → 由前端能力上报驱动路由即可；`souvlaki` / 硬件编码器回退已预留。

---

## 7. 验证方式（实施阶段）
- Rust 单元测试：目录扫描过滤与自然排序、扩展名分类、GBK/UTF-8 歌词解码、ffprobe JSON 夹具 → 路由决策、帧率解析、Range 头解析、幻觉过滤。
- 集成测试：CI 中用 ffmpeg 生成正弦波 mp3/flac/ape 与 mkv/avi 测试片，验证各策略可输出可播放流。
- 前端 Vitest：LRC 解析/序列化往返、播放模式队列（随机一轮不重复、上一曲历史）、歌词当前行查找、虚拟时间轴换算。
- UI：Playwright 跑 Vite 开发页（Mock IPC）覆盖快捷键、进度拖动、歌词编辑器打标流程。
- 手动验收清单（在 Mac 上运行 `pnpm tauri dev`）：逐条对照需求 1–11 与波形。

---

## 9. 实现状态（v0.1.0）

| 项目 | 状态 | 说明 |
|---|---|---|
| 需求 1–7、10 | ✅ 已实现 | 见 README 功能表 |
| 需求 8 歌词页 / 上传 / 打标制作 | ✅ 已实现 | 打标、逐行编辑、预览、保存到歌曲目录 / 应用歌词库 / 导出 |
| 需求 9 模型识别歌词 | ✅ 已实现 | whisper.cpp（Metal）+ Silero VAD + 人声频段增强 + 幻觉过滤 + 繁转简 + 逐字时间；macOS CI 中有真实语音冒烟测试 |
| 需求 11 深浅色 / 主题色 / 背景图 | ✅ 已实现 | 另有“随封面变色” |
| 歌词页声波 | ✅ 已实现 | 横跨播放控制栏的低矮竖条（按用户反馈调整），Web Audio 分析器，回退为后端预计算响度包络 |
| 全格式播放 | ✅ 已实现 | 直放 / 音频转换缓存 / HLS 转封装 / HLS 硬件转码 + 虚拟时间轴 |
| 附加：倍速、A-B 循环、睡眠定时、断点续播 | ✅ 已实现 | |
| 附加：外挂/内嵌字幕、AI 生成视频字幕 | ✅ 已实现 | 仅文本字幕（PGS/VobSub 图形字幕暂不支持） |
| 附加：封面取色、卡拉 OK 逐字、截图、逐帧、媒体键/控制中心 | ✅ 已实现 | |
| 附加：均衡器、迷你播放器/画中画、桌面歌词、分享卡片、交叉淡入淡出、听歌统计 | ⏳ 未实现 | 后续迭代 |
| 深度学习人声分离（Demucs/MDX） | ⏳ 未实现 | 当前用 ffmpeg 滤镜做人声频段增强 |
| Apple 公证签名 | ⏳ 需开发者账号 | CI 目前为 ad-hoc 签名 |

### 已验证
- Rust：路由决策、ffprobe 解析、Range、歌词查找与 GBK 解码、后处理等单元测试；本机 ffmpeg 下的音频转换、HLS 转封装/转码与 HTTP 服务集成测试。
- 前端：LRC/SRT 解析与序列化、播放队列、颜色、格式化等 Vitest 单元测试。
- 真实 Tauri 应用（Linux WebKitGTK + Xvfb）端到端：命令行打开 WMA（实时转换）、同目录播放列表、同名歌词同步、MKV 转封装 + 外挂字幕、AVI 实时转码、超出已生成范围的拖动、打标并保存 .lrc、识别模型对话框。
- GitHub Actions：macOS arm64 构建 .app / .dmg。

### v0.1.1 体验修复（第 2 轮反馈）
- 全屏视频黑屏：沉浸模式下网格只剩 `main` 一个子项却被放进 0 高度的首行，已修复；全屏改为沉浸式观影（顶栏/控制栏自动隐藏、深色悬浮控制栏、单击暂停与双击全屏不再冲突、绿灯按钮/系统退出全屏时状态同步）。
- 播放列表单击即播、可收起（状态持久化，收起后右缘显示“列表”拉手）。
- macOS 红绿灯下移（`trafficLightPosition`），与顶栏按钮对齐。
- 播放栏等按钮悬停 1 秒显示功能与快捷键提示（自绘提示，替代系统 title）。
- 声波改为横跨整个播放控制栏的低矮镜像竖条（最高约 52px）。
- 高亮歌词严格居中；点击歌词立即高亮、280ms 快速滚动；字号 Aa 菜单（14–56px）与 ⌘+/⌘−/⌘0。
- ±15 秒按钮改为数字居中的圆形箭头图标。

### v0.2.0 媒体库（第 3 轮反馈）
- 媒体库：后端 `src-tauri/src/library/`（`library.json` 原子写入；4 线程增量扫描，`mtime` 和 `size` 未变则复用；离线根目录保留记录；排除列表）。
- 缩略图：本地服务 `/thumb` 路由，内嵌封面、文件夹封面或视频 10% 处截帧，ffmpeg 缩放后缓存为 JPEG，最多并发 3 个。
- 前端：媒体库页面（歌曲、专辑、艺术家、视频、收藏、最近播放、歌单），虚拟滚动列表，右键菜单，文件夹管理，拖入添加；从媒体库播放时队列 = 当前视图，播放列表显示来源。
- UI 文本中不再使用“·”，并由单元测试 `src/__tests__/no-middle-dot.test.ts` 检查。


# LightPlayer

轻量的 macOS 与 Windows 多媒体播放器。基于 **Tauri 2 + React + TypeScript**，
借助内置 **FFmpeg** 几乎支持所有音视频格式，并内置基于 **whisper.cpp** 的 **本地离线歌词识别**。
使用Claude编写代码。

## 功能

| 功能 | 说明 |
|---|---|
| 播放控制 | 播放/暂停、上一曲/下一曲、前进/后退 15 秒（可改为 10/30 秒）、倍速（0.5–3×，保持音高） |
| 播放模式 | 顺序 / 列表循环 / 单曲循环 / 随机（一轮内不重复，“上一曲”按真实播放历史） |
| 进度与音量 | 可拖动进度条（悬停预览时间、显示缓冲）、←/→ 键调整；滑条式**应用内**音量（不改系统音量） |
| 播放列表 | 自动读取当前文件所在目录的**同类**文件（音频只列音频、视频只列视频），自然排序，可搜索；单击即播，拖动调整顺序、移出列表；歌词页也能显示，窗口较窄时以悬浮面板显示 |
| 封面与信息 | 音频显示封面、标题、作者、专辑（标签 → 同目录 cover/folder.jpg → “歌手 - 歌名”文件名） |
| 歌词页 | 点击封面/歌名进入；自动加载同名 `.lrc/.srt/.vtt/.txt`（自动识别 GBK/Big5 编码）或内嵌歌词；滚动高亮（高亮颜色可自定义）、点击跳转、翻译行、逐字卡拉 OK、整体偏移、字号（Aa 菜单或 ⌘+/⌘−/⌘0，Windows 上为 Ctrl）；高亮行始终居中；没有则显示“暂无歌词”；播放页的歌词预览切换时带动画 |
| 桌面歌词 | 播放栏按钮打开悬浮在所有窗口之上的桌面歌词：每次一行，可改颜色、拖动位置、调整大小，右上角关闭 |
| 精确计时 | 部分下载的音乐文件会让 WebKit 的播放计时越走越偏（歌词越来越快）；检测到时自动改用 FFmpeg 解码的精确计时播放，也可在歌词页菜单手动开启 |
| 歌词上传与制作 | 上传歌词文件；歌词编辑器支持**打标**（边听边按空格打点）、**逐行编辑**（时间微调、插入/删除/排序、整体偏移）、预览；保存到歌曲目录（自动备份 `.lrc.bak`）、应用歌词库或导出 |
| **AI 识别歌词** | 本机离线运行 Whisper（Apple Silicon 使用 Metal GPU 加速，Windows 使用 CPU）；首次使用下载模型（可选国内镜像）；人声检测（Silero VAD）、人声频段增强、幻觉过滤、繁转简、逐字时间轴；结果正常滚动显示并提示“本歌词由识别模型生成，可能有误”，可直接进入编辑器校对保存；可重新识别（换模型）、移除 AI 歌词或重新查找本地歌词文件 |
| 识别任务 | 歌词和字幕识别任务排队依次进行：标题栏的识别任务面板显示进度，可暂停、取消、调整顺序、重试；媒体库右键可一次加入整个列表 |
| 视频信息 | 文件大小、分辨率、帧率、码率（总/视频/音频）、编码、HDR、声道等 |
| 外观 | 浅色/深色/跟随系统；默认主题色浅蓝 `#66ccff`，可选预设或自定义（文字自动保证对比度）；自定义背景图（模糊、遮罩、填充方式）；可随封面变色 |
| 媒体库 | 添加文件夹（递归扫描子文件夹，启动时增量刷新）、自动记录播放过的文件、把文件或文件夹拖进媒体库页面；按歌曲、专辑、艺术家、视频浏览，支持搜索、排序、收藏、自建歌单（拖动排序）、**把文件夹导入为歌单**、右键“下一首播放 / 加入播放队列”；专辑可从媒体库移除或移到废纸篓；从媒体库点开时播放队列就是当前视图；打开 App 时默认进入媒体库，播放页左上角可返回（`⌘L`） |
| 天气主题 | 外观选“天气”后，按当前位置的实时天气显示动态天空：晴天阳光、云、雨、雷电、雪、冰雹、雾和星空，雨滴、雪花和冰雹会落在播放栏、封面等界面元素上（macOS 使用系统定位服务，Windows 按网络大致位置定位，也可指定城市；天气来自免费的 Open-Meteo） |
| 无痕浏览 | 开启后打开的文件不留下记录：不进最近播放、不计播放次数和播放位置、不自动加入媒体库（⇧⌘N / Windows 上 Ctrl+Shift+N、设置或菜单栏 / 通知区域图标切换） |
| 后台与菜单栏 | 关闭窗口后继续在后台播放，macOS 顶部菜单栏图标（Windows 为任务栏通知区域图标）可播放 / 暂停、切歌、重新打开窗口或退出（可在设置中关闭；macOS 还可在菜单栏显示歌名） |
| 网易云音乐（试验性） | 在设置中开启并登录后，在媒体库侧栏播放歌单、我喜欢的音乐和每日推荐，可搜索、切换音质，使用网易云提供的歌词；播放网易云歌曲时可查看这首歌的**评论区**（热门 / 最新、楼层回复，快捷键 `C`）。使用非官方接口，随时可能失效 |
| **插件** | 安装插件改变界面布局、样式、文字和字体，以及播放页和歌词页的样式与设置；插件只包含样式表、字体和文字替换表，不能运行代码，可在“设置 > 插件”中安装、启用、排序和调整选项。插件把界面改乱时按 `⌥⇧⌘P`（Windows：`Ctrl+Alt+Shift+P`）进入安全模式。制作插件请看[插件开发标准](docs/plugins/README.md)，示例见 [`examples/plugins`](examples/plugins) |
| **自定义播放页** | 封面可以是方形或会转的黑胶唱片（带唱臂动画）；内置“默认”“黑胶唱片机”“唱片 + 左右分栏”三种布局；在播放页“布局 > 编辑布局…”中拖动调整各元素的位置和大小，设置字体、颜色、入场动画，添加文字、图片、时钟、进度环等；自己的布局可以导出为插件分享 |
| 自动更新 | 启动时和每隔 12 小时检查 GitHub Releases 上的新版本（可在“设置 > 关于”中关闭，或选择是否包括预发布版本）；有新版本时显示更新说明，一键下载（校验大小和 SHA-256）并安装，完成后自动重新打开。macOS 版、Windows 安装版和便携版都支持 |
| 其他 | A-B 段落循环、睡眠定时（渐弱暂停/本曲结束后）、断点续播、外挂/内嵌字幕、**AI 生成视频字幕**、视频截图、逐帧步进、全屏沉浸式观影（控制栏与顶栏自动隐藏）、按钮悬停 1 秒显示功能提示、拖拽打开、Finder / 文件资源管理器“打开方式”、macOS 控制中心 / Windows 媒体浮窗与媒体键 |

### 全格式播放原理

后端用 ffprobe 分析文件，并结合 WebView 上报的解码能力选择：

- **直接播放**：mp3 / aac / m4a / flac / wav / mp4(H.264/HEVC) 等。
- **音频转换缓存**：ape / wma / dsf / tta / wv … 解码为 FLAC 缓存后播放（缓存上限 2 GB）。
- **转封装**：mkv / flv / ts / avi 中的 H.264/HEVC 视频流复制进 HLS（无损、几乎不耗 CPU）。
- **实时转码**：wmv / rmvb / mpeg2 / 10-bit H.264 … 编码为 H.264 HLS（macOS 用 VideoToolbox 硬件编码，Windows 用 libx264）。

macOS 的 WebKit 和 Windows 的 WebView2 能直接解码的格式不同（例如 WebView2 不支持 ALAC、AIFF），前端会上报实际能力，后端据此自动改用转换。

拖动到尚未生成的位置时会从该处重新启动 ffmpeg（关键帧对齐），界面上的时间轴始终是完整时长。

## 快捷键

`空格` 播放/暂停，`←/→` 快退/快进，`J/L` ±15 秒，`↑/↓` 音量，`M` 静音，`⌘←/⌘→` 上/下一曲，
`⌘O` 打开，`⌘L` 媒体库，`⌘,` 设置，`Y` 歌词页，`E` 歌词编辑器，`I` 视频信息，`F` 全屏，`S` 截图，`,/.` 逐帧，
`[/]` 调速，`A` A-B 循环，`C` 网易云评论，`⌥⇧⌘P` 插件安全模式，`Esc` 返回

Windows 上 `⌘` 对应 `Ctrl`、`⇧` 对应 `Shift`，例如 `Ctrl+O` 打开、`Ctrl+Shift+N` 无痕浏览。

## 下载安装

在 [Releases](../../releases) 下载最新版本：

| 系统 | 文件 | 说明 |
|---|---|---|
| macOS 12+（Apple Silicon） | `LightPlayer_<版本>_aarch64.dmg` | 打开后拖进“应用程序” |
| Windows 10 / 11（x64） | `LightPlayer_<版本>_x64-setup.exe` | 安装到当前用户，不需要管理员权限 |
| Windows 10 / 11（x64） | `LightPlayer_<版本>_x64_portable.zip` | 便携版，解压后运行 `LightPlayer.exe` |

**macOS**：构建使用 ad-hoc 签名（未经 Apple 公证），首次打开时 macOS 大概率提示“无法验证开发者”或“已损坏”，只需执行：

```bash
xattr -dr com.apple.quarantine /Applications/LightPlayer.app
```

或在 Finder 中右键 → 打开（适用于较旧的macOS版本）。

**Windows**：安装程序未经代码签名，SmartScreen 提示“Windows 已保护你的电脑”时点“更多信息 → 仍要运行”。需要 Microsoft Edge WebView2 运行时（Windows 11 自带，安装版会自动安装）。Windows 不允许程序自己设为默认应用，可在“设置 > 媒体库 > 文件关联”中打开系统的“默认应用”设置选择 LightPlayer。

## 本地开发

需要：Node 20+、pnpm 10、Rust（stable）、CMake；macOS 另需 Xcode Command Line Tools，Windows 另需 Visual Studio Build Tools（“使用 C++ 的桌面开发”）和 Git Bash。

```bash
pnpm install
bash scripts/fetch-ffmpeg.sh          # 下载 ffmpeg/ffprobe sidecar 到 src-tauri/binaries/
pnpm tauri dev                         # 开发模式
pnpm tauri build --bundles app,dmg     # 打包（macOS）
pnpm tauri build --bundles nsis        # 打包（Windows，需先运行 fetch-ffmpeg.sh 下载 .exe 版 ffmpeg）
```

- `pnpm test`：前端单元测试（LRC 解析、播放队列、颜色等）
- `cd src-tauri && cargo test`：后端测试（路由决策、Range、歌词查找/编码、HLS 与转码集成测试需要本机 ffmpeg）
- `pnpm dev` 可在普通浏览器中预览界面（使用内置 Mock，本地文件通过文件选择器打开）

数据位置：macOS 为 `~/Library/Application Support/com.lightplayer.app/`，Windows 为 `%APPDATA%\com.lightplayer.app\`
（`models/` 识别模型、`lyrics/` 应用歌词库、`backgrounds/`）；
缓存位于 `~/Library/Caches/com.lightplayer.app/`（Windows：`%LOCALAPPDATA%\com.lightplayer.app\`）。

## 许可说明

应用代码可自由使用。随包分发的 FFmpeg 静态构建（来自 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)）包含 GPL 组件，
仅以独立进程方式调用；若要公开分发，请遵守相应许可证，或替换为 LGPL 构建（`scripts/fetch-ffmpeg.sh` 支持切换来源）。
Whisper 模型与 whisper.cpp 以 MIT 许可开源。

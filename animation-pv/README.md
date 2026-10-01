# LightPlayer 功能宣传片

用 **JavaScript + Three.js（WebGL2）+ GLSL** 实时渲染的 LightPlayer 功能宣传片，Apple 产品片风格，全长 45 秒，配乐由 Web Audio 实时合成。

片中出现的 LightPlayer 界面（播放页、歌词页、AI 识别、媒体库、视频全屏、天气主题、桌面歌词、菜单栏）全部用 Canvas2D 按 App 自身的样式和尺寸（`src/styles/app.css` 与各个组件）逐一绘制，图标沿用 `src/components/Icon.tsx` 的同一份路径数据，没有使用任何截图。

| 文件 | 说明 |
|---|---|
| [`zh.html`](zh.html) | 中文版（中文字幕、中文界面） |
| [`en.html`](en.html) | 英文版（英文字幕，界面文字为本地化后的英文） |
| [`index.html`](index.html) | 版本选择页 |

两个版本彼此独立，每一版从头到尾只出现一种语言的文字。所有文件都不含间隔号（U+00B7）。

## 观看

直接用浏览器打开 `zh.html` 或 `en.html` 即可（新版 Chrome、Edge、Safari、Firefox；需要 WebGL2），点“播放”开始。也可以在仓库根目录起一个静态服务器再打开，例如：

```bash
npx serve .
# 然后访问 http://localhost:3000/animation-pv/zh.html
```

| 操作 | 按键 |
|---|---|
| 播放 / 暂停 | 空格，或点击画面 |
| 快退 / 快进 5 秒 | ← / → |
| 全屏 | F |
| 声音开关 | M |
| 回到开头 | Home |

控制条上的红点按钮会从头录制一遍并下载为 WebM 视频（画面与配乐）。

### 地址参数

| 参数 | 作用 |
|---|---|
| `?t=20` | 从第 20 秒开始 |
| `?autoplay` | 打开后立即播放（浏览器可能需要先有一次点击才能出声） |
| `?mute` | 不播放配乐 |
| `?res=1080` | 固定渲染分辨率（画面高度，像素） |
| `?ui=1.5` | 界面贴图的缩放（默认 2，数值越小越快） |
| `?nomsaa` | 关闭多重采样抗锯齿 |
| `?capture=1` | 逐帧渲染模式，供下面的导出脚本使用 |

## 导出 MP4

`tools/render.mjs` 逐帧渲染（与机器快慢无关），再用 OfflineAudioContext 渲染配乐，最后用 ffmpeg 合成 H.264 + AAC：

```bash
npm i -D playwright      # 或全局安装
node animation-pv/tools/render.mjs --lang zh --height 1080 --fps 30 --out LightPlayer-PV-zh.mp4
node animation-pv/tools/render.mjs --lang en --height 1080 --fps 30 --out LightPlayer-PV-en.mp4
```

可选：`--from` / `--to`（秒）、`--crf`（画质，默认 18）、`--mute`、`--ui 1.5`、`--nomsaa`。需要本机已安装 ffmpeg。

## 分镜

配乐 128 BPM，一小节 1.875 秒，全片 24 小节。镜头在小节线上硬切，切点处有一次推近和径向动态模糊，标题逐字浮现。

| 时间 | 场景 | 内容 |
|---|---|---|
| 0:00 | 开场 | “每一首歌。每一部电影。每一句歌词。”踩着鼓点出现，光点汇聚成 App 图标 |
| 0:03 | 登场 | 笔记本开盖，屏幕亮起播放页（封面、歌词预览、播放列表、播放栏） |
| 0:07 | 全格式 | 格式标签穿梭而过，再归入直接播放、无损转封装、音频转换、硬件实时转码四列 |
| 0:11 | 歌词 | 歌词页随歌声滚动、逐字高亮，光标点按一句后跳转 |
| 0:15 | AI 识别 | “暂无歌词”，点“AI 识别歌词”，声谱和识别出的字词飞入歌词页，出现 AI 歌词提示条 |
| 0:20 | 桌面歌词 | macOS 桌面上的桌面歌词：悬停、换颜色；关掉窗口后在菜单栏菜单里继续控制 |
| 0:24 | 天气主题 | 雷雨，切到播放栏上的水花特写，再到落雪（播放栏积雪）和星空 |
| 0:30 | 媒体库 | 专辑封面从网格中浮起，再切到歌曲列表 |
| 0:33 | 视频 | 海边日落（GLSL 实时生成的画面），进入沉浸式全屏，AI 字幕，控制栏自动隐藏 |
| 0:37 | 还有更多 | A-B 循环、倍速、睡眠定时、断点续播、无痕浏览、歌词编辑器等功能卡片 |
| 0:41 | 结尾 | 3D 图标、口号、适用平台与项目地址 |

片中的歌曲、歌手、专辑和歌词都是为宣传片原创的虚构内容。

## 结构

| 文件 | 内容 |
|---|---|
| `js/ui.js` | 界面绘制：标题栏、播放栏、播放页、播放列表、歌词页、AI 识别卡片、媒体库、视频页、桌面歌词、菜单栏 |
| `js/icons.js` | App 图标集（与 `Icon.tsx` 相同的路径数据） |
| `js/art.js` | 程序生成的专辑封面与 App 图标 |
| `js/tiles.js` | “还有更多”的功能卡片 |
| `js/shaders.js` | GLSL：窗口合成（界面叠加在天气天空或视频画面上，雨、雪、水花、积雪、星空）、背景、粒子、声谱、泛光与调色 |
| `js/world.js` | Three.js 场景：渲染器与后期、反射环境、笔记本、App 窗口、3D 图标、粒子、格式标签、桌面 |
| `js/scenes.js` | 时间线：每一帧都是时间的纯函数，可任意跳转、逐帧导出 |
| `js/captions.js` | 字幕排版与出入场动画 |
| `js/music.js` | Web Audio 程序化配乐 |
| `js/main.js` | 播放器：时钟、控制条、录制、逐帧导出接口 |
| `js/copy.zh.js` / `js/copy.en.js` | 两个版本的字幕和界面文字 |
| `js/vendor/three.min.js` | three.js r170（MIT 许可，见 `js/vendor/LICENSE-three.txt`） |

界面使用 `-apple-system`、PingFang SC 等系统字体，在 Mac 上观看效果与 App 一致。

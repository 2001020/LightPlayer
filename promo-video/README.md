# LightPlayer 宣传片：一条进度线

用 [onetake](https://github.com/feitangyuan/onetake) 制作的 LightPlayer 宣传动画。16:9，35.5 秒，画面文字只有简体中文，没有配乐，只有几处轻微的合成音效。

成片：[`LightPlayer-promo-1080p30.mp4`](LightPlayer-promo-1080p30.mp4)（1920×1080，30 帧，带运动模糊）

之前用 Remotion 做的三个风格候选和文字编辑器都移到了 [`old/`](old)，在那个文件夹里照旧可以运行。

## 片子讲什么

全片只有一条线，它就是播放栏上的进度条，每一段都从上一段长出来，没有硬切换场：

| 时间 | 画面 | 大标题 |
|---|---|---|
| 0 – 2.6 秒 | 白底上一个点，拉成一条线 | |
| 2.6 – 7.7 秒 | 线变成播放栏，播放栏长成媒体库窗口；手点开专辑墙；窗口收回线里 | 几乎所有格式 打开就播、你的音乐 一目了然 |
| 7.6 – 10.3 秒 | 线飞起来，变成滚动歌词下的高亮线 | |
| 10.3 – 13.0 秒 | 当前这句歌词落到桌面上，变成桌面歌词，桌面从它四周展开又收回 | 歌词 浮在桌面上 |
| 13.0 – 16.5 秒 | 线卷成唱片纹路，黑胶转起来；纹路换成几种主题色 | 让唱片转起来、主题色 随心换 |
| 16.7 – 20.6 秒 | 线摊平成地平线，天气主题的天空升起：黄昏、雨、雪、星夜 | 窗外的天气 就是主题 |
| 20.6 – 28.0 秒 | 地平线收回播放栏，长成网易云音乐每日推荐；手点亮红心，再点开评论区 | 网易云音乐 也能听、点亮红心、一起看评论 |
| 28.0 – 31.9 秒 | 线连起两台电脑，两边进度一起走 | 两台电脑 同步播放 |
| 31.9 – 35.5 秒 | 线收到 LightPlayer 下面，下面是仓库地址 github.com/2001020/LightPlayer | |

## 画面从哪里来

媒体库、专辑墙、网易云歌单、评论区、黑胶、天空都是 App 自己的界面，不是重画的：`tools/capture.py` 打开 App 的浏览器预览（`pnpm dev`，内置 Mock），把 Mock 里的占位歌曲换成片子用的虚构歌曲和封面，开启网易云音乐，按顺序截下需要的画面（2 倍分辨率），存到 `footage/`。只有歌词和桌面歌词是按 App 的样式重排的文字（线要贴在当前这一句下面），桌面背景是画出来的渐变。

- 歌名、歌手、歌词、封面和媒体库里的文件都是为宣传片虚构的内容（封面来自 `old/src/shared/covers.ts`），评论区是 App Mock 自带的示例评论。
- 进度条在截图里被隐藏，由片子自己画，所以线和播放栏能无缝衔接。`footage/rects.json` 记录了进度条、红心、评论按钮等在截图里的位置。

## 重新渲染

需要 Python 3、`playwright`（Chromium）、`numpy`、`scipy`、`Pillow`、`ffmpeg`，以及 onetake 的 `scripts/render.py`（在 onetake 仓库里）。

```bash
python3 tools/score.py                                                   # 音效 → sfx.wav
python3 <onetake>/scripts/render.py comp.html --out LightPlayer-promo-1080p30.mp4 --sfx sfx.wav --gap 8 --samples-max 48   # 1080p30
python3 <onetake>/scripts/render.py comp.html --out LightPlayer-promo-4k60.mp4 --final --sfx sfx.wav --gap 8 --samples-max 48   # 4K60
```

`--gap 8` 让快速运镜的运动模糊足够细，不出现重影。不要音效时去掉 `--sfx sfx.wav`，导出的视频没有音轨，可以自己配乐。

预览：用浏览器打开 `comp.html?play` 循环播放，`comp.html?t=13.5&hud` 停在某一帧。

重新截图（App 界面改版之后）：

```bash
pnpm dev --port 5173          # 在仓库根目录
python3 tools/capture.py      # 在 promo-video 目录
```

改了画面文字之后要重新生成字体：`python3 <onetake>/scripts/look.py apply look.json comp.html --cjk NotoSansSC-Bold.otf`（思源黑体 Noto Sans SC Bold）。`look.js` 里内嵌了只含片中用字的字体子集，渲染时不需要联网。

## 文件

```
comp.html        合成：每个画面都是时间 t 的函数（window.__seek(t)）
motion.js        onetake 的动作库（弹簧、相机、转场）
look.js          颜色和内嵌字体（look.py 生成，不要手改）
look.json        配色：App 的浅色底、主题色 #66ccff、红心的网易云红
sfx.wav          音效（tools/score.py 生成）
footage/         App 真实界面截图、天空、封面、图标、rects.json
tools/
  capture.py     从 App 浏览器预览截取素材
  covers.mjs     把 old/ 里的原创封面导出成 footage/covers.json
  score.py       音效：按 comp.html 的时间轴放置
  sfx_palette.py onetake 的合成音色
old/             之前的 Remotion 版本（三个风格候选和文字编辑器）
```

## 许可

`motion.js`、`tools/sfx_palette.py` 和合成方法来自 onetake，采用 [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/) 许可，只能用于非商业用途。字体为 Inter 与 Noto Sans SC（SIL Open Font License）。

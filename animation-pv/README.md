# LightPlayer 宣传动画

`LightPlayer-PV.mp4`：64 秒，1920×1080，24 帧每秒，无配乐。分镜与每个镜头的时间安排见 [STORYBOARD.md](STORYBOARD.md)。

画面是手绘纸面风格：面板、封面、唱片、天空和角色 Clawd 用 [p5.brush](https://github.com/acamposuribe/p5.brush) 平涂加墨线绘制，
动画框架来自 [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)（MIT，见 [LICENSE](LICENSE)）。

## 界面是按软件代码重新绘制的

[src/ui.js](src/ui.js) 用软件源码里的数据重新画出 LightPlayer 的界面，没有使用截图：

| 内容 | 来源 |
|---|---|
| 图标 | `src/components/Icon.tsx` 的 SVG 路径（24px 网格，线宽 1.8，圆头），以及 `SkipIcon` 和唱臂 `Tonearm` |
| 应用图标 | `assets/icon.svg` 的圆角方块、渐变、播放三角和三根音量条 |
| 尺寸与颜色 | `src/styles/app.css` 的变量：标题栏 44px、播放栏 92px、圆角 8/12/18px、浅色主题与天气主题的配色 |
| 主题色 | `src/lib/color.ts` 的 `accentPalette()`（原样移植），`ACCENT_PRESETS` 等预设色 |
| 布局 | 媒体库（`LibraryPage.tsx`、`TrackTable.tsx`）、内置布局“唱片 + 左右分栏”（`src/layout/model.ts` 的坐标与 u 单位）、经典播放页、歌词页、识别进度卡片、桌面歌词（`DesktopLyrics.tsx`） |
| 天空 | `src/core/weather/scene.ts` 的九个时段配色与对应主题色 |
| 文案 | 各组件里的中文界面文字 |

歌曲、歌手、专辑、封面和歌词是为动画虚构的。

## 重新渲染

需要 Node.js 20+、Chromium（或 Chrome）和 ffmpeg。

```bash
npm install
export CHROME_PATH=/path/to/chrome          # 找不到浏览器时设置
npm run sheet                               # 联系表：out/sheet.jpg
npm run frames                              # 逐帧渲染到 out/frames（可并行、可续传）
npm run encode                              # 合成 out/LightPlayer-PV.mp4
```

也可以用 Chrome 打开 `studio.html` 拖动进度条预览。

没有独立显卡的机器上（`--soft-gl`，软件渲染 WebGL），p5.brush 的水彩 `fill` 在一个页面里画过几十次之后会让每帧变慢到十秒左右，
所以 [src/core.js](src/core.js) 把水彩填充改成了平涂（`FILL_AS_WASH`），光晕 `glow()` 也改为在文字层上绘制径向渐变。

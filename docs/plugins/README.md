# LightPlayer 插件开发标准

简体中文 | [English](README.en.md)

> 适用版本：LightPlayer 1.6.0 及以上，`manifestVersion: 1`

LightPlayer 插件可以改变：

- 界面布局
- 元素样式
- 界面文字
- 字体
- 播放页和歌词页的样式与设置

插件是**声明式**的，由下面几部分组成：

- 一个 `manifest.json`
- 样式表（CSS）
- 字体文件
- 一张文字替换表
- 少量设置项

插件**不能运行任何代码**（不支持 JavaScript），所以安装别人做的插件是安全的：插件读不到你的文件、账号和播放记录，也无法联网。

本文档就是插件的标准。符合这里规则的插件可以安装；本文列出的“公开接口”会在今后的版本中保持稳定。

- [快速开始](#快速开始)
- [插件包结构](#插件包结构)
- [manifest.json](#manifestjson)
- [公开接口](#公开接口)
  - [区域锚点 data-lp](#区域锚点-data-lp)
  - [html 上的状态属性](#html-上的状态属性)
  - [公开 CSS 变量](#公开-css-变量)
- [改变样式与布局](#改变样式与布局)
- [改变界面文字](#改变界面文字)
- [改变字体](#改变字体)
- [改变播放页 / 歌词页的设置（config）](#改变播放页--歌词页的设置config)
- [可调选项（options）](#可调选项options)
- [规则与限制](#规则与限制)
- [打包与安装](#打包与安装)
- [调试](#调试)
- [安全模式](#安全模式)
- [示例插件](#示例插件)

---

## 快速开始

1. 新建一个文件夹 `my-theme`，在里面放两个文件。

   `manifest.json`：

   ```json
   {
     "$schema": "https://raw.githubusercontent.com/2001020/LightPlayer/HEAD/docs/plugins/manifest.schema.json",
     "manifestVersion": 1,
     "id": "com.example.my-theme",
     "name": "我的主题",
     "version": "1.0.0",
     "styles": ["style.css"]
   }
   ```

   `style.css`：

   ```css
   :root {
     --cover-radius: 50%;          /* 圆形封面 */
     --lyric-active-scale: 1.15;   /* 当前歌词更大 */
   }
   [data-lp="chips"] { display: none; }  /* 隐藏歌曲信息下的标签 */
   ```

2. 打开 LightPlayer，进入 **设置 > 插件 > 从文件夹安装…**，选择 `my-theme` 文件夹。
3. 打开“我的主题”的开关，修改会立即生效。

之后在插件文件夹里修改文件，再点 **重新加载**（↻），不需要重启 App。

## 插件包结构

```
com.example.my-theme/          ← 安装后的文件夹名 = id
├── manifest.json              ← 必需
├── style.css                  ← styles 中列出的样式表
├── strings.json               ← 可选：文字替换表
├── fonts/MyFont.woff2         ← 可选：字体
├── layouts/turntable.json     ← 可选：播放页布局
├── images/bg.png              ← 可选：CSS 或布局中引用的图片
└── preview.png                ← 可选：插件列表中的缩略图（建议 4:3）
```

- 插件中所有文件通过相对路径引用，统一用 `/` 分隔。CSS 里的 `url(images/bg.png)` 相对于该 CSS 文件解析。
- 插件安装在 App 数据目录下的 `plugins` 文件夹中，可以在设置里点 **打开插件文件夹** 找到：
  - macOS：`~/Library/Application Support/com.lightplayer.app/plugins/`
  - Windows：`%APPDATA%\com.lightplayer.app\plugins\`

## manifest.json

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `manifestVersion` | `1` | 是 | 标准的版本，目前只能是 `1` |
| `id` | string | 是 | 唯一标识。3–64 个字符，只能使用小写字母、数字、`.` 和 `-`，并以字母或数字开头和结尾。建议用反向域名，例如 `com.example.my-theme`。安装后作为文件夹名 |
| `name` | string | 是 | 显示名称，最多 40 个字符 |
| `version` | string | 是 | 插件自己的版本，如 `1.0.0` |
| `minAppVersion` | string | 否 | 需要的最低 LightPlayer 版本，如 `1.6.0`。App 版本更低时插件无法启用 |
| `author` | string | 否 | 作者，最多 64 个字符 |
| `description` | string | 否 | 简介，最多 300 个字符 |
| `homepage` | string | 否 | 主页，`http(s)://` 链接 |
| `preview` | string | 否 | 缩略图：png / jpg / webp / gif / svg |
| `styles` | string[] | 否 | 样式表（`.css`），按顺序加载，最多 20 个 |
| `fonts` | object[] | 否 | 字体，见[改变字体](#改变字体) |
| `strings` | string 或 object | 否 | 文字替换表：`.json` 文件路径，或直接写成对象，见[改变界面文字](#改变界面文字) |
| `config` | object | 否 | 启用时调整的 App 设置，见 [config](#改变播放页--歌词页的设置config) |
| `options` | object[] | 否 | 用户可调的选项，最多 50 个，见 [options](#可调选项options) |
| `layouts` | string[] | 否 | 播放页布局（`.json`），最多 10 个，见[播放页布局](#播放页布局layouts)。需要 LightPlayer 1.6.0b2 或更新版本 |

其他字段（例如 `$schema`）会被忽略。完整的 JSON Schema 见 [`manifest.schema.json`](manifest.schema.json)，在 VS Code 等编辑器中写上 `$schema` 就能获得补全和检查。

## 公开接口

LightPlayer 自身的 class 名属于内部实现，可能随版本变化。**插件应该只依赖下面三类公开接口。** 其他选择器也能用，但不保证在新版本中继续有效。

### 区域锚点 data-lp

界面的主要区域带有 `data-lp` 属性，用 `[data-lp="名称"]` 选择：

<!-- anchors -->
| 锚点 | 位置 |
| --- | --- |
| `titlebar` | 窗口顶部标题栏 |
| `main` | 标题栏与播放栏之间的主区域 |
| `player` | 播放页（音频和视频） |
| `now-playing` | 经典样式的音频播放区：封面 + 歌曲信息 |
| `cover` | 封面：经典样式的封面；自由布局中的方形封面，或唱片中间的封面 |
| `flow` | Flow 样式（封面墙）的整个区域 |
| `track-info` | 歌曲信息区（经典样式和 Flow 样式都有） |
| `track-title` | 歌名 |
| `track-artist` | 艺人 |
| `track-album` | 专辑 |
| `chips` | 歌曲信息下的标签（格式、AI 歌词、评论等） |
| `lyric-peek` | 播放页上的两行歌词预览 |
| `lyric-peek-line` | 歌词预览中的一组行（切换时有进出动画） |
| `player-layout` | 自由布局（除“默认”外的播放页布局）的整个舞台 |
| `layout-item` | 自由布局中的一个元素。另有 `data-kind`（元素类型，见[播放页布局](#播放页布局layouts)）和 `data-id` 属性 |
| `vinyl` | 唱片形封面（含唱片、封面和唱臂）。播放时带有 `playing` class |
| `tonearm` | 唱片的唱臂 |
| `layout-editor` | 编辑布局时的设置面板 |
| `video` | 视频画面区域 |
| `subtitles` | 视频字幕 |
| `lyrics-page` | 歌词页 |
| `lyrics-head` | 歌词页顶部：返回、歌名、工具按钮 |
| `lyrics-body` | 歌词页的歌词区域 |
| `lyric-scroll` | 滚动的歌词列表 |
| `lyric-line` | 一行歌词。当前行另有 `data-active` 属性 |
| `lyric-translation` | 歌词行中的翻译 |
| `transport` | 底部播放栏 |
| `progress` | 播放栏中的进度条行 |
| `transport-controls` | 播放栏中进度条以下的部分 |
| `transport-now` | 播放栏左侧：封面缩略图、歌名 |
| `transport-center` | 播放栏中间：播放模式、上一曲、播放、下一曲等 |
| `transport-right` | 播放栏右侧：音质、评论、速度、定时、字幕、列表、音量等 |
| `volume` | 音量 |
| `playlist` | 播放列表（侧栏或浮动面板） |
| `comments` | 网易云评论面板 |
| `library` | 媒体库页面 |
| `library-sidebar` | 媒体库侧栏 |
| `library-main` | 媒体库内容区域 |
| `track-table` | 歌曲列表 |
| `settings` | 设置窗口 |
| `update` | 发现新版本时的更新窗口 |
| `desktop-lyrics` | 桌面歌词窗口 |
| `desktop-lyrics-line` | 桌面歌词的文字 |
<!-- /anchors -->

锚点只保证这个元素本身存在、含义不变。锚点内部的结构和 class 不属于公开接口。

### html 上的状态属性

`<html>` 元素上的属性反映 App 当前的状态，可以用来只在特定情况下应用样式：

<!-- root-attrs -->
| 属性 | 取值 | 说明 |
| --- | --- | --- |
| `data-window` | `main` / `desktop-lyrics` | 主窗口或桌面歌词窗口 |
| `data-platform` | `macos` / `windows` | 操作系统 |
| `data-theme` | `light` / `dark` | 当前实际使用的明暗模式 |
| `data-bg` | `image` / `weather` / 无 | 背景是图片（自定义背景或封面）、天气动画，还是纯色 |
| `data-page` | `player` / `lyrics` / `library` | 当前页面 |
| `data-media` | `audio` / `video` / `none` | 正在播放的媒体类型 |
| `data-player-style` | `classic` / `flow` | 音频播放页样式 |
| `data-fullscreen` | `true` / `false` | 是否全屏 |
| `data-player-layout` | `classic` / `free` | 经典样式的播放页用的是默认布局，还是自由布局（内置的唱片布局、用户或插件的布局） |
| `lang` | `zh-Hans` / `zh-Hant` / `en` / `ja` / `ko` | 界面语言（1.6.0b4 起） |
<!-- /root-attrs -->

例如只在深色模式的歌词页生效：

```css
:root[data-theme="dark"][data-page="lyrics"] [data-lp="lyric-line"] { letter-spacing: 0.04em; }
```

### 公开 CSS 变量

在 `:root` 上覆盖这些变量，是改变外观最稳妥的方式：

<!-- css-vars -->
| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `--font-fallback` | 系统字体栈 | App 默认字体，自定义字体时用来兜底 |
| `--font` | `var(--font-fallback)` | 全局界面字体 |
| `--title-font` | `var(--font)` | 播放页和歌词页的歌名字体 |
| `--lyric-font` | `var(--font)` | 歌词字体（含桌面歌词） |
| `--mono` | 等宽字体栈 | 时间码等等宽文字 |
| `--lyric-weight` | `600` | 歌词字重 |
| `--lyric-line-height` | `1.45` | 歌词行高 |
| `--lyric-gap` | `2px` | 歌词行之间的额外间距 |
| `--lyric-dim` | `48%` | 普通歌词行的不透明度（天气主题下为 66%） |
| `--lyric-near` | `62%` | 当前行相邻行的不透明度（天气主题下为 80%） |
| `--lyric-active-scale` | `1.08` | 当前行的放大比例 |
| `--lyric-hl` | 主题色 | 当前行高亮颜色（用户在歌词页选择颜色时会覆盖） |
| `--cover-size` | `min(32vh, 28vw, 300px)` | 经典样式封面边长 |
| `--cover-radius` | `16px` | 封面圆角 |
| `--cover-shadow` | 阴影 | 封面阴影 |
| `--radius-s` / `--radius` / `--radius-l` | `8px` / `12px` / `18px` | 按钮、面板、对话框的圆角 |
| `--titlebar-h` | `44px` | 标题栏高度 |
| `--transport-h` | `92px` | 播放栏高度 |
| `--accent` | 用户主题色 | 主题色（由用户设置写入；插件一般不要覆盖，想改主题色请用 `config.accent`） |
| `--bg` / `--panel` / `--panel-solid` / `--panel-2` | 随明暗模式 | 背景、半透明面板、不透明面板、次级底色 |
| `--text` / `--text-dim` / `--text-faint` | 随明暗模式 | 主要、次要、弱化文字颜色 |
| `--border` / `--hover` / `--shadow` | 随明暗模式 | 边框、悬停底色、阴影 |
<!-- /css-vars -->

颜色变量在浅色、深色、图片背景和天气主题下各有一组值，由 `:root[data-theme="dark"]`、`:root[data-bg="image"]` 等选择器设置。插件覆盖颜色时，请同时考虑这几种情况，例如：

```css
:root { --panel: rgba(255, 255, 255, 0.6); }
:root[data-theme="dark"] { --panel: rgba(20, 20, 26, 0.6); }
```

## 改变样式与布局

插件样式表加载在 App 自身样式之后，按设置中插件列表的顺序加载（**靠下的插件优先**）。选择器优先级相同时，插件的规则生效。

- **改样式**：覆盖公开变量，或给锚点写规则。
- **隐藏元素**：`display: none`。
- **改布局**：锚点是普通的 flex / grid 容器，可以改 `flex-direction`、`order`、`gap`、`grid-template-*` 等。例如把封面放到歌曲信息上方：

  ```css
  [data-lp="now-playing"] { flex-direction: column; text-align: center; }
  [data-lp="now-playing"] [data-lp="track-info"] { align-items: center; }
  ```

- **按状态区分**：配合 [html 上的状态属性](#html-上的状态属性)，以及选项产生的 class（见 [options](#可调选项options)）。
- **背景图片**：`[data-lp="lyrics-page"] { background: url(images/paper.png); }`（图片放在插件文件夹中）。

一般不需要 `!important`。只有在需要覆盖 App 写在元素上的内联样式时才需要，例如歌词字号来自用户设置。改歌词字号更好的方式是用 `config.lyricFontSize`。

## 改变界面文字

`strings` 是一张“原文 → 替换文字”的表。可以写成文件路径：

```json
{ "strings": "strings.json" }
```

`strings.json`：

```json
{
  "媒体库": "Library",
  "播放全部": "Play All",
  "共 {n} 条": "{n} comments",
  "第 {i} 首，共 {n} 首": "{i} of {n}"
}
```

也可以直接在 manifest 中写成对象。

**原文始终是简体中文。** LightPlayer 自带的繁體中文、English、日本語、한국어 界面也是用同样的文字替换实现的（[src/i18n/locales](../../src/i18n/locales)）。无论用户选择哪种界面语言，插件文字表的原文都写界面的简体中文原文；插件的条目优先于内置语言。只想在某种语言下生效的样式，可以用 `:root[lang="en"]` 这样的选择器。

匹配规则：

- **整段完全匹配**：界面上一段文字去掉首尾空白后与原文完全相同才会替换，原有的首尾空白会保留。不做部分替换，所以“媒体库”不会改到“从媒体库移除”。后者需要单独写一条。
- **占位符**：原文中的 `{名字}` 匹配任意文字（至少一个字符），可以在替换文字中原样使用。名字由字母、数字和下划线组成。
- 同时替换按钮的提示文字和无障碍名称（`title`、`placeholder`、`aria-label`、`data-tip`）。
- 一个元素只包含文字时，按整个元素的文字匹配。所以像“共 12,345 条”这样由几段拼成的文字也能整体匹配。
- 多个插件替换同一段文字时，靠下的插件优先。
- 占位符代表的文字也会再查一次表，所以“保存失败：{a}”中的错误信息也能被替换。
- 菜单栏 / 通知区域图标的菜单，以及打开、保存、确认对话框的标题和按钮，也使用替换后的文字（1.6.0b4 起）。
- 不会替换的内容：
  - 用户的内容：歌词、歌名、艺人、专辑、文件名、歌单名、评论（这些区域带有 `data-lp-raw` 属性）
  - 输入框中的文字
  - 其他系统原生的界面：macOS 的应用菜单、系统对话框中的系统文字、通知
- 文字表最多 5000 条。

> 原文以当前版本的界面为准。App 更新后个别文字可能变化，对应的条目就不再生效，不会出错。

## 改变字体

字体有两种来源：

**系统字体**：直接在 CSS 中使用。

```css
:root { --lyric-font: "Songti SC", "SimSun", serif; }
```

**插件自带字体**：在 `fonts` 中声明，App 会生成对应的 `@font-face`。

```json
"fonts": [
  { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Regular.woff2", "weight": 400 },
  { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Bold.woff2", "weight": 700 }
]
```

```css
:root {
  --font: "LXGW WenKai", var(--font-fallback);   /* 整个界面 */
  --lyric-font: "LXGW WenKai", serif;             /* 只改歌词 */
}
```

- 格式支持 woff2（推荐）、woff、ttf、otf。
- `weight` 可以是数字或字符串，`style` 可选 `normal` / `italic`。
- 中文字体文件很大，建议用 woff2 并只包含需要的字重。整个插件包不能超过 30 MB。
- 请确认字体的授权允许再分发。

## 改变播放页 / 歌词页的设置（config）

`config` 中的设置会在插件**启用时**写入 App 设置：

```json
"config": { "lyricAlign": "left", "lyricFontSize": 30, "playerStyle": "flow" }
```

<!-- config-keys -->
| 键 | 取值 | 对应的设置 |
| --- | --- | --- |
| `theme` | `system` / `light` / `dark` / `weather` | 外观模式 |
| `accent` | `#RRGGBB` | 主题色 |
| `dynamicAccent` | true / false | 随封面变色 |
| `coverBackground` | true / false | 播放音乐时使用封面作为背景 |
| `playerStyle` | `classic` / `flow` | 播放器样式 |
| `lyricFontSize` | 14–56 | 歌词字号 |
| `lyricAlign` | `center` / `left` | 歌词对齐 |
| `showTranslation` | true / false | 显示歌词翻译 |
| `karaoke` | true / false | 逐字高亮 |
| `lyricHighlight` | `#RRGGBB` 或 `null` | 当前歌词高亮颜色（`null`：跟随主题色） |
| `desktopLyrics.color` | `#RRGGBB` | 桌面歌词颜色 |
<!-- /config-keys -->

- 启用时会记下这些设置原来的值。停用插件后自动恢复原值；如果用户在此期间自己改过某项，那一项就保留用户的选择。
- 插件启用期间，用户仍然可以在设置中修改这些项。
- 不在表中的键会导致插件校验失败。其他设置（例如音量、播放记录）插件不能修改。

## 可调选项（options）

选项会显示在 **设置 > 插件** 中该插件的“插件选项”里，修改后立即生效。选项的值会写成 CSS 变量，或者在 `<html>` 上加 class，由插件的 CSS 使用。

```json
"options": [
  { "id": "size", "label": "封面大小", "type": "range", "min": 200, "max": 420, "step": 10, "unit": "px", "default": 320, "var": "--mt-cover" },
  { "id": "glow", "label": "发光颜色", "type": "color", "default": "#ffd166", "var": "--mt-glow" },
  { "id": "compact", "label": "紧凑模式", "type": "toggle", "default": false, "class": "mt-compact" },
  { "id": "layout", "label": "布局", "type": "select", "default": "side",
    "choices": [ { "value": "side", "label": "并排" }, { "value": "stack", "label": "上下", "class": "mt-stack" } ] }
]
```

```css
:root { --cover-size: var(--mt-cover); }
:root.mt-compact [data-lp="transport"] { padding-block: 4px; }
:root.mt-stack [data-lp="now-playing"] { flex-direction: column; }
```

| 类型 | 必需字段 | 产生的效果 |
| --- | --- | --- |
| `range` | `min`、`max`、`default`、`var`；可选 `step`（默认 1）、`unit` | `var` 变量 = 数值 + `unit`，例如 `320px` |
| `color` | `default`（`#RRGGBB`）、`var` | `var` 变量 = 颜色 |
| `toggle` | `default`（true / false），`class` 和 `var` 至少一个 | 打开时 `<html>` 加上 `class`；`var` 变量为 `1` / `0` |
| `select` | `choices`（1–30 项，每项 `value`、`label`，可选 `class`）、`default` | 选中项的 `class` 加到 `<html>` 上；有 `var` 时变量 = 选中的 `value` |

所有选项都可以写 `description`，会显示在选项下方作为说明。

- `id` 在插件内唯一，由字母、数字、`_`、`-` 组成。
- 变量写在 `:root` 上，在插件样式表之后生成，所以可以在 CSS 中直接使用。最好再给一个后备值，例如 `var(--mt-cover, 320px)`。
- 用户的选项值保存在 App 中。插件更新后，如果原来的值不再有效（超出范围、选项被删除），会使用新的默认值。

## 播放页布局（layouts）

除了用 CSS 调整，插件还可以提供完整的**播放页布局**：封面（方形或唱片形）、歌名、歌手、专辑、标签、歌词预览放在哪里、多大、什么样式、换歌时怎样入场，还可以加上文字、图片、时钟、进度条或进度环、播放时间。启用插件后，布局出现在播放页右上角的 **布局** 菜单中（“来自插件”一组），用户可以选用，也可以在它的基础上编辑、另存为自己的布局。

**最简单的做法是在 App 里做好再导出**：播放页右上角 **布局 > 编辑布局…**，拖动元素、在右侧面板中调整，点“完成”保存；然后 **布局 > 导出为插件…**，得到的 `.lpplugin` 就是一个只含这个布局（和它用到的图片）的插件，可以直接分享，也可以解压后加上 CSS、改名再发布。

布局文件是 JSON：

```json
{
  "name": "复古唱机",
  "elements": [
    { "id": "cover", "kind": "cover", "x": 50, "y": 44, "w": 62,
      "cover": { "shape": "vinyl", "spin": true, "speed": 20, "arm": false, "grooves": true, "label": 66, "shadow": true, "radius": 4 },
      "enter": { "type": "zoom", "duration": 700, "delay": 0 } },
    { "id": "title", "kind": "title", "x": 50, "y": 83, "w": 90, "text": { "size": 4.2, "weight": 700 } },
    { "id": "now", "kind": "text", "x": 50, "y": 6, "w": 60, "content": "正在播放：{artist}", "text": { "size": 1.8, "spacing": 0.3 } },
    { "id": "logo", "kind": "image", "x": 8, "y": 8, "w": 10, "src": "images/logo.svg" }
  ]
}
```

**坐标与单位**：`x`、`y` 是元素中心在播放区域中的位置，单位是百分比（0–100，可以略超出）；`w`（宽度）和文字大小的单位是 **u**，1u 等于播放区域短边的 1%。所以布局在任何窗口大小下都保持比例。元素按数组顺序叠放，后面的在上层。

**元素类型**（`kind`）：

<!-- layout-kinds -->
| kind | 说明 |
| --- | --- |
| `cover` | 封面，`cover.shape` 为 `square`（方形）或 `vinyl`（唱片）。点击打开歌词页 |
| `title` | 歌名。点击打开歌词页 |
| `artist` | 歌手 |
| `album` | 专辑 |
| `chips` | 标签：格式、播放方式、AI 歌词、评论数 |
| `lyric` | 歌词预览（当前句，`next` 为 true 时加上下一句） |
| `text` | 自定义文字 `content`，可包含 `{title}` `{artist}` `{album}` `{elapsed}` `{duration}` `{remaining}` `{time}` `{date}` |
| `image` | 图片 `src`：插件文件夹内的相对路径（png / jpg / webp / gif / svg），或 `data:image/…` |
| `clock` | 时钟，`clock` 为 `HH:mm` / `HH:mm:ss` / `date` / `datetime` |
| `progress` | 播放进度，`progress.style` 为 `bar`（进度条，可点击跳转）或 `ring`（圆环） |
| `time` | 播放时间，`time` 为 `elapsed` / `remaining` / `both` |
<!-- /layout-kinds -->

`cover`、`title`、`artist`、`album`、`chips`、`lyric` 每种只能有一个，缺少的会自动补上并隐藏；其余类型可以有多个（最多共 60 个元素）。每个元素都有唯一的 `id`（字母、数字、`-`、`_`）。

**通用字段**：

| 字段 | 说明 |
| --- | --- |
| `x` / `y` | 中心位置，百分比 |
| `w` | 宽度，u |
| `rotate` | 旋转角度 |
| `opacity` | 不透明度 0–1 |
| `hidden` | 隐藏 |
| `enter` | 换歌时的入场动画：`type` 为 `none` / `fade` / `up` / `down` / `left` / `right` / `zoom` / `blur`，`duration`、`delay` 单位为毫秒 |
| `text` | 文字样式（文字类元素）：`size`（u）、`weight`（100–900）、`color`（`#RRGGBB`，`null` 为跟随主题）、`font`（空为默认，`serif` / `rounded` / `mono`，或字体名称）、`italic`、`shadow`、`spacing`（字间距，em）、`align`（`left` / `center` / `right`） |
| `cover` | 封面：`shape`、`radius`（方形的圆角，宽度的百分比）、`shadow`；唱片另有 `spin`（播放时旋转）、`speed`（转一圈的秒数）、`arm`（唱臂，默认不显示）、`grooves`（纹路与光泽）、`label`（封面占唱片直径的百分比） |
| `progress` | `style`、`thickness`（u）、`color`（`null` 为主题色） |

其余字段会被忽略，超出范围的数值会被限制在范围内。完整格式见 [`layout.schema.json`](layout.schema.json)。

布局中的元素也可以用 CSS 进一步调整，例如：

```css
[data-lp="layout-item"][data-kind="text"] { text-transform: uppercase; }
[data-lp="vinyl"] .vinyl-label { filter: saturate(1.2); }  /* 内部 class 不保证稳定 */
```

## 规则与限制

App 在安装和加载插件时会检查以下规则，不符合的插件无法启用，设置中会显示具体原因。

1. **只有声明式内容**。可以包含 CSS、字体、图片和 JSON（文字替换表、布局）。插件中的其他文件不会被使用。
2. **不引用外部资源**。CSS 中不能出现指向插件文件夹以外的地址，包括 `http:`、`https:`、`//` 开头的地址、`file:` 等，`@import` 也不行。只允许相对路径和 `data:`。这样插件不能联网追踪用户，也能离线使用。
3. **路径限制**。路径必须是插件文件夹内的相对路径：用 `/` 分隔，不能包含 `..`，不能以 `/` 开头，插件中不能包含符号链接。
4. **大小限制**。单个 CSS 不超过 1 MB；整个插件不超过 30 MB、1000 个文件。
5. **命名前缀**。插件自己定义的 CSS 变量和 class 请加上插件专属的前缀（例如 `--mt-`、`.mt-`），避免和 App 或其他插件冲突。不要定义以 `--lp-` 或 `lp-` 开头的名字，它们留给 App 使用。
6. **不要破坏可用性**。不要隐藏设置按钮、关闭按钮或播放控制而又不提供替代；不要让文字在浅色和深色模式下都难以辨认。用户总可以用[安全模式](#安全模式)恢复，但好的插件不应让用户需要它。
7. **兼容性**。用到某个版本才加入的接口时，请写上 `minAppVersion`。

## 打包与安装

`.lpplugin` 文件就是一个 zip 压缩包。下面两种结构都可以：

- `manifest.json` 直接放在压缩包根目录；
- 根目录下只有一个文件夹，`manifest.json` 在这个文件夹中。在“访达”或“文件资源管理器”里直接压缩插件文件夹得到的就是这种结构。

压缩后把扩展名改为 `.lpplugin`（`.zip` 也可以安装）。

命令行打包：

```sh
cd com.example.my-theme && zip -r ../com.example.my-theme.lpplugin .
```

安装方式：**设置 > 插件 > 安装插件包…**。如果已经安装了同一个 `id` 的插件，会询问是否替换（例如升级到新版本）。替换后用户的启用状态和选项值会保留。

## 调试

1. 用 **从文件夹安装…** 安装插件。插件会被复制到插件文件夹。
2. 点 **打开插件文件夹**，直接编辑其中的 `com.example.my-theme/` 文件。
3. 修改后点 **重新加载**（↻）。样式、文字表和 manifest 都会重新读取。
4. 校验失败时，插件卡片上会显示具体原因，例如“style.css 引用了外部资源：https://…”。

LightPlayer 的源码仓库中自带浏览器预览（`pnpm dev`），会列出 `examples/plugins/` 中的插件，可以在浏览器中调试 CSS。

## 安全模式

插件把界面改得没法用时，按 **⌥⇧⌘P**（Windows：**Ctrl+Alt+Shift+P**）进入安全模式：

- 本次运行期间所有插件的样式和文字替换暂时停用。
- 再按一次，或在 **设置 > 插件** 中点“恢复插件”，即可恢复。
- 已经通过 `config` 写入的设置不受安全模式影响，可以在设置中直接修改。

## 示例插件

仓库的 [`examples/plugins`](../../examples/plugins) 中有四个示例。每个 Release 也附带它们打包好的 `.lpplugin`：

| 示例 | 演示内容 |
| --- | --- |
| [`example.minimal-player`](../../examples/plugins/example.minimal-player) 极简播放页 | 改变布局：封面在上、隐藏标签、精简播放栏；`select` / `range` / `toggle` 选项 |
| [`example.serif-lyrics`](../../examples/plugins/example.serif-lyrics) 宋体歌词 | 改变歌词页的字体与样式：当前行发光；`config` 调整歌词对齐和字号；`color` 选项 |
| [`example.english-ui`](../../examples/plugins/example.english-ui) English UI | 用 `strings.json` 把主要界面文字换成英文，包括占位符用法（App 现已自带英文界面，这个示例用来演示文字替换） |
| [`example.retro-turntable`](../../examples/plugins/example.retro-turntable) 复古唱机 | 播放页布局：唱片、进度环、时钟、自定义文字和图片，再用 CSS 微调布局中的元素 |

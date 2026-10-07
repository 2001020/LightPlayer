# LightPlayer 插件开发标准

简体中文 | [English](README.en.md)

> 适用版本：LightPlayer 1.6.0 及以上，`manifestVersion: 1`
>
> 播放页布局（`layouts`）需要 LightPlayer 1.6.0b2 或更新版本。

本文档是 LightPlayer 插件的**正式标准**：

- 符合本文规则的插件可以安装和启用；不符合的插件会被拒绝，设置中会显示具体原因。
- 本文标明为“公开接口”的部分（区域锚点、`<html>` 状态属性、公开 CSS 变量、`config` 键、布局元素类型与字段）会在今后的版本中保持稳定。
- 本文没有提到的内容（App 内部的 class 名、DOM 结构、未列出的 CSS 变量）都属于内部实现，随时可能变化。

如果你只想快速做一个能用的插件，读完[快速开始](#快速开始)就可以动手；遇到问题再查阅对应章节。

---

## 目录

1. [插件能做什么、不能做什么](#插件能做什么不能做什么)
2. [快速开始](#快速开始)
3. [插件包结构](#插件包结构)
4. [manifest.json](#manifestjson)
5. [公开接口](#公开接口)
   - [区域锚点 data-lp](#区域锚点-data-lp)
   - [html 上的状态属性](#html-上的状态属性)
   - [公开 CSS 变量](#公开-css-变量)
6. [改变样式与布局](#改变样式与布局)
7. [改变界面文字](#改变界面文字)
8. [改变字体](#改变字体)
9. [改变播放页 / 歌词页的设置（config）](#改变播放页--歌词页的设置config)
10. [可调选项（options）](#可调选项options)
11. [播放页布局（layouts）](#播放页布局layouts)
12. [插件是怎样被加载的](#插件是怎样被加载的)
13. [规则与限制](#规则与限制)
14. [打包与安装](#打包与安装)
15. [调试](#调试)
16. [安全模式](#安全模式)
17. [版本与兼容性](#版本与兼容性)
18. [发布前检查清单](#发布前检查清单)
19. [示例插件](#示例插件)
20. [常见问题](#常见问题)

---

## 插件能做什么、不能做什么

LightPlayer 插件是**声明式**的：它只包含数据和样式，不包含程序。插件可以：

| 能力 | 用什么实现 | 章节 |
| --- | --- | --- |
| 改变界面元素的样式（颜色、圆角、阴影、间距、大小、动画……） | CSS 样式表 | [改变样式与布局](#改变样式与布局) |
| 改变界面布局（元素位置、排列方向、隐藏元素） | CSS 样式表 | [改变样式与布局](#改变样式与布局) |
| 替换界面上的文字（例如翻译成另一种语言、换一种说法） | 文字替换表 `strings` | [改变界面文字](#改变界面文字) |
| 使用自带的字体 | `fonts` + CSS | [改变字体](#改变字体) |
| 启用时调整 App 的部分设置（主题、主题色、歌词字号与对齐等） | `config` | [config](#改变播放页--歌词页的设置config) |
| 给用户提供可以调节的选项（滑块、颜色、开关、单选） | `options` | [options](#可调选项options) |
| 提供完整的播放页布局（唱片、时钟、进度环、图片、自定义文字……） | `layouts` | [播放页布局](#播放页布局layouts) |

插件**不能**：

- 运行任何代码。插件中的 JavaScript、HTML、可执行文件等都不会被使用。
- 读取用户的文件、账号、播放记录或其他插件的内容。
- 联网。插件中的 CSS 不能引用任何外部地址（见[规则与限制](#规则与限制)）。
- 修改 `config` 白名单之外的设置（例如音量、播放列表、媒体库、账号）。

因此，安装别人制作的插件是安全的。最坏的情况是插件把界面改得不好用，这时可以用[安全模式](#安全模式)临时停用所有插件。

---

## 快速开始

下面用 5 分钟做一个“圆形封面 + 放大当前歌词”的插件。

### 第 1 步：建立文件夹

新建一个文件夹，名字随意，例如 `my-theme`。安装时 App 会把它复制到插件目录，并改名为插件的 `id`。

### 第 2 步：写 manifest.json

在文件夹中新建 `manifest.json`（必须是 UTF-8 编码的 JSON）：

```json
{
  "$schema": "https://raw.githubusercontent.com/2001020/LightPlayer/HEAD/docs/plugins/manifest.schema.json",
  "manifestVersion": 1,
  "id": "com.example.my-theme",
  "name": "我的主题",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "圆形封面，当前歌词更大。",
  "minAppVersion": "1.6.0",
  "styles": ["style.css"]
}
```

- `$schema` 可以不写，但写上后在 VS Code 等编辑器中能得到字段补全和错误提示。
- `manifestVersion`、`id`、`name`、`version` 是必需字段，其余都是可选的。

### 第 3 步：写样式表

在同一个文件夹中新建 `style.css`：

```css
:root {
  --cover-radius: 50%;          /* 圆形封面 */
  --lyric-active-scale: 1.15;   /* 当前歌词更大 */
}

/* 隐藏歌曲信息下面的标签（格式、AI 歌词、评论数等） */
[data-lp="chips"] {
  display: none;
}
```

现在文件夹是这样的：

```
my-theme/
├── manifest.json
└── style.css
```

### 第 4 步：安装并启用

1. 打开 LightPlayer，进入 **设置 > 插件**。
2. 点 **从文件夹安装…**，选择 `my-theme` 文件夹。
3. 安装成功后，插件出现在列表中。打开“我的主题”右侧的开关，修改立即生效。

如果安装失败，提示中会写明原因（例如 `找不到文件：style.css`），按提示修改后重新安装即可。

### 第 5 步：继续修改

安装时插件是被**复制**到插件目录的，之后修改原来的 `my-theme` 文件夹不会有效果。正确的做法是：

1. 在 **设置 > 插件** 中点文件夹图标（**打开插件文件夹**）。
2. 直接编辑其中 `com.example.my-theme/` 里的文件。
3. 保存后点刷新图标（**重新加载**，↻）。不需要重启 App。

做好后，参照[打包与安装](#打包与安装)把它打包成 `.lpplugin` 分享给别人。

---

## 插件包结构

一个插件就是一个文件夹，`manifest.json` 放在文件夹的根目录：

```
com.example.my-theme/          ← 安装后的文件夹名，必须等于 manifest 中的 id
├── manifest.json              ← 必需
├── style.css                  ← styles 中列出的样式表（可以有多个）
├── strings.json               ← 可选：文字替换表
├── fonts/
│   └── MyFont.woff2           ← 可选：字体
├── layouts/
│   └── turntable.json         ← 可选：播放页布局
├── images/
│   └── bg.png                 ← 可选：CSS 或布局中引用的图片
└── preview.png                ← 可选：插件列表中的缩略图
```

除了 `manifest.json` 必须在根目录，其他文件放在哪里、叫什么名字都由你决定，只要 manifest 中写的路径正确即可。

### 文件类型

| 用途 | 允许的扩展名（不区分大小写） | 在哪里声明 |
| --- | --- | --- |
| 清单 | `manifest.json`（文件名固定） | — |
| 样式表 | `.css` | `styles` |
| 字体 | `.woff2`（推荐）、`.woff`、`.ttf`、`.otf` | `fonts[].src` |
| 文字替换表 | `.json` | `strings` |
| 播放页布局 | `.json` | `layouts` |
| 缩略图 | `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.svg` | `preview` |
| 图片 | 任意浏览器能显示的图片格式；布局中只能用 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.svg` | CSS 的 `url()`、布局的 `src` |

文件夹中可以有其他文件（例如 `README.md`、`LICENSE`、设计源文件），它们不会被使用，但计入插件的大小和文件数。

### 路径的写法

manifest 和布局文件中的所有路径都必须是**插件文件夹内的相对路径**：

| 写法 | 是否允许 | 说明 |
| --- | --- | --- |
| `style.css` | ✅ | |
| `css/dark.css` | ✅ | 子文件夹用 `/` 分隔 |
| `fonts/思源宋体.woff2` | ✅ | 可以使用中文和空格，App 会正确编码 |
| `./style.css` | ❌ | 不能包含 `.` 段 |
| `../other/style.css` | ❌ | 不能包含 `..`，不能指向插件文件夹以外 |
| `/style.css` | ❌ | 不能以 `/` 开头 |
| `css\style.css` | ❌ | 不能用 `\` |
| `C:/style.css`、`file:style.css` | ❌ | 不能包含 `:` |

- 路径指向的文件必须存在，并且是普通文件（不能是文件夹或链接）。
- 插件中**不能包含符号链接**（快捷方式、软链接），即使链接指向插件内部也不行。
- 在 macOS 和 Windows 上，文件系统通常不区分大小写，但为了在所有系统上都能工作，请让路径的大小写和实际文件名完全一致。

CSS 中 `url()` 的相对路径按 CSS 的标准规则解析，**相对于该 CSS 文件本身**。例如 `css/theme.css` 中的 `url(../images/bg.png)` 指向 `images/bg.png`，这是允许的，因为它没有离开插件文件夹。

### 安装位置

插件安装在 App 数据目录下的 `plugins` 文件夹中，每个插件一个子文件夹，文件夹名就是插件的 `id`：

- macOS：`~/Library/Application Support/com.lightplayer.app/plugins/`
- Windows：`%APPDATA%\com.lightplayer.app\plugins\`

在 **设置 > 插件** 中点文件夹图标可以直接打开这个目录。

- 名字以 `.` 开头的文件夹会被忽略（App 安装时使用的临时文件夹就是这样命名的）。
- 文件夹名必须和 manifest 中的 `id` 完全相同，否则插件会显示“文件夹名 X 与 id Y 不一致”而无法启用。用 App 安装时会自动命名，只有手动复制文件夹时需要注意。

---

## manifest.json

`manifest.json` 是插件的清单，描述插件是谁、包含哪些文件、要做哪些事。它必须是一个 UTF-8 编码的 JSON 对象。

### 字段一览

| 字段 | 类型 | 必需 | 限制 | 说明 |
| --- | --- | --- | --- | --- |
| `manifestVersion` | number | 是 | 只能是 `1` | 本标准的版本 |
| `id` | string | 是 | 3–64 个字符 | 唯一标识，见 [id](#id) |
| `name` | string | 是 | 1–40 个字符 | 显示名称 |
| `version` | string | 是 | 最多 32 个字符 | 插件自己的版本，见 [version](#version-与-minappversion) |
| `minAppVersion` | string | 否 | 最多 32 个字符 | 需要的最低 LightPlayer 版本 |
| `author` | string | 否 | 最多 64 个字符 | 作者 |
| `description` | string | 否 | 最多 300 个字符 | 简介 |
| `homepage` | string | 否 | 最多 300 个字符，`http://` 或 `https://` 开头 | 主页 |
| `preview` | string | 否 | 路径最多 200 个字符；png / jpg / jpeg / webp / gif / svg | 插件列表中的缩略图 |
| `styles` | string[] | 否 | 最多 20 个；每个 `.css` 不超过 1 MB | 样式表，按顺序加载 |
| `fonts` | object[] | 否 | 最多 20 个 | 字体，见[改变字体](#改变字体) |
| `strings` | string 或 object | 否 | 最多 5000 条 | 文字替换表，见[改变界面文字](#改变界面文字) |
| `config` | object | 否 | 只能使用白名单中的键 | 启用时调整的 App 设置，见 [config](#改变播放页--歌词页的设置config) |
| `options` | object[] | 否 | 最多 50 个 | 用户可调的选项，见 [options](#可调选项options) |
| `layouts` | string[] | 否 | 最多 10 个；每个 `.json` 不超过 512 KB | 播放页布局，见[播放页布局](#播放页布局layouts)。需要 1.6.0b2 或更新版本 |

通用规则：

- 字符串字段**不能为空**，也不能只有空白；可选字段不需要时请直接省略（写成 `null` 也视为省略）。
- 字符数按 Unicode 字符计算，一个汉字算一个字符。
- 未列出的字段（例如 `$schema`）会被忽略，不会报错。但不要依赖这一点自定义字段，将来的版本可能会使用同名字段。
- 完整的 JSON Schema 见 [`manifest.schema.json`](manifest.schema.json)。

### 完整示例

一个用到所有字段的 manifest：

```json
{
  "$schema": "https://raw.githubusercontent.com/2001020/LightPlayer/HEAD/docs/plugins/manifest.schema.json",
  "manifestVersion": 1,
  "id": "com.example.paper",
  "name": "纸张",
  "version": "2.1.0",
  "minAppVersion": "1.6.0",
  "author": "Example Studio",
  "description": "米色纸张质感的界面，霞鹜文楷歌词，附带一个唱片布局。",
  "homepage": "https://example.com/lightplayer-paper",
  "preview": "preview.png",
  "styles": ["css/base.css", "css/lyrics.css"],
  "fonts": [
    { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Regular.woff2", "weight": 400 },
    { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Bold.woff2", "weight": 700 }
  ],
  "strings": { "媒体库": "书架" },
  "config": { "theme": "light", "lyricAlign": "left" },
  "options": [
    { "id": "grain", "label": "纸张纹理", "type": "toggle", "default": true, "class": "paper-grain" }
  ],
  "layouts": ["layouts/record.json"]
}
```

### id

`id` 是插件的唯一标识，也是安装后的文件夹名。规则：

- 长度 3–64 个字符。
- 只能使用**小写**字母 `a–z`、数字 `0–9`、`.` 和 `-`。
- 必须以字母或数字开头，以字母或数字结尾。
- 不能出现连续的两个点 `..`。

| 例子 | 是否有效 |
| --- | --- |
| `com.example.my-theme` | ✅ 推荐：反向域名 + 插件名 |
| `io.github.alice.night-lyrics` | ✅ 没有域名时可以用 GitHub 主页 |
| `abc` | ✅ 但容易与别人重复，不推荐 |
| `ab` | ❌ 太短 |
| `My-Theme` | ❌ 有大写字母 |
| `my_theme` | ❌ 不能用下划线 |
| `-theme`、`theme.` | ❌ 不能以 `-` 或 `.` 开头或结尾 |
| `com..theme` | ❌ 有连续的点 |

**`id` 一旦发布就不要再改。** App 用 `id` 判断“这是不是同一个插件”：安装 `id` 相同的插件包会被当作升级（替换旧版本，保留用户的启用状态和选项值）；改了 `id` 则会被当作另一个插件，用户需要重新启用、重新调整选项。

`example.` 开头的 id 留给 LightPlayer 自带的示例插件，`user.layout.` 开头的 id 留给布局编辑器导出的插件（见[播放页布局](#播放页布局layouts)），请不要使用。

### name、author、description

- `name`：显示在插件列表中的名称，1–40 个字符。
- `author`：显示在名称旁边，最多 64 个字符。
- `description`：显示在名称下方，最多 300 个字符。建议用一两句话说明插件改变了什么，以及有什么需要用户知道的（例如“启用后歌词改为左对齐”）。

这三项是插件作者的内容，不会被任何插件的[文字替换表](#改变界面文字)改动。

### version 与 minAppVersion

`version` 是插件自己的版本号，显示在插件名称旁边。`minAppVersion` 是插件需要的最低 LightPlayer 版本。

版本号的格式：`主版本[.次版本[.修订号]]`，可以带 `v` 前缀和预发布后缀。App 只比较前三段数字，后缀会被忽略：

| 写法 | App 理解为 |
| --- | --- |
| `1.0.0` | 1.0.0 |
| `2` | 2.0.0 |
| `1.6` | 1.6.0 |
| `v1.6.0` | 1.6.0 |
| `1.6.0b2`、`1.6.0-beta.1` | 1.6.0 |
| `abc`、`latest` | ❌ 无效 |

建议插件的 `version` 遵循[语义化版本](https://semver.org/lang/zh-CN/)：修正问题时增加修订号，增加功能时增加次版本，做了不兼容的修改（例如删除选项、改变选项含义）时增加主版本。

关于 `minAppVersion`：

- App 版本低于 `minAppVersion` 时，插件可以安装，但无法启用，插件卡片上会显示“需要 LightPlayer X 或更新版本”。
- 插件用到了某个版本才加入的功能时，请把 `minAppVersion` 设为那个版本，见[版本与兼容性](#版本与兼容性)。
- 因为预发布后缀会被忽略，`1.6.0b2` 和 `1.6.0` 被视为相同版本。请写正式版本号，例如 `1.6.0`。

### homepage

插件的主页或源码地址，必须以 `http://` 或 `https://` 开头，最多 300 个字符。只用于展示信息，App 不会自动访问它。

### preview

插件列表中显示的缩略图，替代默认的拼图图标。

- 格式：png、jpg / jpeg、webp、gif、svg。
- 推荐比例 4:3，例如 400 × 300 像素；图片会被缩放并裁剪以填满方框。
- 建议控制在 200 KB 以内。SVG 体积最小，并且在高分辨率屏幕上也清晰。
- 缩略图应该能让用户一眼看出插件的效果，例如一张启用插件后的界面示意图。

### styles

样式表的路径列表，最多 20 个，按数组顺序加载。详见[改变样式与布局](#改变样式与布局)。

- 每个文件必须是 `.css`、UTF-8 编码、不超过 1 MB。
- 安装时会检查每个样式表是否[引用了外部资源](#规则与限制)。

把样式拆成多个文件只是为了方便维护，效果和写在一个文件中完全相同。

### fonts、strings、config、options、layouts

这几个字段的格式较多，分别在各自的章节中说明：

- `fonts`：[改变字体](#改变字体)
- `strings`：[改变界面文字](#改变界面文字)
- `config`：[改变播放页 / 歌词页的设置](#改变播放页--歌词页的设置config)
- `options`：[可调选项](#可调选项options)
- `layouts`：[播放页布局](#播放页布局layouts)

---

## 公开接口

LightPlayer 的界面由 React 渲染，元素上的 class 名属于内部实现，可能在任何版本中改变。为了让插件在 App 更新后继续工作，App 提供了三类**公开接口**：

1. **区域锚点**：界面主要区域上的 `data-lp` 属性。
2. **状态属性**：`<html>` 元素上反映 App 当前状态的属性。
3. **公开 CSS 变量**：在 `:root` 上定义、控制外观的变量。

**插件应该只依赖这三类公开接口。** 用内部 class 名写的选择器（例如 `.vinyl-label`）目前也能生效，但不保证在新版本中继续有效。如果你觉得缺少某个锚点或变量，欢迎在仓库中提 issue。

稳定性承诺：

- 已列出的锚点、属性、变量不会被删除或改变含义。如果确实需要调整，会在主版本更新中进行，并在发布说明中写明。
- 新版本可能**增加**新的锚点、属性取值和变量。请不要假设某个属性只有表中列出的这几种取值。
- 锚点只保证“这个元素存在、表示这个区域”。锚点**内部**的结构、子元素的顺序、元素的标签名和 class 都不属于公开接口。

### 区域锚点 data-lp

界面的主要区域带有 `data-lp` 属性，用属性选择器 `[data-lp="名称"]` 选择：

```css
[data-lp="transport"] { backdrop-filter: blur(30px); }
```

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

使用锚点时要注意：

- **同一个锚点可能出现在多个地方。** 例如 `track-title` 在经典样式、Flow 样式和自由布局中都有，`cover` 既是经典样式的封面也是自由布局中的封面。只想改某一处时，请加上父级锚点限定：

  ```css
  /* 只改经典样式播放页的歌名，不影响 Flow 样式和自由布局 */
  [data-lp="now-playing"] [data-lp="track-title"] { letter-spacing: 0.05em; }
  ```

- **锚点所在的元素只在需要时存在。** 例如 `lyrics-page` 只在打开歌词页时存在，`comments` 只在打开评论面板时存在，`video` 只在播放视频时存在。CSS 规则会在元素出现时自动生效，不需要额外处理。
- **带额外属性的锚点**：
  - `lyric-line`：当前正在唱的那一行带有 `data-active` 属性，用 `[data-lp="lyric-line"][data-active]` 选择。
  - `layout-item`：带有 `data-kind`（元素类型，例如 `cover`、`clock`）和 `data-id`（布局中元素的 `id`）属性。
  - `vinyl`：音乐播放时带有 `playing` class，用 `[data-lp="vinyl"].playing` 选择。这是锚点上唯一属于公开接口的 class。
- **桌面歌词窗口**是一个独立的窗口，里面只有 `desktop-lyrics` 和 `desktop-lyrics-line` 两个锚点。插件的样式表同样会加载到这个窗口中，可以用 `:root[data-window="desktop-lyrics"]` 区分。

### html 上的状态属性

`<html>` 元素上的属性反映 App 当前的状态，可以用来只在特定情况下应用样式：

<!-- root-attrs -->
| 属性 | 取值 | 说明 |
| --- | --- | --- |
| `data-window` | `main` / `desktop-lyrics` | 主窗口或桌面歌词窗口 |
| `data-platform` | `macos` / `windows` | 操作系统 |
| `data-theme` | `light` / `dark` | 当前实际使用的明暗模式 |
| `data-bg` | `image` / `weather` / 无 | 背景是图片（自定义背景或封面）、天气动画，还是纯色 |
| `data-sky` | `clear` / `partly` / `cloudy` / `overcast` / `fog` / `drizzle` / `rain` / `heavyRain` / `thunder` / `snow` / `sleet` / `hail` | 天气主题下的天气 |
| `data-phase` | `dawn` / `day` / `dusk` / `night` | 天气主题下的大致时段 |
| `data-time` | `daybreak` / `sunrise` / `morning` / `noon` / `afternoon` / `evening` / `sunset` / `night` / `midnight` | 天气主题下的时段：破晓、日出、上午、中午、下午、傍晚、日落、夜晚、午夜（1.6.3 起） |
| `data-page` | `player` / `lyrics` / `library` | 当前页面 |
| `data-media` | `audio` / `video` / `none` | 正在播放的媒体类型 |
| `data-player-style` | `classic` / `flow` | 音频播放页样式 |
| `data-fullscreen` | `true` / `false` | 是否全屏 |
| `data-player-layout` | `classic` / `free` | 经典样式的播放页用的是默认布局，还是自由布局（内置的唱片布局、用户或插件的布局） |
| `lang` | `zh-Hans` / `zh-Hant` / `en` / `ja` / `ko` | 界面语言（1.6.0b4 起） |
<!-- /root-attrs -->

说明：

- `data-theme` 是**实际使用**的明暗模式。用户选择“跟随系统”时，它会随系统切换；选择“天气”主题时，它总是 `dark`（天空背景上用白色文字），同时 `data-bg` 为 `weather`。
- `data-bg` 没有值（属性不存在）时表示纯色背景。用 `:root:not([data-bg])` 选择纯色背景的情况。
- `data-player-layout` 只在 `data-player-style` 为 `classic` 时可能是 `free`。Flow 样式下它总是 `classic`。编辑布局期间它也是 `free`。
- 这些属性都在 `<html>` 上，所以要写成 `:root[data-xxx="…"]`，并且放在选择器的最前面。

例子：

```css
/* 只在深色模式的歌词页生效 */
:root[data-theme="dark"][data-page="lyrics"] [data-lp="lyric-line"] { letter-spacing: 0.04em; }

/* 只在 Windows 上调整标题栏 */
:root[data-platform="windows"] [data-lp="titlebar"] { background: var(--panel-solid); }

/* 播放视频时隐藏播放栏左侧的歌名 */
:root[data-media="video"] [data-lp="transport-now"] { visibility: hidden; }

/* 全屏时让播放栏更透明 */
:root[data-fullscreen="true"] [data-lp="transport"] { opacity: 0.6; }

/* 只在主窗口生效，不影响桌面歌词 */
:root[data-window="main"] { --font: "Songti SC", var(--font-fallback); }
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
| `--accent-text` / `--accent-soft` / `--on-accent` | 由主题色计算 | 主题色的文字版（在当前背景上易读）、浅色底、主题色上的文字颜色（只读，随主题色自动更新） |
| `--bg` / `--panel` / `--panel-solid` / `--panel-2` | 随明暗模式 | 背景、半透明面板、不透明面板、次级底色 |
| `--text` / `--text-dim` / `--text-faint` | 随明暗模式 | 主要、次要、弱化文字颜色 |
| `--border` / `--hover` / `--shadow` | 随明暗模式 | 边框、悬停底色、阴影 |
<!-- /css-vars -->

#### 怎样覆盖变量

```css
:root {
  --cover-radius: 50%;
  --lyric-weight: 500;
  --radius: 4px;
}
```

插件的样式表在 App 样式之后加载，所以在 `:root` 上写同名变量就能覆盖默认值，不需要 `!important`。

#### 颜色变量与明暗模式

颜色变量（`--bg`、`--panel`、`--text` 等）在下列情况下各有一组值，由带属性的 `:root` 选择器设置：

| 情况 | App 使用的选择器 |
| --- | --- |
| 浅色 | `:root` |
| 深色 | `:root[data-theme="dark"]` |
| 图片背景（浅色） | `:root[data-bg="image"]` |
| 图片背景（深色） | `:root[data-theme="dark"][data-bg="image"]` |
| 天气主题 | `:root[data-bg="weather"]` |

带属性的选择器优先级比单独的 `:root` 高。所以插件只写 `:root { --panel: … }` 时，在深色模式下会被 App 的 `:root[data-theme="dark"]` 盖过。请为每种情况分别写：

```css
:root { --panel: rgba(255, 255, 255, 0.6); }
:root[data-theme="dark"] { --panel: rgba(20, 20, 26, 0.6); }
:root[data-bg="weather"] { --panel: rgba(20, 30, 50, 0.3); }
```

或者只针对某一种情况修改，其他情况保留 App 的默认值。

#### 由 App 在元素上写入的变量

以下变量由 App 根据用户设置直接写在元素的 `style` 属性上（内联样式），插件在样式表中写的同名变量**不会生效**，除非加 `!important`：

- `--accent`、`--accent-text`、`--accent-soft`、`--on-accent`：写在 `<html>` 上，跟随用户选择的主题色（以及“随封面变色”）。想改主题色请用 [`config.accent`](#改变播放页--歌词页的设置config)，这样用户仍然可以在设置中改回来。
- `--lyric-hl`：用户在歌词页选择了高亮颜色时，写在 `lyrics-page` 上。插件可以在 `:root` 上设置 `--lyric-hl` 作为“用户没有选择时”的默认颜色，或者用 `config.lyricHighlight`。

强行用 `!important` 覆盖这些变量会让用户的设置失效，请尽量避免。

---

## 改变样式与布局

### 加载顺序与优先级

每个窗口中，样式按以下顺序生效（后面的覆盖前面的）：

1. App 自身的样式。
2. 各插件的样式表：按 **设置 > 插件** 列表中已启用插件的顺序（上面的先加载），同一插件内按 `styles` 数组的顺序。
3. 各插件 `fonts` 生成的 `@font-face`。
4. 各插件 `options` 生成的 CSS 变量（`:root { … }`）。

所以：

- 选择器优先级相同时，插件的规则覆盖 App 的规则。
- 多个插件修改同一处时，**列表中靠下的插件优先**。用户可以用插件卡片上的上移 / 下移按钮调整顺序。
- `options` 生成的变量在所有插件样式表之后，会覆盖插件自己在 `:root` 上写的同名变量。

如果你的规则没有生效，最常见的原因是 App 的选择器优先级更高。这时可以加上锚点或状态属性提高优先级，例如把 `[data-lp="track-title"]` 写成 `[data-lp="now-playing"] [data-lp="track-title"]`。

### 改样式

最稳妥的方式是覆盖[公开 CSS 变量](#公开-css-变量)；变量覆盖不到的地方，给[锚点](#区域锚点-data-lp)写规则：

```css
/* 播放栏改成毛玻璃 + 细边框 */
[data-lp="transport"] {
  background: color-mix(in srgb, var(--panel-solid) 55%, transparent);
  backdrop-filter: blur(28px) saturate(1.4);
  border-top: 1px solid var(--border);
}

/* 歌名用更粗的字体并加大字距 */
[data-lp="now-playing"] [data-lp="track-title"] {
  font-weight: 800;
  letter-spacing: 0.02em;
}
```

### 隐藏元素

```css
[data-lp="chips"] { display: none; }             /* 歌曲信息下的标签 */
[data-lp="lyric-peek"] { display: none; }        /* 播放页上的歌词预览 */
[data-lp="titlebar"] { visibility: hidden; }     /* 隐藏但保留占位 */
```

- `display: none` 会让元素不占空间，其他元素会移动填补。
- `visibility: hidden` 或 `opacity: 0` 会保留元素原来占的位置。
- 隐藏重要的控件前，请阅读[规则与限制](#规则与限制)第 6 条。

### 改布局

锚点是普通的 flex 或 grid 容器，可以用 `flex-direction`、`order`、`gap`、`justify-content`、`align-items`、`grid-template-*` 等属性调整：

```css
/* 经典样式播放页：封面在上、歌曲信息在下，居中 */
[data-lp="now-playing"] {
  flex-direction: column;
  gap: 24px;
  text-align: center;
}
[data-lp="now-playing"] [data-lp="track-info"] {
  align-items: center;
}

/* 播放栏左右两部分交换位置 */
[data-lp="transport-now"] { order: 3; }
[data-lp="transport-right"] { order: 1; }
```

需要更自由的播放页（任意位置摆放封面和文字、唱片、时钟、进度环等）时，用[播放页布局](#播放页布局layouts)比用 CSS 简单得多。

### 按状态区分

配合 [html 上的状态属性](#html-上的状态属性)，以及[选项](#可调选项options)产生的 class：

```css
/* 只在歌词页、深色模式下 */
:root[data-page="lyrics"][data-theme="dark"] [data-lp="lyric-line"][data-active] {
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.35);
}

/* 用户在插件选项中打开了“紧凑模式” */
:root.mt-compact [data-lp="transport"] { padding-block: 4px; }
```

### 背景图片和其他图片

图片放在插件文件夹中，用相对路径引用（相对于 CSS 文件本身）：

```css
[data-lp="lyrics-page"] {
  background: url(images/paper.png) center / cover no-repeat;
}
```

- 也可以用 `data:` URL 直接嵌入小图片，例如 `url("data:image/svg+xml;base64,…")`。
- 不能引用网络上的图片，见[规则与限制](#规则与限制)。
- 大图片会增加插件包体积并拖慢加载。背景图建议使用 webp 或 jpg，宽度不超过 2560 像素。

### 动画

插件可以使用 `@keyframes`、`transition`、`animation`：

```css
@keyframes mt-breathe {
  from { transform: scale(1); }
  to { transform: scale(1.03); }
}
:root[data-page="player"] [data-lp="now-playing"] [data-lp="cover"] {
  animation: mt-breathe 4s ease-in-out infinite alternate;
}
```

- `@keyframes` 的名字同样要加插件前缀（这里是 `mt-`），避免和 App 或其他插件冲突。
- 请尊重用户的“减少动态效果”系统设置：

  ```css
  @media (prefers-reduced-motion: reduce) {
    [data-lp="cover"] { animation: none; }
  }
  ```

### 关于 !important

一般不需要 `!important`。只有需要覆盖 App 写在元素 `style` 属性上的内联样式时才需要，例如：

- 歌词字号：来自用户设置，写在歌词元素上。改歌词字号更好的方式是 [`config.lyricFontSize`](#改变播放页--歌词页的设置config)，这样用户仍然可以调整。
- 主题色等由 App 写入的变量，见[由 App 在元素上写入的变量](#由-app-在元素上写入的变量)。

### 可以使用的 CSS 功能

插件样式表就是普通的 CSS，运行在系统的 WebView 中（macOS 上是 WebKit，Windows 上是 Chromium 内核的 WebView2）。可以使用这两者都支持的所有 CSS 功能，包括 CSS 变量、`color-mix()`、`:has()`、容器查询、`@media`、`@supports`、`backdrop-filter` 等。

不能使用的只有 `@import` 和任何外部地址，见[规则与限制](#规则与限制)。

---

## 改变界面文字

`strings` 是一张“原文 → 替换文字”的对照表，用来改变 App 界面上的文字，例如把界面翻译成另一种语言，或者把“媒体库”改叫“唱片架”。

### 写法

可以写成 JSON 文件的路径：

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

也可以直接在 manifest 中写成对象：

```json
{ "strings": { "媒体库": "唱片架", "歌单": "曲目单" } }
```

条目少时直接写在 manifest 中更方便；条目多时（例如完整翻译）请用单独的文件。

格式要求：

- 必须是一个 JSON 对象，键是原文，值是替换文字。
- 值必须是字符串。替换文字可以是空字符串 `""`，效果是让这段文字消失（但元素还在）。
- 原文不能为空，也不能只有空白。
- 最多 5000 条。

### 匹配规则

**原文始终是简体中文。** LightPlayer 自带的繁體中文、English、日本語、한국어 界面也是用同样的文字替换实现的（[src/i18n/locales](../../src/i18n/locales)）。无论用户选择哪种界面语言，插件文字表的原文都写界面的简体中文原文；插件的条目优先于内置语言。只想在某种语言下生效的样式，可以用 `:root[lang="en"]` 这样的选择器（1.6.0b4 起）。

**1. 整段完全匹配。** 界面上一段文字去掉首尾空白后，与原文**完全相同**才会替换，原有的首尾空白会保留。不做部分替换：

| 表中的原文 | 界面文字 | 结果 |
| --- | --- | --- |
| `媒体库` | `媒体库` | ✅ 替换 |
| `媒体库` | `  媒体库 ` | ✅ 替换，保留前后空格 |
| `媒体库` | `从媒体库移除` | ❌ 不替换，需要单独写一条 `"从媒体库移除": "…"` |
| `新建歌单` | `新建歌单…` | ❌ 不替换，省略号也要完全一致 |

原文的首尾空白会被忽略，所以 `" 媒体库 "` 和 `"媒体库"` 是同一条。

**2. 占位符。** 原文中的 `{名字}` 可以匹配任意文字（至少一个字符），匹配到的内容可以在替换文字中用同样的 `{名字}` 引用：

```json
{
  "共 {n} 条": "{n} comments",
  "第 {i} 首，共 {n} 首": "Track {i} of {n}",
  "{n} 首歌曲": "{n} songs"
}
```

- 名字由英文字母、数字和下划线组成，必须以字母或下划线开头，例如 `{n}`、`{count}`、`{_1}`。`{1}`、`{名字}` 不是占位符，会被当作普通文字。
- 替换文字中可以改变占位符的顺序，也可以省略某个占位符，或者重复使用。
- 替换文字中写了原文没有的占位符（例如 `{x}`），会原样显示 `{x}`。
- 有多个占位符时，前面的占位符尽量匹配少的文字。请在占位符之间保留固定的文字作为分隔，避免写 `{a}{b}` 这样含义不明的原文。
- 先查找完全相同的条目；找不到时，再按表中的顺序依次尝试带占位符的条目，用第一个匹配的。
- 占位符匹配到的文字也会再查一次表，所以 `"保存失败：{a}"` 中的错误信息也能被替换。

**3. 拼接的文字整体匹配。** 一个元素只包含文字（没有子元素）时，按整个元素的文字匹配。像“共 12,345 条”这样在程序中由几段拼成的文字，也能用 `"共 {n} 条"` 整体匹配。

**4. 提示文字也会替换。** 除了元素中的文字，以下属性也按同样的规则替换：

| 属性 | 用途 |
| --- | --- |
| `title` | 鼠标悬停时的提示 |
| `data-tip` | App 自己的悬停提示（大多数按钮的提示用的是它） |
| `aria-label` | 无障碍名称（屏幕阅读器读出的内容） |
| `placeholder` | 输入框为空时的提示文字 |

按钮的悬停提示中如果带有快捷键，原文通常不包括快捷键部分，可以先启用插件再看实际效果。

**5. 多个插件。** 多个插件替换同一段文字时，**靠下的插件优先**，和样式表相同。

**6. 实时生效。** 界面上新出现的文字（打开新的面板、切换歌曲）会立即替换；停用插件后，所有文字会恢复原样。

### 不会替换的内容

- **用户的内容**：歌词、歌名、艺人、专辑、文件名、歌单名、评论、插件的名称和简介等。这些区域在界面中带有 `data-lp-raw` 属性，文字替换表不会进入其中。这保证了“媒体库”这样的条目不会改掉恰好叫“媒体库”的歌单。
- **输入框中的文字**：`input`、`textarea`、可编辑区域中用户输入的内容（输入框的 `placeholder` 会替换）。
- **系统原生的界面**：macOS 的应用菜单、系统对话框中由系统提供的文字、系统通知。这些不是网页内容，插件无法改变。
  - 菜单栏 / 通知区域图标的菜单，以及 App 打开、保存、确认对话框的标题和按钮，会使用替换后的文字（1.6.0b4 起）。
- **图标**：图标是图形，不是文字。

### 怎样找到原文

原文就是当前版本界面上显示的中文。几个找到准确原文的办法：

1. 直接照着界面抄，注意全角 / 半角标点、省略号 `…`（一个字符）、空格是否完全一致。
2. 参考 [`examples/plugins/example.english-ui/strings.json`](../../examples/plugins/example.english-ui/strings.json)，其中已经收录了主要界面文字。
3. 在 LightPlayer 的源码（`src/` 目录）中搜索这段文字。

> 原文以当前版本的界面为准。App 更新后个别文字可能变化，对应的条目就不再生效，但不会出错。文字替换表**不属于**稳定的公开接口，做翻译插件时请在新版本发布后检查一遍。

### 注意事项

- 替换后的文字可能比原文长很多（例如中文翻译成德文），可能导致按钮或标签换行、被截断。请在不同窗口大小下检查，必要时配合 CSS 调整。
- 不要用文字替换表“隐藏”文字（替换为空字符串），用 CSS 的 `display: none` 更可靠。
- 文字替换在主窗口和桌面歌词窗口中都会生效。

---

## 改变字体

字体有两种来源：用户电脑上已安装的**系统字体**，和插件**自带的字体**文件。

### 使用系统字体

直接在 CSS 中写字体名，不需要在 manifest 中声明：

```css
:root {
  --lyric-font: "Songti SC", "STSong", "SimSun", serif;
}
```

macOS 和 Windows 自带的中文字体不同，请为两个系统各写一个，并在最后写一个通用字体族（`serif`、`sans-serif`、`monospace`）兜底：

| 风格 | macOS | Windows | 通用 |
| --- | --- | --- | --- |
| 宋体 | `"Songti SC"`、`"STSong"` | `"SimSun"` | `serif` |
| 楷体 | `"Kaiti SC"`、`"STKaiti"` | `"KaiTi"` | `serif` |
| 黑体 | `"PingFang SC"`、`"Hiragino Sans GB"` | `"Microsoft YaHei"` | `sans-serif` |
| 圆体 | `"Yuanti SC"` | `"YouYuan"` | `sans-serif` |

### 使用插件自带的字体

1. 把字体文件放进插件文件夹，例如 `fonts/`。
2. 在 manifest 的 `fonts` 中声明。App 会为每一项生成一条 `@font-face`。
3. 在 CSS 中通过 `family` 名称使用。

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

`fonts` 中每一项的字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `family` | 是 | 字体名称，1–64 个字符，在 CSS 中用这个名字引用。不能包含 `"`、`'`、`;`、`{`、`}`、`\`。可以和系统字体同名，但不推荐 |
| `src` | 是 | 字体文件路径：`.woff2`（推荐）、`.woff`、`.ttf`、`.otf` |
| `weight` | 否 | 字重。数字（如 `400`、`700`），或由字母、数字、空格组成的字符串，最多 16 个字符（如 `"bold"`；可变字体可写范围 `"100 900"`）。省略时为 `normal` |
| `style` | 否 | `normal` / `italic` / `oblique`。省略时为 `normal` |

- 同一个 `family` 可以声明多项，分别对应不同的字重和样式。浏览器会根据文字需要的字重自动选择。
- 生成的 `@font-face` 使用 `font-display: swap`：字体加载完成前先用后备字体显示，加载完成后切换。所以请在 `family` 后面写上后备字体。
- `fonts` 最多 20 项。

### 可以改字体的地方

| 变量 | 影响范围 |
| --- | --- |
| `--font` | 整个界面（所有没有单独设置字体的文字） |
| `--title-font` | 播放页和歌词页的歌名（默认等于 `--font`） |
| `--lyric-font` | 歌词页、播放页歌词预览和桌面歌词（默认等于 `--font`） |
| `--mono` | 时间码等等宽文字 |

只改桌面歌词的字体：

```css
:root[data-window="desktop-lyrics"] { --lyric-font: "LXGW WenKai", serif; }
```

[播放页布局](#播放页布局layouts)中文字元素的 `text.font` 也可以写插件自带字体的 `family` 名称。

### 字体文件的体积与授权

- 中文字体文件通常很大（一个字重 5–20 MB）。请使用 woff2 格式，并且只包含需要的字重。整个插件包不能超过 30 MB。
- 可以用字体子集化工具（例如 `fonttools` 的 `pyftsubset`）去掉用不到的字符，显著减小体积。
- **请确认字体的授权允许再分发。** 许多商业字体不允许放进别人可以下载的文件中。开源字体（例如 SIL Open Font License 授权的字体）通常可以，但需要附带许可证文件。

---

## 改变播放页 / 歌词页的设置（config）

`config` 让插件在**启用时**调整 App 的部分设置，例如歌词对齐、歌词字号、播放器样式。与用 CSS 强行修改不同，用 `config` 调整的设置会显示在设置中，用户仍然可以随时改回来。

```json
"config": { "lyricAlign": "left", "lyricFontSize": 30, "playerStyle": "flow" }
```

### 可用的键

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

取值说明：

- 颜色写成 `#RRGGBB` 或 `#RGB`，十六进制，不区分大小写，例如 `#ffd166`、`#FFF`。不支持 `rgb()`、颜色名称或透明度。
- `true` / `false` 是 JSON 布尔值，不要加引号。
- `lyricFontSize` 是数字（单位 px），范围 14–56，可以是小数。
- `theme` 中的 `weather` 是“天气”主题（随天气变化的动态背景）。
- `desktopLyrics.color` 是带点的完整键名，直接写成 `"desktopLyrics.color": "#ffffff"`，不要写成嵌套对象。
- 不在表中的键、或值不符合要求，都会导致插件校验失败（例如“config 不支持 volume”“config.lyricFontSize 的值无效：100”）。

### 启用、停用时会发生什么

1. **启用插件时**，App 记下每一项设置原来的值，然后写入插件的值。
2. **插件启用期间**，用户仍然可以在设置中修改这些项，插件不会阻止或改回来。
3. **停用插件时**，App 检查每一项：
   - 如果当前值还是插件写入的值，就恢复成启用前的值；
   - 如果用户在此期间自己改过，就保留用户的选择。
4. **删除插件**时会先停用它，所以设置同样会恢复。

插件卡片上会显示“启用时调整了 N 项设置，停用后会恢复（你之后手动改过的除外）”，让用户知道发生了什么。

需要注意：

- `config` **只在打开开关的那一刻**写入一次。升级插件、点“重新加载”时不会再次写入；想让新版本的 `config` 生效，需要先停用再启用。
- [安全模式](#安全模式)不会撤销 `config` 写入的设置。
- 多个插件修改同一个设置时，最后启用的插件写入的值生效；恢复时各自按上面的规则处理。
- `config` 适合“这个插件需要某个设置才好看”的情况（例如为左对齐歌词设计的样式）。如果只是你个人的偏好，请不要写进 `config`，让用户自己选择。

---

## 可调选项（options）

`options` 让用户不改文件就能调整插件的效果，例如封面大小、发光颜色、是否显示某个元素。选项显示在 **设置 > 插件** 中该插件卡片的“插件选项”（齿轮图标）里，修改后立即生效。

选项本身不会改变界面。选项的值会变成 **CSS 变量**，或者在 `<html>` 上加上 **class**，再由插件自己的 CSS 使用。

### 例子

```json
"options": [
  { "id": "size", "label": "封面大小", "type": "range", "min": 200, "max": 420, "step": 10, "unit": "px", "default": 320, "var": "--mt-cover" },
  { "id": "glow", "label": "发光颜色", "type": "color", "default": "#ffd166", "var": "--mt-glow" },
  { "id": "compact", "label": "紧凑模式", "description": "减小播放栏的上下间距", "type": "toggle", "default": false, "class": "mt-compact" },
  { "id": "layout", "label": "布局", "type": "select", "default": "side",
    "choices": [
      { "value": "side", "label": "并排" },
      { "value": "stack", "label": "上下", "class": "mt-stack" }
    ] }
]
```

```css
:root { --cover-size: var(--mt-cover, 320px); }
[data-lp="lyric-line"][data-active] { text-shadow: 0 0 10px var(--mt-glow, #ffd166); }
:root.mt-compact [data-lp="transport"] { padding-block: 4px; }
:root.mt-stack [data-lp="now-playing"] { flex-direction: column; }
```

用户把“封面大小”调到 360、选择“上下”布局后，App 会生成：

```css
:root {
  --mt-cover: 360px;
  --mt-glow: #ffd166;
}
```

并在 `<html>` 上加上 class `mt-stack`。

### 通用字段

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `id` | 是 | 选项的标识，在插件内唯一。1–64 个字符，由英文字母、数字、`_`、`-` 组成，以字母或 `_` 开头。用户的选择按 `id` 保存，发布后不要修改 |
| `label` | 是 | 显示的名称，1–40 个字符 |
| `type` | 是 | `range` / `color` / `toggle` / `select` |
| `default` | 是 | 默认值，类型取决于 `type` |
| `description` | 否 | 说明文字，最多 200 个字符，显示在名称下方 |
| `var` | 视类型 | 写入的 CSS 变量名，以 `--` 开头，例如 `--mt-cover`，最多 64 个字符 |
| `class` | 视类型 | 加到 `<html>` 上的 class 名，由英文字母、数字、`_`、`-` 组成，以字母或 `_` 开头，最多 64 个字符 |

### 四种类型

| 类型 | 界面控件 | 必需字段 | 可选字段 | 产生的效果 |
| --- | --- | --- | --- | --- |
| `range` | 滑块 | `min`、`max`、`default`（数字）、`var` | `step`（默认 1）、`unit` | `var` 变量 = 数值 + `unit`，例如 `320px` |
| `color` | 取色器 | `default`（`#RRGGBB`）、`var` | — | `var` 变量 = 颜色，例如 `#ffd166` |
| `toggle` | 开关 | `default`（true / false）；`class` 和 `var` 至少一个 | — | 打开时 `<html>` 加上 `class`；`var` 变量为 `1`（打开）或 `0`（关闭） |
| `select` | 单选 | `choices`、`default`（某个 `value`） | `var` | 选中项的 `class` 加到 `<html>` 上；有 `var` 时变量 = 选中项的 `value` |

#### range（滑块）

```json
{ "id": "blur", "label": "背景模糊", "type": "range", "min": 0, "max": 40, "step": 2, "unit": "px", "default": 20, "var": "--mt-blur" }
```

- 要求 `min < max`、`step > 0`，`default` 在 `min` 和 `max` 之间。
- `unit` 最多 8 个字符，例如 `px`、`%`、`em`、`s`、`deg`。不写时变量是一个纯数字（例如 `0.8`），可以用在 `opacity`、`scale`、`calc()` 中。
- 设置中滑块旁边会显示当前值和单位，例如“20px”。

纯数字变量的用法：

```css
:root { --mt-scale: 1.1; }                      /* 后备值 */
[data-lp="cover"] { transform: scale(var(--mt-scale)); }
[data-lp="transport"] { height: calc(var(--mt-h) * 1px); }  /* 把纯数字变成长度 */
```

#### color（颜色）

```json
{ "id": "tint", "label": "强调色", "type": "color", "default": "#ff6b6b", "var": "--mt-tint" }
```

- `default` 必须是 `#RRGGBB` 或 `#RGB`。
- 取色器不支持透明度。需要半透明时，在 CSS 中用 `color-mix()`：

  ```css
  [data-lp="lyrics-page"] { background: color-mix(in srgb, var(--mt-tint) 20%, transparent); }
  ```

#### toggle（开关）

```json
{ "id": "hideChips", "label": "隐藏格式标签", "type": "toggle", "default": true, "class": "mt-hide-chips" }
```

- `default` 必须是 JSON 布尔值 `true` 或 `false`。
- 有 `class` 时：打开 → `<html>` 上有这个 class；关闭 → 没有。
- 有 `var` 时：打开 → 变量为 `1`；关闭 → 变量为 `0`。可以用 `calc()` 实现“打开时才有”的效果，例如 `opacity: calc(1 - var(--mt-hide))`。
- 两者可以同时写。

#### select（单选）

```json
{ "id": "corner", "label": "封面形状", "type": "select", "default": "rounded",
  "choices": [
    { "value": "square", "label": "方形", "class": "mt-square" },
    { "value": "rounded", "label": "圆角" },
    { "value": "circle", "label": "圆形", "class": "mt-circle" }
  ] }
```

- `choices` 有 1–30 项。每项：
  - `value`（必需）：1–64 个字符的字符串，在同一选项内应当唯一。
  - `label`（必需）：显示的名称，1–40 个字符。
  - `class`（可选）：选中这一项时加到 `<html>` 上的 class。
- `default` 必须等于某一项的 `value`。
- 选项不超过 4 项时，设置中显示为一组并排的按钮；超过 4 项时显示为下拉菜单。
- 可以只给部分选项写 `class`。上例中“圆角”是默认样式，不需要 class。
- 有 `var` 时，变量的值是选中项的 `value` 原文（例如 `rounded`）。这在 CSS 中用途有限，通常用 `class` 更方便。

### 值的保存与更新

- 用户的选择保存在 App 中（按插件 `id` 和选项 `id`），停用插件、重启 App、升级插件后都会保留。
- 用户可以在“插件选项”中点 **恢复默认选项**，清除自己的选择。
- 插件未启用时也可以打开“插件选项”调整，效果在启用后出现。
- 插件升级后，如果保存的值对新版本无效，App 会这样处理：
  - `range`：超出新的范围时，限制到 `min` 或 `max`；
  - `color`：不是有效颜色时，用新的 `default`；
  - `toggle`：不是布尔值时，用新的 `default`；
  - `select`：新的 `choices` 中没有这个 `value` 时，用新的 `default`；
  - 选项被删除：它保存的值不再使用；
  - 选项 `type` 改变：按上面的规则检查，不符合就用 `default`。

  为了避免用户的设置意外丢失，发布后请尽量不要修改选项的 `id`、`type` 和 `choices` 的 `value`。

### 编写建议

- 变量和 class 名加上插件专属的前缀（例如 `--mt-`、`.mt-`），见[规则与限制](#规则与限制)。
- 在 CSS 中使用变量时，最好写上后备值，例如 `var(--mt-cover, 320px)`。这样即使变量没有生成（例如在浏览器预览中调试时），样式也正常。
- 选项生成的变量位于所有插件样式表之后，会覆盖插件在 `:root` 上写的同名变量。所以不要在 CSS 中给同名变量另外赋值，用后备值即可。
- 选项不宜太多。把真正值得调整的几项做成选项，其余的做好默认值。

---

## 播放页布局（layouts）

除了用 CSS 调整，插件还可以提供完整的**播放页布局**：封面（方形或唱片形）、歌名、歌手、专辑、标签、歌词预览放在哪里、多大、什么样式、换歌时怎样入场，还可以加上文字、图片、时钟、进度条或进度环、播放时间。

> 需要 LightPlayer 1.6.0b2 或更新版本。

### 用户怎样使用插件的布局

1. 启用插件后，布局出现在播放页右上角的 **布局** 菜单（也可以在 设置 > 外观 > 播放页布局 中选择）中的“来自插件”一组。插件卡片上也会提示“提供 N 个播放页布局”。
2. 用户选中后，播放页就使用这个布局。布局只在“经典”播放器样式下可用（Flow 样式是封面墙，不使用布局）。
3. 插件的布局不能直接修改。用户在它的基础上 **编辑布局…** 并完成时，会另存为用户自己的布局（名称加上“（自定义）”）；也可以用 **复制为新布局**。
4. 停用或删除插件后，它的布局从菜单中消失；如果正在使用，播放页会回到“默认”布局。

### 最简单的做法：在 App 里做好再导出

不需要手写 JSON：

1. 播放页右上角 **布局 > 编辑布局…**。
2. 拖动元素调整位置和大小，在右侧面板中调整样式、入场动画；可以添加文字、图片、时钟、进度、播放时间。
3. 点“完成”保存为你的布局。
4. 选中这个布局，**布局 > 导出为插件…**，得到一个 `.lpplugin` 文件。

导出的插件只包含这个布局和它用到的图片，可以直接分享。它的 `id` 是 `user.layout.` 加上由布局名称计算出的一串字符，所以同名布局再次导出会得到相同的 `id`，安装时会替换旧版本。

想把它发布成正式的插件时，把 `.lpplugin` 解压，然后：

- 把 `id` 改成你自己的（例如 `com.example.turntable`），并修改 `name`、`description`、`author`；
- 根据需要加上 `preview`、CSS 样式表等；
- 重新打包。

### 布局文件的格式

布局文件是一个 JSON 对象，在 manifest 的 `layouts` 中列出路径（最多 10 个，每个不超过 512 KB）：

```json
"layouts": ["layouts/turntable.json"]
```

`layouts/turntable.json`：

```json
{
  "$schema": "https://raw.githubusercontent.com/2001020/LightPlayer/HEAD/docs/plugins/layout.schema.json",
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

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `name` | 是 | 在“布局”菜单中显示的名称，1–40 个字符 |
| `elements` | 是 | 元素数组，1–60 项。按数组顺序叠放，**后面的元素在上层** |
| `$schema` | 否 | 写上后编辑器可以补全和检查，见 [`layout.schema.json`](layout.schema.json) |

### 坐标与单位

```
(0,0) ───────────── x ─────────────▶ (100,0)
  │
  │        ┌───────────┐
  y        │     ●     │  ← 元素中心在 (x, y)
  │        └───────────┘
  │        |←── w(u) ──→|
  ▼
(0,100)                              (100,100)
```

- **播放区域（舞台）**：标题栏和播放栏之间、用来显示播放页的区域。
- **`x`、`y`**：元素**中心**在舞台中的位置，单位是百分比。`x: 0` 是左边缘，`100` 是右边缘；`y: 0` 是上边缘，`100` 是下边缘。可以略超出（-50 到 150），让元素部分移出舞台。
- **u**：长度单位，**1u 等于舞台短边的 1%**。窗口宽时短边是高度，窗口窄时短边是宽度。元素的宽度 `w`、文字大小 `text.size`、进度的粗细 `progress.thickness` 都用 u。
- 所以布局在任何窗口大小、任何屏幕上都保持比例。但窗口的宽高比不同时，元素之间的水平和垂直距离会有不同的比例，请在宽窗口和窄窗口下都检查一下。
- 元素的高度由内容决定：封面、图片按图片比例（封面是正方形）；文字类元素按文字的行数。

### 元素类型

每个元素用 `kind` 表示类型：

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

- `cover`、`title`、`artist`、`album`、`chips`、`lyric` 是**内置元素**，每种只能有一个。布局中缺少的内置元素会被自动补上并隐藏（`hidden: true`）；重复的只保留第一个。
- `text`、`image`、`clock`、`progress`、`time` 是**附加元素**，可以有多个。
- 所有元素加起来最多 60 个。

### 元素的 id

每个元素都必须有 `id`：

- 1–40 个字符，由英文字母、数字、`-`、`_` 组成。
- 在同一个布局中唯一。
- 可以在 CSS 中用 `[data-lp="layout-item"][data-id="…"]` 选择这个元素。建议附加元素的 `id` 加上插件前缀（例如 `rt-clock`），方便在 CSS 中使用，也不会和其他布局混淆。

### 通用字段

所有类型的元素都可以使用：

| 字段 | 类型 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 见上 | — | 必需 |
| `kind` | string | 见上表 | — | 必需 |
| `x` / `y` | number | -50–150 | `50` | 中心位置，百分比 |
| `w` | number | 1–400 | 随类型 | 宽度，u |
| `rotate` | number | -360–360 | `0` | 旋转角度（度），正数为顺时针 |
| `opacity` | number | 0–1 | `1` | 不透明度 |
| `hidden` | boolean | | `false` | 隐藏这个元素 |
| `enter` | object | | 无动画 | 换歌时的入场动画，见下 |

`enter` 入场动画：每次换歌时播放一次。

| 字段 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | `none`（无）/ `fade`（淡入）/ `up`（上滑）/ `down`（下滑）/ `left`（左滑）/ `right`（右滑）/ `zoom`（缩放）/ `blur`（模糊渐显） | `none` | 动画类型 |
| `duration` | 100–5000 | `600` | 时长，毫秒 |
| `delay` | 0–5000 | `0` | 延迟，毫秒。给几个元素设置递增的延迟，可以做出依次入场的效果 |

### 文字样式 text

`title`、`artist`、`album`、`chips`、`lyric`、`text`、`clock`、`time` 是文字类元素，可以用 `text` 设置文字样式：

| 字段 | 类型 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `size` | number | 0.5–40 | 随类型 | 字号，u |
| `weight` | number | 100–900 | 随类型 | 字重，会取整到 100 的倍数 |
| `color` | string 或 null | `#RRGGBB` / `#RGB` | `null` | 文字颜色；`null` 表示跟随主题（随明暗模式变化） |
| `font` | string | 最多 64 个字符 | `""` | 字体：空为 App 默认字体；`serif`（宋体类）、`rounded`（圆体类）、`mono`（等宽）；或字体名称（系统字体或插件 `fonts` 中的 `family`） |
| `italic` | boolean | | `false` | 斜体 |
| `shadow` | boolean | | `false` | 柔和的文字阴影，让文字在图片背景上更易读 |
| `spacing` | number | -0.2–1 | 随类型 | 字间距，em |
| `align` | string | `left` / `center` / `right` | `center` | 对齐方式。文字在元素宽度 `w` 内对齐 |

`font` 中的字体名称会去掉 `"`、`'`、`\`、`;`、`{`、`}`、`<`、`>` 等字符。

### 各类型的专有字段

**`cover` 封面**：用 `cover` 对象设置。

| 字段 | 类型 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `shape` | string | `square` / `vinyl` | `square` | 方形封面或唱片 |
| `radius` | number | 0–50 | `4` | 方形封面的圆角，宽度的百分比（50 为圆形） |
| `shadow` | boolean | | `true` | 阴影 |
| `spin` | boolean | | `true` | 唱片：播放时旋转 |
| `speed` | number | 2–120 | `20` | 唱片：转一圈的秒数，越小越快 |
| `arm` | boolean | | `false` | 唱片：显示唱臂（播放时移到唱片上）。1.6.1 起默认不显示 |
| `grooves` | boolean | | `true` | 唱片：纹路与光泽 |
| `label` | number | 30–90 | `66` | 唱片：中间封面的直径占唱片直径的百分比 |

**`lyric` 歌词预览**：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `next` | boolean | `true` | 同时显示下一句 |

**`text` 自定义文字**：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `content` | string | `正在播放：{title}` | 文字内容，最多 500 个字符，可以包含下面的占位符 |

| 占位符 | 替换为 | 例子 |
| --- | --- | --- |
| `{title}` | 歌名 | 晴天 |
| `{artist}` | 歌手 | 周杰伦 |
| `{album}` | 专辑 | 叶惠美 |
| `{elapsed}` | 已播放时间 | 1:23 |
| `{duration}` | 总时长 | 4:29 |
| `{remaining}` | 剩余时间（带负号） | -3:06 |
| `{time}` | 当前时间 | 21:05 |
| `{date}` | 当前日期 | 10月6日 星期一 |

不认识的占位符（例如 `{year}`）会原样显示。超过 1 小时的时间显示为 `1:02:03`。

**`image` 图片**：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `src` | string | `""` | 图片：插件文件夹内的相对路径，或 `data:image/…;base64,…` |
| `radius` | number | `0` | 圆角，宽度的百分比，0–50 |

- 相对路径相对于**插件文件夹的根目录**（不是布局文件所在的文件夹）。例如布局在 `layouts/a.json`，图片在 `images/logo.svg`，就写 `images/logo.svg`。
- 文件扩展名必须是 png、jpg、jpeg、webp、gif、svg 之一，文件必须存在，否则插件校验失败。
- `data:` URL 只支持 `image/png`、`image/jpeg`、`image/webp`、`image/gif`、`image/svg+xml` 的 base64 形式，长度不超过 4,000,000 个字符。不符合的会被忽略（图片为空）。
- 不能使用网络地址。
- `src` 为空时，元素什么也不显示。

**`clock` 时钟**：

| 字段 | 取值 | 默认 | 显示 |
| --- | --- | --- | --- |
| `clock` | `HH:mm` | ✅ | 21:05 |
| | `HH:mm:ss` | | 21:05:09 |
| | `date` | | 10月6日 星期一 |
| | `datetime` | | 10月6日 星期一 21:05 |

时间使用 24 小时制和用户电脑的时区。

**`progress` 播放进度**：用 `progress` 对象设置。

| 字段 | 类型 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `style` | string | `bar` / `ring` | `bar` | 进度条（可以点击、拖动跳转）或圆环 |
| `thickness` | number | 0.1–20 | `0.6` | 粗细，u |
| `color` | string 或 null | `#RRGGBB` / `#RGB` | `null` | 颜色；`null` 为主题色 |

进度环放在唱片下层、比唱片稍大一些，就能做出“唱片外圈是进度”的效果，见示例插件 `example.retro-turntable`。

**`time` 播放时间**：

| 字段 | 取值 | 默认 | 显示 |
| --- | --- | --- | --- |
| `time` | `elapsed` | | 1:23 |
| | `remaining` | | -3:06 |
| | `both` | ✅ | 1:23 / 4:29 |

### 各类型的默认值

字段省略时使用下面的默认值（另有通用默认值 `x: 50`、`y: 50`、`rotate: 0`、`opacity: 1`）：

| kind | `w` | 文字 `size` / `weight` | 其他 |
| --- | --- | --- | --- |
| `cover` | 56 | — | 见上面 `cover` 的默认值 |
| `title` | 70 | 4.6 / 700 | |
| `artist` | 70 | 2.8 / 400 | |
| `album` | 70 | 2.2 / 400 | |
| `chips` | 70 | 1.9 / 400 | |
| `lyric` | 80 | 2.6 / 400 | `next: true` |
| `text` | 50 | 2.6 / 400 | `content: "正在播放：{title}"` |
| `image` | 20 | — | `src: ""`、`radius: 0` |
| `clock` | 30 | 5 / 300 | `clock: "HH:mm"`、字间距 0.02 |
| `progress` | 50 | — | `bar`、粗细 0.6 |
| `time` | 30 | 2 / 400 | `time: "both"`、`font: "mono"` |

### 校验规则

安装和加载插件时，布局文件分两步检查。

**会导致插件无法启用的错误**（设置中显示具体原因）：

- 文件超过 512 KB，或不是有效的 JSON。
- `name` 为空或超过 40 个字符。
- 没有 `elements` 数组，或它有 0 项、超过 60 项。
- 某个元素的 `kind` 不在[元素类型](#元素类型)中。
- 某个元素的 `id` 为空、超过 40 个字符、包含不允许的字符，或与其他元素重复。
- `image` 元素的 `src` 是路径，但路径无效、扩展名不对或文件不存在。

**会被自动修正的问题**（不报错）：

- 未知的字段被忽略。
- 超出范围的数字被限制在范围内（例如 `opacity: 2` 变成 `1`）。
- 类型不对或无效的取值使用默认值（例如 `"enter": { "type": "spin" }` 变成无动画）。
- 重复的内置元素只保留第一个；缺少的内置元素自动补上并隐藏。

所以布局能被加载，不代表每个字段都按你的意图生效。请在 App 中实际看一看。

### 用 CSS 调整布局中的元素

布局中的元素也可以用 CSS 进一步调整：

```css
/* 所有自定义文字转为大写 */
[data-lp="layout-item"][data-kind="text"] { text-transform: uppercase; }

/* 按 id 选择某一个元素 */
[data-lp="layout-item"][data-id="rt-clock"] { color: var(--text-faint); }

/* 只在使用自由布局、并且唱片正在播放时 */
:root[data-player-layout="free"]:has([data-lp="vinyl"].playing) [data-lp="layout-item"][data-id="rt-ring"] { opacity: 1; }
```

- `[data-lp="layout-item"]` 是元素的外层容器，`data-kind` 和 `data-id` 都在它上面。
- 唱片封面内部有 `[data-lp="vinyl"]`、`[data-lp="cover"]`（中间的封面）、`[data-lp="tonearm"]`（唱臂）三个锚点。
- 歌名、歌手、专辑在布局中同样带有 `track-title`、`track-artist`、`track-album` 锚点。
- 插件的样式表对所有布局都生效，包括用户自己的布局。只想影响你的布局时，请按 `data-id` 选择你的布局特有的元素。
- 布局内部其他的 class（例如 `.vinyl-label`）不属于公开接口，不保证稳定。

---

## 插件是怎样被加载的

了解加载过程，有助于理解插件的行为和排查问题。

1. **读取与校验。** App 启动、打开 **设置 > 插件**、安装或删除插件、点“重新加载”时，会读取插件目录下的每个文件夹，按[规则与限制](#规则与限制)校验。校验失败的插件仍然显示在列表中，并显示原因。
2. **启用的插件。** App 记住用户打开了哪些插件以及它们的顺序。只有校验通过、`minAppVersion` 符合要求、并且不在安全模式下时，插件才会被应用。
3. **提供文件。** 插件的文件由 App 内置的本地服务器提供给界面，只有插件文件夹内的文件可以被访问。文件不会被缓存，所以修改后点“重新加载”就能看到效果。
4. **应用到窗口。** 在每个窗口（主窗口和桌面歌词窗口）中：
   - 在 `<head>` 末尾按顺序插入每个插件的样式表 `<link>`；
   - 为 `fonts` 生成 `@font-face`；
   - 为 `options` 生成 CSS 变量和 `<html>` 上的 class；
   - 合并所有插件的文字替换表，开始替换界面文字；
   - 读取 `layouts`，加入“布局”菜单（只在主窗口）。
5. **实时更新。** 用户调整选项、调整插件顺序、启用或停用插件时，只更新变化的部分，不需要刷新界面。在一个窗口中的修改会同步到另一个窗口。

加载过程中的错误（例如样式表无法加载、文字替换表格式错误、布局文件无法读取）会显示在插件卡片上，例如“无法加载样式表 style.css”，其他部分照常工作。

---

## 规则与限制

App 在安装和加载插件时会检查以下规则。不符合的插件无法启用，设置中会显示具体原因。

### 1. 只有声明式内容

插件可以包含 CSS、字体、图片和 JSON（manifest、文字替换表、布局）。插件中的其他文件（JavaScript、HTML、可执行文件等）不会被使用。

### 2. 不引用外部资源

CSS 中不能出现指向插件文件夹以外的地址。这样插件不能联网追踪用户，也能离线使用。具体来说，下面这些都会被拒绝：

| 写法 | 原因 |
| --- | --- |
| `url(https://example.com/bg.png)` | 网络地址 |
| `url(//example.com/bg.png)` | 省略协议的网络地址 |
| `url(file:///Users/me/bg.png)` | 本机文件 |
| `@import "https://…";` / `@import url(//…);` | `@import` 外部地址。插件内的样式表也请不要用 `@import` 引入，直接列在 `styles` 中 |
| `@import "https://fonts.googleapis.com/…";` | 网络字体，请把字体文件放进插件 |
| `image-set("http://…" 1x)` | 网络地址 |
| `content: "访问 https://example.com"` | CSS 中任何地方出现 `http://` 或 `https://` 都会被拒绝，包括 `content` 中的文字 |

允许的写法：

| 写法 | 说明 |
| --- | --- |
| `url(images/bg.png)`、`url("../images/bg.png")` | 插件内的相对路径 |
| `url("data:image/svg+xml;base64,…")` | `data:` URL |
| `content: "提示：…"` | 普通文字中的冒号没有问题 |
| `/* 来源：https://example.com */` | 注释中的地址会被忽略 |

### 3. 路径限制

manifest 和布局中的路径必须是插件文件夹内的相对路径：用 `/` 分隔，不能包含 `.`、`..` 段、`\` 和 `:`，不能以 `/` 开头。插件中不能包含符号链接。详见[路径的写法](#路径的写法)。

### 4. 大小限制

| 项目 | 上限 |
| --- | --- |
| 整个插件 | 30 MB |
| 文件数 | 1000 个 |
| 单个样式表 | 1 MB |
| 单个布局文件 | 512 KB |
| `styles` | 20 个 |
| `fonts` | 20 个 |
| `options` | 50 个 |
| `select` 的 `choices` | 30 个 |
| `layouts` | 10 个 |
| 每个布局的元素 | 60 个 |
| 文字替换表 | 5000 条 |

### 5. 命名前缀

插件自己定义的 CSS 变量、class、`@keyframes` 名称请加上插件专属的前缀（例如 `--mt-`、`.mt-`、`mt-fade`），避免和 App 或其他插件冲突。

不要定义以 `--lp-` 或 `lp-` 开头的名字，它们留给 App 使用。

### 6. 不要破坏可用性

- 不要隐藏设置按钮、关闭按钮、播放控制而又不提供替代。
- 不要让文字在浅色或深色模式下难以辨认。请在浅色、深色、图片背景、天气主题下都检查一遍。
- 不要用动画让界面持续闪烁或剧烈晃动。
- 不要改变元素的大小导致按钮无法点击（例如被其他元素遮住）。

用户总可以用[安全模式](#安全模式)恢复，但好的插件不应让用户需要它。

### 7. 兼容性

用到某个版本才加入的接口时，请写上 `minAppVersion`，见[版本与兼容性](#版本与兼容性)。

### 校验错误对照表

插件卡片上或安装时可能显示的错误，以及解决办法：

| 错误信息 | 原因与解决 |
| --- | --- |
| 找不到 manifest.json | 文件夹根目录没有 `manifest.json`，或文件名拼写 / 大小写不对 |
| manifest.json 格式错误：… | 不是有效的 JSON。常见原因：最后一项后面多了逗号、用了单引号、有注释、引号不配对 |
| manifest.json 应为对象 | 最外层必须是 `{ … }` |
| manifestVersion 应为 1 | 缺少 `manifestVersion` 或不是数字 `1`（`"1"` 字符串也不行） |
| 缺少字段 X | 必需字段没有写 |
| X 不能为空 / X 过长（最多 N 个字符） / X 应为字符串 | 字段的值不符合要求 |
| id 无效：… | 见 [id](#id) 的规则 |
| version 无效 / minAppVersion 无效 | 见[版本号的格式](#version-与-minappversion) |
| homepage 应为 http(s) 链接 | `homepage` 必须以 `http://` 或 `https://` 开头 |
| 路径无效：…（只能使用插件文件夹内、以 / 分隔的相对路径） | 路径以 `/` 开头、包含 `\` 或 `:` |
| 路径无效：…（不能包含 . 或 ..） | 路径中有 `.` 或 `..` 段 |
| X：文件类型应为 … | 文件扩展名不对，例如样式表不是 `.css` |
| 找不到文件：X | manifest 中写的文件不存在。检查拼写、大小写和所在文件夹 |
| X 不是普通文件 | 路径指向了文件夹 |
| 插件中不能包含链接：X | 插件中有符号链接 / 快捷方式，请换成实际文件 |
| 插件过大（最多 1000 个文件、30 MB） | 删除不需要的文件，压缩图片，子集化字体 |
| X 超过 1 MB | 单个样式表太大，检查是否嵌入了大量 `data:` 图片 |
| X 不是 UTF-8 文本 | 请用 UTF-8 编码保存样式表 |
| X 引用了外部资源：… | 见[不引用外部资源](#2-不引用外部资源) |
| styles 应为最多 20 个文件的数组 / styles 中应为文件路径 | `styles` 必须是字符串数组 |
| fonts 应为最多 20 项的数组 / fonts 的每一项应为对象 | `fonts` 的格式不对 |
| 字体名无效：X | `family` 包含不允许的字符 |
| 字体 X 的 weight / style 无效 | 见[字体字段](#使用插件自带的字体) |
| X 应为 {"原文": "替换文字"} 对象 | 文字替换表必须是对象 |
| X 条目过多（最多 5000 条） | 拆分或精简文字替换表 |
| X 中的“…”：原文不能为空，替换文字必须是字符串 | 检查空的键、数字或 `null` 值 |
| config 不支持 X（可用：…） | 只能使用[白名单中的键](#可用的键) |
| config.X 的值无效：… | 值的类型或范围不对 |
| options 应为数组 / options 最多 50 项 / options 的每一项应为对象 | `options` 的格式不对 |
| 选项 id 无效或重复：X | 选项 `id` 不符合规则，或两个选项用了同一个 `id` |
| 选项 X：… | 该选项的某个字段不符合要求，后面的说明会写明是哪一项 |
| layouts 应为最多 10 个文件的数组 / layouts 中应为文件路径 | `layouts` 的格式不对 |
| X 超过 512 KB / X：name 应为 1–40 个字符 / X：缺少 elements 数组 / X：elements 应有 1–60 项 | 布局文件不符合要求，见[校验规则](#校验规则) |
| X：未知的元素 kind：… / X：元素 id 无效或重复：… | 同上 |
| 文件夹名 X 与 id Y 不一致 | 手动复制插件时文件夹名与 `id` 不同。请改名，或用 App 重新安装 |
| 需要 LightPlayer X 或更新版本 | App 版本低于 `minAppVersion`，请更新 App |
| 无法加载样式表 X / 无法加载文字替换表 X / 无法加载布局 X | 校验通过后，加载时出错（例如文件在此期间被删除或改坏）。修正后点“重新加载” |
| 不是有效的插件包（.lpplugin / .zip） | 文件不是 zip 格式，或已损坏 |
| 插件包中没有 manifest.json | 压缩包的结构不对，见[打包](#打包) |
| 插件包中的路径无效：X | 压缩包中有指向外部的路径（例如 `../x`） |

---

## 打包与安装

### 打包

`.lpplugin` 文件就是一个 **zip 压缩包**，扩展名改成了 `.lpplugin`。下面两种结构都可以：

**结构 A：文件直接在压缩包根目录**

```
my-theme.lpplugin
├── manifest.json
├── style.css
└── …
```

**结构 B：根目录下只有一个文件夹**

```
my-theme.lpplugin
└── com.example.my-theme/
    ├── manifest.json
    ├── style.css
    └── …
```

在“访达”中右键 > 压缩，或在“文件资源管理器”中右键 > 压缩为 ZIP 文件，得到的就是结构 B。macOS 自动加入的 `__MACOSX` 文件夹和以 `.` 开头的文件夹会被忽略。

压缩后把扩展名从 `.zip` 改为 `.lpplugin`（不改也可以安装，但 `.lpplugin` 更容易识别）。

命令行打包（结构 A，排除 macOS 的 `.DS_Store`）：

```sh
cd com.example.my-theme
zip -r ../com.example.my-theme-1.0.0.lpplugin . -x '.*' -x '*/.*'
```

Windows PowerShell：

```powershell
Compress-Archive -Path .\com.example.my-theme\* -DestinationPath .\com.example.my-theme-1.0.0.zip
Rename-Item .\com.example.my-theme-1.0.0.zip com.example.my-theme-1.0.0.lpplugin
```

压缩包的要求：

- 不能包含符号链接，不能包含指向压缩包外的路径（例如 `../x`）。
- 解压后的总大小不超过 30 MB，文件数不超过 1000 个。
- 建议文件名中包含 `id` 和版本号，例如 `com.example.my-theme-1.0.0.lpplugin`，方便用户区分。

### 安装

用户有两种安装方式，都在 **设置 > 插件** 中：

| 方式 | 适用于 |
| --- | --- |
| **安装插件包…** | `.lpplugin` 或 `.zip` 文件 |
| **从文件夹安装…** | 未打包的插件文件夹（开发时常用） |

安装过程：

1. 把插件复制或解压到一个临时位置。
2. 找到 `manifest.json`，按[规则与限制](#规则与限制)完整校验。校验失败则提示原因，不会安装。
3. 以 `id` 为名放进插件目录。
4. 安装后插件默认**不启用**，用户需要打开它的开关。

### 升级

安装与已安装插件 `id` 相同的插件包时，App 会询问“已经安装了这个插件（id 相同）。要用所选的版本替换它吗？”。确认后：

- 旧版本的文件夹被整个替换为新版本（旧版本中有、新版本中没有的文件会被删除）。
- 用户的启用状态、插件顺序和选项值都会保留。
- 新版本的 `config` **不会**自动写入，见 [config](#启用停用时会发生什么)。
- 如果新版本校验失败，旧版本保持不变。

App 不会比较版本号，所以安装旧版本也会替换新版本。

### 删除

在插件卡片上点垃圾桶图标。App 会先停用插件（恢复 `config` 修改过的设置），然后删除它的文件夹和保存的选项值。

---

## 调试

### 推荐的开发流程

1. 用 **从文件夹安装…** 安装你的插件（插件会被复制到插件目录）。
2. 点 **打开插件文件夹**，用编辑器打开其中 `com.example.my-theme/` 文件夹。之后都在这里修改。
3. 修改文件后，点 **重新加载**（↻）。样式表、字体、文字替换表、布局和 manifest 都会重新读取，并重新校验。
4. 校验失败时，插件卡片上会显示具体原因，对照[校验错误对照表](#校验错误对照表)修正。
5. 做好后，把插件目录中的文件夹复制出来打包。

修改 manifest 中的 `config` 后，需要关闭再打开插件开关才会写入新的值。

### 查看界面结构

想知道某个区域有哪些锚点、当前 `<html>` 上有哪些状态属性，可以在 LightPlayer 的源码仓库中运行浏览器预览：

```sh
pnpm install
pnpm dev
```

然后用浏览器打开终端中显示的地址，用浏览器的开发者工具（检查元素）查看 DOM、试验 CSS。

浏览器预览会自动列出仓库 `examples/plugins/` 中的插件。调试自己的插件时，可以临时把插件文件夹放进 `examples/plugins/`（文件夹名等于 `id`），在浏览器中启用并实时调试。注意：

- 浏览器预览**不做**完整的校验，能在预览中加载不代表能在 App 中安装。最后请务必在 App 中安装测试。
- 浏览器预览中不能安装、导出插件。
- 浏览器的渲染效果与 App 中的 WebView 可能有细微差别。
- 调试完记得把文件夹移出 `examples/plugins/`，仓库的测试会检查这里只有自带的示例。

### 检查各种情况

发布前请至少在这些情况下看一看：

- 浅色、深色、天气主题；打开“播放音乐时使用封面作为背景”时。
- 播放页（经典样式、Flow 样式、几种布局）、歌词页、媒体库、设置窗口。
- 播放音乐、播放视频、什么都不播放时。
- 窗口很小、很宽、很高时，以及全屏时。
- 桌面歌词窗口。
- macOS 和 Windows（如果有条件）。

---

## 安全模式

插件把界面改得没法用时，按 **⌥⇧⌘P**（Windows：**Ctrl+Alt+Shift+P**）进入安全模式：

- 本次运行期间，所有插件的样式、字体、选项、文字替换和布局暂时停用。
- App 会显示提示“插件安全模式：已临时停用所有插件（再按一次恢复）”。
- 再按一次快捷键，或在 **设置 > 插件** 中点 **恢复插件**，即可恢复。
- 安全模式不会保存：重启 App 后会自动退出。如果插件的问题仍然存在，请在安全模式下进入 **设置 > 插件** 停用或删除它。
- 已经通过 `config` 写入的设置不受安全模式影响，可以在设置中直接修改。

---

## 版本与兼容性

### 标准的版本 manifestVersion

本文档描述的是 `manifestVersion: 1`。今后：

- 在 `manifestVersion: 1` 范围内**增加**功能（新的字段、新的锚点、新的 `config` 键、新的布局元素类型）时，不会改变 `manifestVersion`。旧版本的 App 不认识新字段时会忽略它，或者在校验时拒绝（例如未知的 `config` 键、未知的布局元素类型）。
- 只有做了**不兼容**的修改时，才会推出 `manifestVersion: 2`，并在一段时间内同时支持两个版本。

### 各版本加入的功能

| LightPlayer 版本 | 加入的功能 |
| --- | --- |
| 1.6.0b1 | 插件：`styles`、`fonts`、`strings`、`config`、`options`、区域锚点、状态属性、公开 CSS 变量 |
| 1.6.0b2 | `layouts` 播放页布局；锚点 `player-layout`、`layout-item`、`vinyl`、`tonearm`、`layout-editor`；状态属性 `data-player-layout` |
| 1.6.0b4 | 状态属性 `lang`（界面语言）；文字替换表也作用于托盘菜单和 App 对话框的标题与按钮 |
| 1.6.0 | 正式版，包含以上全部功能 |
| 1.6.1 | 布局中唱片的唱臂 `arm` 默认不显示 |
| 1.6.3 | 状态属性 `data-time`（天气主题的九个时段），以及 `data-sky`、`data-phase` 写入文档 |

用到表中某个版本的功能时，把 `minAppVersion` 设为那个版本（预发布版本请写对应的正式版本号，例如 `1.6.0`）。

### 让插件经得起 App 更新

- 只使用[公开接口](#公开接口)，不使用内部 class 名。
- 不假设锚点内部的 DOM 结构，例如不写 `[data-lp="transport-right"] > button:nth-child(3)`。
- 文字替换表按当前版本的界面文字编写，App 更新后检查一遍。
- 给 CSS 变量写后备值。

---

## 发布前检查清单

- [ ] `id` 是你专属的（例如反向域名），以后不会再改。
- [ ] `name`、`version`、`description`、`author` 填写正确；`version` 比上一次发布的更高。
- [ ] 写了 `minAppVersion`，并且等于你用到的最新功能所需的版本。
- [ ] 有 `preview` 缩略图。
- [ ] CSS 只使用公开接口；变量、class、`@keyframes` 都加了插件前缀。
- [ ] CSS 中没有外部地址，没有 `@import`。
- [ ] 在浅色、深色、图片背景、天气主题下都检查过。
- [ ] 在不同窗口大小、全屏、桌面歌词窗口中检查过。
- [ ] 没有隐藏必要的控件。
- [ ] 选项的默认值合理，“恢复默认选项”后效果正常。
- [ ] 字体和图片有再分发的授权，附带了需要的许可证文件。
- [ ] 删除了用不到的文件（设计源文件、`.DS_Store` 等），包的大小合理。
- [ ] 用 **安装插件包…** 安装打包后的 `.lpplugin` 测试过，而不只是用文件夹测试。
- [ ] 启用 → 停用后，`config` 修改的设置正确恢复。

---

## 示例插件

仓库的 [`examples/plugins`](../../examples/plugins) 中有四个示例。每个 Release 也附带它们打包好的 `.lpplugin`：

| 示例 | 演示内容 |
| --- | --- |
| [`example.minimal-player`](../../examples/plugins/example.minimal-player) 极简播放页 | 改变布局：封面在上、隐藏标签、精简播放栏；`select` / `range` / `toggle` 选项 |
| [`example.serif-lyrics`](../../examples/plugins/example.serif-lyrics) 宋体歌词 | 改变歌词页的字体与样式：当前行发光；`config` 调整歌词对齐和字号；`color` 选项 |
| [`example.english-ui`](../../examples/plugins/example.english-ui) English UI | 用 `strings.json` 把主要界面文字换成英文，包括占位符用法（App 现已自带英文界面，这个示例用来演示文字替换） |
| [`example.retro-turntable`](../../examples/plugins/example.retro-turntable) 复古唱机 | 播放页布局：唱片、进度环、时钟、自定义文字和图片，再用 CSS 微调布局中的元素 |

建议从最接近你想法的示例开始，复制一份，改掉 `id` 和 `name`，再逐步修改。

---

## 常见问题

**修改了插件文件，但界面没有变化？**

- 确认修改的是**插件目录中**的文件（点“打开插件文件夹”找到），而不是你最初安装时选择的那个文件夹。
- 修改后要点“重新加载”（↻）。
- 确认插件已经启用，并且没有处于安全模式。
- 检查插件卡片上是否有错误信息。
- 用浏览器预览的开发者工具检查规则是否被优先级更高的规则覆盖。

**我的规则在深色模式下不生效？**

App 在深色模式下用 `:root[data-theme="dark"]` 设置颜色变量，优先级比 `:root` 高。请为深色模式单独写一条，见[颜色变量与明暗模式](#颜色变量与明暗模式)。

**为什么在 `:root` 上设置 `--accent` 没有效果？**

主题色由 App 写在 `<html>` 的内联样式上，见[由 App 在元素上写入的变量](#由-app-在元素上写入的变量)。请用 `config.accent`。

**能用网络字体（例如 Google Fonts）吗？**

不能。请下载字体文件，放进插件并在 `fonts` 中声明。注意字体授权。

**能让插件根据正在播放的歌曲改变样式吗？**

只能通过[状态属性](#html-上的状态属性)区分媒体类型、页面等状态；不能根据歌名、歌手等具体内容区分。布局中的 `text` 元素可以用占位符显示歌曲信息。

**两个插件冲突了怎么办？**

在 **设置 > 插件** 中用上移 / 下移按钮调整顺序，靠下的优先。作为作者，请给你的变量和 class 加上前缀，并尽量用锚点限定规则的范围。

**插件能改右键菜单、系统菜单栏、托盘菜单的文字吗？**

App 自己画的右键菜单可以。托盘（通知区域）图标的菜单，以及 App 的打开、保存、确认对话框的标题和按钮，也会使用替换后的文字（1.6.0b4 起）；macOS 的应用菜单、系统通知和系统对话框中由系统提供的文字不能。

**插件会影响性能吗？**

一般不会。需要注意的是：大量使用 `backdrop-filter`、`filter: blur()`、大面积的阴影和无限循环的动画会增加 GPU 负担；非常大的图片和字体会拖慢启动。

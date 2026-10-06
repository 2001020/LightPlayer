# LightPlayer plugin development standard

[简体中文](README.md) | English

> Applies to LightPlayer 1.6.0 and later, `manifestVersion: 1`

LightPlayer plugins can change:

- the layout of the interface
- the styles of elements
- the interface text
- fonts
- the look and settings of the player page and the lyrics page

Plugins are **declarative**. A plugin is made of:

- a `manifest.json`
- style sheets (CSS)
- font files
- a text table
- a few options

Plugins **cannot run any code** (no JavaScript), so installing someone else's plugin is safe: a plugin can't read your files, accounts or play history, and can't go online.

This document is the plugin standard. Plugins that follow its rules can be installed, and the "public interface" it lists will stay stable in future versions.

> The Chinese version ([README.md](README.md)) is the reference. Interface text in LightPlayer is written in Simplified Chinese, so text-table keys, layout names and similar examples below are kept in Chinese.

- [Quick start](#quick-start)
- [Package structure](#package-structure)
- [manifest.json](#manifestjson)
- [Public interface](#public-interface)
  - [Area anchors: data-lp](#area-anchors-data-lp)
  - [State attributes on html](#state-attributes-on-html)
  - [Public CSS variables](#public-css-variables)
- [Changing styles and layout](#changing-styles-and-layout)
- [Changing interface text](#changing-interface-text)
- [Changing fonts](#changing-fonts)
- [Changing player / lyrics page settings (config)](#changing-player--lyrics-page-settings-config)
- [Options](#options)
- [Player page layouts (layouts)](#player-page-layouts-layouts)
- [Rules and limits](#rules-and-limits)
- [Packaging and installing](#packaging-and-installing)
- [Debugging](#debugging)
- [Safe mode](#safe-mode)
- [Example plugins](#example-plugins)

---

## Quick start

1. Make a folder `my-theme` with two files in it.

   `manifest.json`:

   ```json
   {
     "$schema": "https://raw.githubusercontent.com/2001020/LightPlayer/HEAD/docs/plugins/manifest.schema.json",
     "manifestVersion": 1,
     "id": "com.example.my-theme",
     "name": "My theme",
     "version": "1.0.0",
     "styles": ["style.css"]
   }
   ```

   `style.css`:

   ```css
   :root {
     --cover-radius: 50%;          /* round cover */
     --lyric-active-scale: 1.15;   /* bigger current lyric */
   }
   [data-lp="chips"] { display: none; }  /* hide the tags under the song info */
   ```

2. Open LightPlayer, go to **Settings > Plugins > Install from folder…** and choose the `my-theme` folder.
3. Turn on the switch of "My theme"; changes take effect immediately.

From then on, edit the files in the plugins folder and click **Reload** (↻); no need to restart the app.

## Package structure

```
com.example.my-theme/          ← the folder name after installing = id
├── manifest.json              ← required
├── style.css                  ← style sheets listed in styles
├── strings.json               ← optional: text table
├── fonts/MyFont.woff2         ← optional: fonts
├── layouts/turntable.json     ← optional: player page layouts
├── images/bg.png              ← optional: images used by the CSS or a layout
└── preview.png                ← optional: thumbnail in the plugin list (4:3 suggested)
```

- Every file in a plugin is referenced by a relative path, separated by `/`. `url(images/bg.png)` in CSS is resolved relative to that CSS file.
- Plugins are installed in the `plugins` folder of the app's data folder; **Open plugins folder** in Settings takes you there:
  - macOS: `~/Library/Application Support/com.lightplayer.app/plugins/`
  - Windows: `%APPDATA%\com.lightplayer.app\plugins\`

## manifest.json

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `manifestVersion` | `1` | yes | Version of the standard; only `1` for now |
| `id` | string | yes | Unique id. 3–64 characters: lowercase letters, digits, `.` and `-`, starting and ending with a letter or digit. A reverse domain name is suggested, e.g. `com.example.my-theme`. Used as the folder name after installing |
| `name` | string | yes | Display name, at most 40 characters |
| `version` | string | yes | The plugin's own version, e.g. `1.0.0` |
| `minAppVersion` | string | no | The lowest LightPlayer version needed, e.g. `1.6.0`. With an older app the plugin can't be enabled |
| `author` | string | no | Author, at most 64 characters |
| `description` | string | no | Description, at most 300 characters |
| `homepage` | string | no | Home page, an `http(s)://` link |
| `preview` | string | no | Thumbnail: png / jpg / webp / gif / svg |
| `styles` | string[] | no | Style sheets (`.css`), loaded in order, at most 20 |
| `fonts` | object[] | no | Fonts, see [Changing fonts](#changing-fonts) |
| `strings` | string or object | no | Text table: the path of a `.json` file, or an object written in place; see [Changing interface text](#changing-interface-text) |
| `config` | object | no | App settings applied when enabled, see [config](#changing-player--lyrics-page-settings-config) |
| `options` | object[] | no | Options users can adjust, at most 50, see [options](#options) |
| `layouts` | string[] | no | Player page layouts (`.json`), at most 10, see [Player page layouts](#player-page-layouts-layouts). Needs LightPlayer 1.6.0b2 or later |

Other fields (such as `$schema`) are ignored. The full JSON Schema is [`manifest.schema.json`](manifest.schema.json); with `$schema` in the file, editors such as VS Code give completion and checks.

## Public interface

LightPlayer's own class names are internal and may change between versions. **Plugins should rely only on the three kinds of public interface below.** Other selectors work too, but aren't guaranteed to keep working in new versions.

### Area anchors: data-lp

The main areas of the interface have a `data-lp` attribute; select them with `[data-lp="name"]`:

<!-- anchors -->
| Anchor | Where |
| --- | --- |
| `titlebar` | Title bar at the top of the window |
| `main` | The main area between the title bar and the playback bar |
| `player` | Player page (audio and video) |
| `now-playing` | The classic style's audio area: cover + song info |
| `cover` | Cover: the classic style's cover; in a free layout the square cover, or the cover in the middle of the record |
| `flow` | The whole Flow style (cover wall) area |
| `track-info` | Song info (in both the classic and Flow styles) |
| `track-title` | Song title |
| `track-artist` | Artist |
| `track-album` | Album |
| `chips` | The tags under the song info (format, AI lyrics, comments and so on) |
| `lyric-peek` | The two-line lyric preview on the player page |
| `lyric-peek-line` | A group of lines in the lyric preview (animated in and out) |
| `player-layout` | The whole stage of a free layout (any player page layout other than "Default") |
| `layout-item` | An element of a free layout. Also has `data-kind` (the element kind, see [Player page layouts](#player-page-layouts-layouts)) and `data-id` attributes |
| `vinyl` | The vinyl record cover (record, cover and tonearm). Has the `playing` class while playing |
| `tonearm` | The record's tonearm |
| `layout-editor` | The settings panel while editing a layout |
| `video` | The video picture |
| `subtitles` | Video subtitles |
| `lyrics-page` | Lyrics page |
| `lyrics-head` | The top of the lyrics page: back, song title, tool buttons |
| `lyrics-body` | The lyrics area of the lyrics page |
| `lyric-scroll` | The scrolling lyrics list |
| `lyric-line` | A lyric line. The current line also has a `data-active` attribute |
| `lyric-translation` | The translation in a lyric line |
| `transport` | The playback bar at the bottom |
| `progress` | The progress bar row in the playback bar |
| `transport-controls` | The part of the playback bar below the progress bar |
| `transport-now` | The left of the playback bar: cover thumbnail, song title |
| `transport-center` | The middle of the playback bar: play mode, previous, play, next and so on |
| `transport-right` | The right of the playback bar: quality, comments, speed, timer, subtitles, list, volume and so on |
| `volume` | Volume |
| `playlist` | Playlist (sidebar or floating panel) |
| `comments` | NetEase comments panel |
| `library` | Library page |
| `library-sidebar` | Library sidebar |
| `library-main` | Library content area |
| `track-table` | Song list |
| `settings` | Settings window |
| `update` | The update window shown when a new version is found |
| `desktop-lyrics` | Desktop lyrics window |
| `desktop-lyrics-line` | The text of the desktop lyrics |
<!-- /anchors -->

An anchor only guarantees that the element exists and keeps its meaning. The structure and classes inside it are not part of the public interface.

### State attributes on html

Attributes on the `<html>` element reflect the app's current state, so styles can apply only in certain situations:

<!-- root-attrs -->
| Attribute | Values | Description |
| --- | --- | --- |
| `data-window` | `main` / `desktop-lyrics` | Main window or desktop lyrics window |
| `data-platform` | `macos` / `windows` | Operating system |
| `data-theme` | `light` / `dark` | The light/dark mode actually in use |
| `data-bg` | `image` / `weather` / none | The background is an image (custom background or cover), the weather animation, or a plain color |
| `data-page` | `player` / `lyrics` / `library` | Current page |
| `data-media` | `audio` / `video` / `none` | Kind of media playing |
| `data-player-style` | `classic` / `flow` | Audio player page style |
| `data-fullscreen` | `true` / `false` | Whether in full screen |
| `data-player-layout` | `classic` / `free` | Whether the classic player page uses the default layout or a free layout (the built-in vinyl layouts, the user's or a plugin's) |
| `lang` | `zh-Hans` / `zh-Hant` / `en` / `ja` / `ko` | Interface language (since 1.6.0b4) |
<!-- /root-attrs -->

For example, only on the lyrics page in dark mode:

```css
:root[data-theme="dark"][data-page="lyrics"] [data-lp="lyric-line"] { letter-spacing: 0.04em; }
```

### Public CSS variables

Overriding these variables on `:root` is the safest way to change the look:

<!-- css-vars -->
| Variable | Default | Description |
| --- | --- | --- |
| `--font-fallback` | system font stack | The app's default font, the fallback for custom fonts |
| `--font` | `var(--font-fallback)` | Interface font |
| `--title-font` | `var(--font)` | Song title font on the player and lyrics pages |
| `--lyric-font` | `var(--font)` | Lyrics font (desktop lyrics too) |
| `--mono` | monospace font stack | Monospaced text such as time codes |
| `--lyric-weight` | `600` | Lyrics font weight |
| `--lyric-line-height` | `1.45` | Lyrics line height |
| `--lyric-gap` | `2px` | Extra space between lyric lines |
| `--lyric-dim` | `48%` | Opacity of ordinary lyric lines (66% with the weather theme) |
| `--lyric-near` | `62%` | Opacity of the lines next to the current one (80% with the weather theme) |
| `--lyric-active-scale` | `1.08` | Scale of the current line |
| `--lyric-hl` | accent color | Highlight color of the current line (overridden when the user picks a color on the lyrics page) |
| `--cover-size` | `min(32vh, 28vw, 300px)` | Side length of the classic style's cover |
| `--cover-radius` | `16px` | Cover corner radius |
| `--cover-shadow` | shadow | Cover shadow |
| `--radius-s` / `--radius` / `--radius-l` | `8px` / `12px` / `18px` | Corner radii of buttons, panels and dialogs |
| `--titlebar-h` | `44px` | Title bar height |
| `--transport-h` | `92px` | Playback bar height |
| `--accent` | the user's accent color | Accent color (written from the user's settings; plugins generally shouldn't override it — use `config.accent` to change the accent) |
| `--bg` / `--panel` / `--panel-solid` / `--panel-2` | follow light/dark | Background, translucent panel, opaque panel, secondary fill |
| `--text` / `--text-dim` / `--text-faint` | follow light/dark | Primary, secondary and faint text colors |
| `--border` / `--hover` / `--shadow` | follow light/dark | Borders, hover fill, shadows |
<!-- /css-vars -->

Color variables have a set of values each for light, dark, image backgrounds and the weather theme, set by selectors such as `:root[data-theme="dark"]` and `:root[data-bg="image"]`. When a plugin overrides colors, consider all of these, for example:

```css
:root { --panel: rgba(255, 255, 255, 0.6); }
:root[data-theme="dark"] { --panel: rgba(20, 20, 26, 0.6); }
```

## Changing styles and layout

Plugin style sheets load after the app's own styles, in the order of the plugin list in Settings (**the lower plugin wins**). With equal selector specificity, the plugin's rules apply.

- **Change styles**: override the public variables, or write rules for the anchors.
- **Hide elements**: `display: none`.
- **Change the layout**: anchors are ordinary flex / grid containers, so you can change `flex-direction`, `order`, `gap`, `grid-template-*` and so on. For example, to put the cover above the song info:

  ```css
  [data-lp="now-playing"] { flex-direction: column; text-align: center; }
  [data-lp="now-playing"] [data-lp="track-info"] { align-items: center; }
  ```

- **By state**: use the [state attributes on html](#state-attributes-on-html) and the classes options produce (see [options](#options)).
- **Background images**: `[data-lp="lyrics-page"] { background: url(images/paper.png); }` (with the image in the plugin folder).

`!important` usually isn't needed — only to override inline styles the app puts on elements, such as the lyrics font size from the user's settings. A better way to change the lyrics size is `config.lyricFontSize`.

## Changing interface text

`strings` is an "original → replacement" table. It can be a file path:

```json
{ "strings": "strings.json" }
```

`strings.json`:

```json
{
  "媒体库": "Library",
  "播放全部": "Play All",
  "共 {n} 条": "{n} comments",
  "第 {i} 首，共 {n} 首": "{i} of {n}"
}
```

or an object written in the manifest.

**The original is always Simplified Chinese.** LightPlayer's built-in 繁體中文, English, 日本語 and 한국어 interfaces work through the same text replacement ([src/i18n/locales](../../src/i18n/locales)). Whatever interface language the user chooses, the keys of a plugin's text table are the interface's original Simplified Chinese text; a plugin's entries win over the built-in language. For styles that should apply only in one language, use selectors such as `:root[lang="en"]`.

Matching rules:

- **Whole text, exact match**: a piece of text on screen is replaced only when, with whitespace trimmed at both ends, it equals the original exactly; the surrounding whitespace is kept. Nothing is replaced partially, so "媒体库" doesn't change "从媒体库移除" — that needs its own entry.
- **Placeholders**: `{name}` in the original matches any text (at least one character) and can be used in the replacement. Names are letters, digits and underscores.
- The text a placeholder stands for is looked up again, so the error message in "保存失败：{a}" is replaced too.
- Button tooltips and accessible names (`title`, `placeholder`, `aria-label`, `data-tip`) are replaced as well.
- When an element holds only text, its whole text is matched, so text built from several pieces, like "共 12,345 条", matches as a whole.
- When several plugins replace the same text, the lower plugin wins.
- The menu of the menu bar / notification area icon, and the titles and buttons of the open, save and confirmation dialogs, use the replaced text too (since 1.6.0b4).
- Not replaced:
  - The user's content: lyrics, song titles, artists, albums, file names, playlist names, comments (these areas have the `data-lp-raw` attribute)
  - Text in input fields
  - Other native system interface: the macOS app menu, the system's own text in system dialogs, notifications
- A text table has at most 5000 entries.

> The originals follow the interface of the current version. When the app is updated some text may change; the matching entries then simply stop applying, without errors.

## Changing fonts

Fonts come from two places:

**System fonts**: use them directly in CSS.

```css
:root { --lyric-font: "Songti SC", "SimSun", serif; }
```

**Fonts shipped with the plugin**: declare them in `fonts` and the app generates the matching `@font-face`.

```json
"fonts": [
  { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Regular.woff2", "weight": 400 },
  { "family": "LXGW WenKai", "src": "fonts/LXGWWenKai-Bold.woff2", "weight": 700 }
]
```

```css
:root {
  --font: "LXGW WenKai", var(--font-fallback);   /* the whole interface */
  --lyric-font: "LXGW WenKai", serif;             /* lyrics only */
}
```

- Supported formats: woff2 (recommended), woff, ttf, otf.
- `weight` can be a number or a string; `style` is optional, `normal` / `italic`.
- Chinese font files are large; use woff2 and include only the weights you need. A whole plugin can't exceed 30 MB.
- Make sure the font's license allows redistribution.

## Changing player / lyrics page settings (config)

The settings in `config` are written to the app's settings **when the plugin is enabled**:

```json
"config": { "lyricAlign": "left", "lyricFontSize": 30, "playerStyle": "flow" }
```

<!-- config-keys -->
| Key | Values | Setting |
| --- | --- | --- |
| `theme` | `system` / `light` / `dark` / `weather` | Appearance mode |
| `accent` | `#RRGGBB` | Accent color |
| `dynamicAccent` | true / false | Color from cover |
| `coverBackground` | true / false | Use the cover as the background while music plays |
| `playerStyle` | `classic` / `flow` | Player style |
| `lyricFontSize` | 14–56 | Lyrics size |
| `lyricAlign` | `center` / `left` | Lyrics alignment |
| `showTranslation` | true / false | Show lyric translations |
| `karaoke` | true / false | Word-by-word highlight |
| `lyricHighlight` | `#RRGGBB` or `null` | Current lyric highlight color (`null`: follow the accent color) |
| `desktopLyrics.color` | `#RRGGBB` | Desktop lyrics color |
<!-- /config-keys -->

- When enabled, the previous values of these settings are remembered. Disabling the plugin restores them; a setting the user changed in the meantime keeps the user's choice.
- While the plugin is on, users can still change these settings.
- Keys not in the table fail plugin validation. Other settings (such as volume or play history) can't be changed by plugins.

## Options

Options appear under "Plugin options" for the plugin in **Settings > Plugins** and take effect immediately. An option's value becomes a CSS variable, or a class on `<html>`, for the plugin's CSS to use.

```json
"options": [
  { "id": "size", "label": "Cover size", "type": "range", "min": 200, "max": 420, "step": 10, "unit": "px", "default": 320, "var": "--mt-cover" },
  { "id": "glow", "label": "Glow color", "type": "color", "default": "#ffd166", "var": "--mt-glow" },
  { "id": "compact", "label": "Compact", "type": "toggle", "default": false, "class": "mt-compact" },
  { "id": "layout", "label": "Layout", "type": "select", "default": "side",
    "choices": [ { "value": "side", "label": "Side by side" }, { "value": "stack", "label": "Stacked", "class": "mt-stack" } ] }
]
```

```css
:root { --cover-size: var(--mt-cover); }
:root.mt-compact [data-lp="transport"] { padding-block: 4px; }
:root.mt-stack [data-lp="now-playing"] { flex-direction: column; }
```

| Type | Required fields | Effect |
| --- | --- | --- |
| `range` | `min`, `max`, `default`, `var`; optional `step` (default 1), `unit` | The `var` variable = the number + `unit`, e.g. `320px` |
| `color` | `default` (`#RRGGBB`), `var` | The `var` variable = the color |
| `toggle` | `default` (true / false), at least one of `class` and `var` | When on, `class` is added to `<html>`; the `var` variable is `1` / `0` |
| `select` | `choices` (1–30, each with `value`, `label` and optional `class`), `default` | The chosen choice's `class` is added to `<html>`; with `var`, the variable = the chosen `value` |

Any option can have a `description`, shown under it as a note.

- `id` is unique within the plugin, made of letters, digits, `_` and `-`.
- Variables are written on `:root` after the plugin's style sheets, so CSS can use them directly. Give a fallback too, e.g. `var(--mt-cover, 320px)`.
- Users' option values are stored in the app. After a plugin update, a value that is no longer valid (out of range, option removed) falls back to the new default.

## Player page layouts (layouts)

Besides CSS tweaks, a plugin can ship complete **player page layouts**: where the cover (square or vinyl), title, artist, album, tags and lyric preview go, how big they are, how they look, how they enter when the song changes, plus text, images, clocks, progress bars or rings and play time. Once the plugin is enabled, its layouts appear in the **Layout** menu at the top right of the player page (under "From plugins"); users can choose them, or edit one and save it as their own.

**The easiest way is to make it in the app and export it**: on the player page, **Layout > Edit layout…**, drag elements and adjust them in the panel on the right, click "Done" to save; then **Layout > Export as plugin…** gives you a `.lpplugin` holding just this layout (and the images it uses). Share it as is, or unzip it, add CSS, rename it and publish it.

A layout file is JSON:

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

**Coordinates and units**: `x` and `y` are the element's center in the player area, in percent (0–100, may go slightly beyond); `w` (width) and text sizes are in **u**, where 1u is 1% of the player area's shorter side. So a layout keeps its proportions in any window size. Elements stack in array order, later ones on top.

**Element kinds** (`kind`):

<!-- layout-kinds -->
| kind | Description |
| --- | --- |
| `cover` | Cover; `cover.shape` is `square` or `vinyl` (record). Click to open the lyrics page |
| `title` | Song title. Click to open the lyrics page |
| `artist` | Artist |
| `album` | Album |
| `chips` | Tags: format, playback method, AI lyrics, comment count |
| `lyric` | Lyric preview (the current line, plus the next when `next` is true) |
| `text` | Custom text `content`, which can include `{title}` `{artist}` `{album}` `{elapsed}` `{duration}` `{remaining}` `{time}` `{date}` |
| `image` | Image `src`: a relative path in the plugin folder (png / jpg / webp / gif / svg), or `data:image/…` |
| `clock` | Clock; `clock` is `HH:mm` / `HH:mm:ss` / `date` / `datetime` |
| `progress` | Playback progress; `progress.style` is `bar` (clickable to seek) or `ring` |
| `time` | Play time; `time` is `elapsed` / `remaining` / `both` |
<!-- /layout-kinds -->

There can be only one each of `cover`, `title`, `artist`, `album`, `chips` and `lyric`; missing ones are added automatically and hidden. The other kinds can appear several times (at most 60 elements in all). Every element has a unique `id` (letters, digits, `-`, `_`).

**Common fields**:

| Field | Description |
| --- | --- |
| `x` / `y` | Center position, percent |
| `w` | Width, u |
| `rotate` | Rotation angle |
| `opacity` | Opacity 0–1 |
| `hidden` | Hidden |
| `enter` | Entrance animation on song change: `type` is `none` / `fade` / `up` / `down` / `left` / `right` / `zoom` / `blur`; `duration` and `delay` in milliseconds |
| `text` | Text style (text elements): `size` (u), `weight` (100–900), `color` (`#RRGGBB`, `null` follows the theme), `font` (empty for the default, `serif` / `rounded` / `mono`, or a font name), `italic`, `shadow`, `spacing` (letter spacing, em), `align` (`left` / `center` / `right`) |
| `cover` | Cover: `shape`, `radius` (corner radius of the square, percent of the width), `shadow`; records also have `spin` (spin while playing), `speed` (seconds per turn), `arm` (tonearm, off by default), `grooves` (grooves and sheen), `label` (the cover's share of the record's diameter, percent) |
| `progress` | `style`, `thickness` (u), `color` (`null` for the accent color) |

Other fields are ignored, and out-of-range numbers are clamped. The full format is [`layout.schema.json`](layout.schema.json).

Layout elements can be fine-tuned with CSS too, for example:

```css
[data-lp="layout-item"][data-kind="text"] { text-transform: uppercase; }
[data-lp="vinyl"] .vinyl-label { filter: saturate(1.2); }  /* internal class, not guaranteed stable */
```

## Rules and limits

The app checks these rules when installing and loading plugins; a plugin that breaks them can't be enabled, and Settings shows the reason.

1. **Declarative content only**. CSS, fonts, images and JSON (text tables, layouts). Other files in a plugin aren't used.
2. **No external resources**. CSS can't refer to anything outside the plugin folder, including addresses starting with `http:`, `https:`, `//` or `file:`, and no `@import`. Only relative paths and `data:` are allowed. So plugins can't track users over the network, and they work offline.
3. **Path limits**. Paths must be relative paths inside the plugin folder: separated by `/`, no `..`, not starting with `/`, and no symbolic links in the plugin.
4. **Size limits**. At most 1 MB per CSS file; at most 30 MB and 1000 files for the whole plugin.
5. **Name prefixes**. Give the CSS variables and classes your plugin defines a prefix of its own (e.g. `--mt-`, `.mt-`) to avoid clashing with the app or other plugins. Don't define names starting with `--lp-` or `lp-`; they are reserved for the app.
6. **Don't break usability**. Don't hide the settings button, close buttons or playback controls without providing a replacement; don't make text hard to read in both light and dark mode. Users can always recover with [safe mode](#safe-mode), but a good plugin shouldn't make them need it.
7. **Compatibility**. When you use an interface added in a particular version, set `minAppVersion`.

## Packaging and installing

A `.lpplugin` file is just a zip archive. Either structure works:

- `manifest.json` directly at the root of the archive;
- a single folder at the root, with `manifest.json` inside it. Compressing the plugin folder in Finder or File Explorer gives this structure.

After compressing, change the extension to `.lpplugin` (`.zip` installs too).

Packaging from the command line:

```sh
cd com.example.my-theme && zip -r ../com.example.my-theme.lpplugin .
```

To install: **Settings > Plugins > Install plugin package…**. If a plugin with the same `id` is already installed, you're asked whether to replace it (e.g. to upgrade). After replacing, the user's enabled state and option values are kept.

## Debugging

1. Install the plugin with **Install from folder…**. The plugin is copied into the plugins folder.
2. Click **Open plugins folder** and edit the files in `com.example.my-theme/` there.
3. After editing, click **Reload** (↻). Styles, text tables and the manifest are all read again.
4. When validation fails, the plugin card shows the reason, e.g. "style.css refers to an external resource: https://…".

The LightPlayer source repository includes a browser preview (`pnpm dev`) that lists the plugins in `examples/plugins/`, so CSS can be debugged in the browser.

## Safe mode

When a plugin makes the interface unusable, press **⌥⇧⌘P** (Windows: **Ctrl+Alt+Shift+P**) for safe mode:

- The styles and text replacements of all plugins are turned off for this run.
- Press it again, or click "Restore plugins" in **Settings > Plugins**, to bring them back.
- Settings already written through `config` are not affected by safe mode and can be changed in Settings directly.

## Example plugins

[`examples/plugins`](../../examples/plugins) in the repository has four examples. Every release also includes them packaged as `.lpplugin`:

| Example | Shows |
| --- | --- |
| [`example.minimal-player`](../../examples/plugins/example.minimal-player) Minimal player | Changing the layout: cover on top, tags hidden, a slimmer playback bar; `select` / `range` / `toggle` options |
| [`example.serif-lyrics`](../../examples/plugins/example.serif-lyrics) Serif lyrics | Changing the font and style of the lyrics page: a glowing current line; `config` sets the lyrics alignment and size; a `color` option |
| [`example.english-ui`](../../examples/plugins/example.english-ui) English UI | Replacing the main interface text with English through `strings.json`, including placeholders (the app now has an English interface built in; this example demonstrates text replacement) |
| [`example.retro-turntable`](../../examples/plugins/example.retro-turntable) Retro turntable | A player page layout: record, progress ring, clock, custom text and an image, with CSS fine-tuning the layout's elements |

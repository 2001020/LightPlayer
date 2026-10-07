# LightPlayer

[简体中文](README.md) | English

A lightweight media player for macOS and Windows. Built with **Tauri 2 + React + TypeScript**,
it plays almost any audio and video format with the bundled **FFmpeg**, and recognizes lyrics **offline on your computer** with **whisper.cpp**.
The code is written with Claude.

The design is described in [docs/PLAN.en.md](docs/PLAN.en.md).

## Features

| Feature | Description |
|---|---|
| Playback | Play/pause, previous/next, skip back/forward 15 s (or 10/30 s), speed 0.5–3× (pitch kept) |
| Play modes | In order / repeat all / repeat one / shuffle (no repeats within a round; "Previous" follows the real play history) |
| Progress and volume | Draggable progress bar (time preview on hover, buffered range), ←/→ keys; **in-app** volume slider (the system volume is left alone) |
| Playlist | Lists the files **of the same kind** in the current file's folder (audio lists audio, video lists video), natural sort order, searchable; click to play, drag to reorder, remove from the list; also shown on the lyrics page, as a floating panel when the window is narrow |
| Cover and info | Audio shows the cover, title, artist and album (tags → cover/folder.jpg in the same folder → an "Artist - Title" file name) |
| Lyrics page | Click the cover or title to open it; loads `.lrc/.srt/.vtt/.txt` files with the same name (GBK/Big5 detected) or embedded lyrics; scrolling highlight (color can be changed), click to jump, translation lines, word-by-word karaoke, global offset, font size (Aa menu or ⌘+/⌘−/⌘0, Ctrl on Windows); the highlighted line stays centered; "No lyrics" when there are none; the lyric preview on the player page animates between lines |
| Desktop lyrics | A button in the playback bar opens desktop lyrics floating above all windows: one line at a time; change the color, drag to move, resize, close at the top right |
| Precise timing | Some downloaded music files make WebKit's playback clock drift (the lyrics get faster and faster); when detected, playback switches to FFmpeg-decoded precise timing, which can also be turned on from the lyrics page menu |
| Upload and make lyrics | Upload a lyrics file; the lyrics editor supports **tapping** (press Space as you listen), **line editing** (fine-tune times, insert/delete/sort, global offset) and preview; save next to the song (backed up as `.lrc.bak`), to the app's lyrics library, or export |
| **AI lyrics recognition** | Runs Whisper offline on your computer (Metal GPU on Apple Silicon, CPU on Windows); downloads the model on first use (a mirror for mainland China is available); voice detection (Silero VAD), vocal boost, hallucination filtering, Traditional-to-Simplified conversion, word timings; the result scrolls like normal lyrics with the note "These lyrics were made by a recognition model and may contain errors", and can be proofread and saved in the editor; recognize again (with another model), remove the AI lyrics, or look for a local lyrics file again |
| Recognition tasks | Lyrics and subtitle recognition tasks run one after another: the panel in the title bar shows progress; pause, cancel, reorder, retry; right-click in the library to add a whole list at once |
| Video info | File size, resolution, frame rate, bit rates (total/video/audio), codecs, HDR, channels and more |
| Appearance | Light/dark/same as system; default accent light blue `#66ccff`, presets or a custom color (text contrast is kept); custom background image (blur, dim, fit); color from the cover |
| **Interface languages** | 简体中文, 繁體中文, English, 日本語 and 한국어 (Settings > Appearance > Language; follows the system by default); lyrics, song titles and other content are not translated |
| Library | Add folders (subfolders scanned, refreshed at launch), record played files, drag files or folders onto the library page; browse by songs, albums, artists and videos, with search, sorting, favorites, your own playlists (drag to reorder), **import a folder as a playlist**, and "Play next / Add to queue" from the context menu; albums can be removed from the library or moved to the Trash; playing from the library makes the current view the queue; the app opens to the library, and the player page has a back button (`⌘L`) |
| Weather theme | Choose "Weather" in Appearance for an animated sky that follows the live weather where you are: sunshine, clouds, rain, thunder, snow, hail, fog and stars, with rain, snow and hail landing on the playback bar, the cover and other parts of the interface. Following local sunrise and sunset, the sky goes through nine stages (daybreak, sunrise, morning, noon, afternoon, evening, sunset, night and midnight), its colors change smoothly over time, the sun and moon move along an arc, and the accent color can follow the time of day too (macOS uses the system location service, Windows an approximate location from the network, or choose a city; weather from the free Open-Meteo) |
| Private browsing | Opened files leave no trace: not in recently played, no play counts or positions, not added to the library (⇧⌘N / Ctrl+Shift+N on Windows, Settings, or the menu bar / notification area icon) |
| Background and menu bar | Keeps playing in the background after the window is closed; the menu bar icon on macOS (the notification area icon on Windows) plays/pauses, skips, reopens the window or quits (can be turned off in Settings; on macOS the song title can show in the menu bar) |
| NetEase Cloud Music (experimental) | Turn it on and sign in under Settings to play your playlists, liked songs and daily picks from the library sidebar, search, switch quality, use NetEase's lyrics and click the **heart** to add a song to the account's liked songs; while a NetEase song plays you can read its **comments** (popular / latest, threaded replies, shortcut `C`). Uses unofficial APIs that may stop working at any time |
| **Plugins** | Install plugins to change the layout, styles, text and fonts of the interface, and the look and settings of the player and lyrics pages; a plugin holds only style sheets, fonts and text tables and cannot run code; install, enable, order and configure them under "Settings > Plugins". If a plugin messes up the interface, press `⌥⇧⌘P` (Windows: `Ctrl+Alt+Shift+P`) for safe mode. To make one, read the [plugin development standard](docs/plugins/README.en.md); examples are in [`examples/plugins`](examples/plugins) |
| **Custom player page** | The cover can be a square or a spinning vinyl record (with an animated tonearm); three built-in layouts: "Default", "Turntable" and "Vinyl + two columns"; under "Layout > Edit layout…" on the player page, drag and resize elements, set fonts, colors and entrance animations, and add text, images, clocks, progress rings and more; your own layouts can be exported as plugins to share |
| Automatic updates | Checks GitHub Releases for a new version at launch and every 12 hours (can be turned off, or pre-releases included or not, under "Settings > About"); shows the release notes, downloads with one click (over several connections with the bundled aria2; size and SHA-256 checked), installs and reopens. Works for the macOS version and the Windows installer and portable versions |
| Other | A-B loop, sleep timer (fade out / after this song), resume playback, external/embedded subtitles, **AI-generated video subtitles**, video screenshots, frame stepping, immersive full screen (controls and title bar hide), feature hints after hovering a button for 1 s, drag and drop to open, "Open with" in Finder / File Explorer, macOS Control Center / Windows media overlay and media keys |

### How every format plays

The backend analyzes the file with ffprobe and, given the decoders the WebView reports, chooses:

- **Direct playback**: mp3 / aac / m4a / flac / wav / mp4 (H.264/HEVC) and so on.
- **Converted audio cache**: ape / wma / dsf / tta / wv … are decoded to a cached FLAC and played (cache limit 2 GB).
- **Remuxing**: the H.264/HEVC video stream in mkv / flv / ts / avi is copied into HLS (lossless, almost no CPU).
- **Live transcoding**: wmv / rmvb / mpeg2 / 10-bit H.264 … are encoded to H.264 HLS (VideoToolbox hardware encoding on macOS, libx264 on Windows).

WebKit on macOS and WebView2 on Windows decode different formats (WebView2 has no ALAC or AIFF, for example); the frontend reports what it can actually play and the backend converts accordingly.

Seeking to a part that hasn't been made yet restarts ffmpeg from there (aligned to a keyframe); the timeline always shows the full duration.

## Shortcuts

`Space` play/pause, `←/→` back/forward, `J/L` ±15 s, `↑/↓` volume, `M` mute, `⌘←/⌘→` previous/next,
`⌘O` open, `⌘L` library, `⌘,` settings, `Y` lyrics page, `E` lyrics editor, `I` video info, `F` full screen, `S` screenshot, `,/.` frame step,
`[/]` speed, `A` A-B loop, `C` NetEase comments, `⌥⇧⌘P` plugin safe mode, `Esc` back

On Windows `⌘` is `Ctrl` and `⇧` is `Shift`, e.g. `Ctrl+O` to open, `Ctrl+Shift+N` for private browsing.

## Download

Get the latest version from [Releases](../../releases):

| System | File | Notes |
|---|---|---|
| macOS 12+ (Apple Silicon) | `LightPlayer_<version>_aarch64.dmg` | Open it and drag the app into Applications |
| Windows 10 / 11 (x64) | `LightPlayer_<version>_x64-setup.exe` | Installs for the current user, no administrator rights needed |
| Windows 10 / 11 (x64) | `LightPlayer_<version>_x64_portable.zip` | Portable version; unzip and run `LightPlayer.exe` |

**macOS**: the build is ad-hoc signed (not notarized by Apple), so the first time you open it macOS will likely say the developer can't be verified or the app is damaged. Run:

```bash
xattr -dr com.apple.quarantine /Applications/LightPlayer.app
```

or right-click it in Finder → Open (on older macOS versions).

**Windows**: the installer is not code-signed; when SmartScreen says "Windows protected your PC", click "More info → Run anyway". The Microsoft Edge WebView2 runtime is needed (included in Windows 11; the installer installs it automatically). Windows doesn't let apps make themselves the default; under "Settings > Library > File associations" you can open the system's "Default apps" settings and choose LightPlayer.

## Development

You need Node 20+, pnpm 10, Rust (stable) and CMake; on macOS also the Xcode Command Line Tools, on Windows also Visual Studio Build Tools ("Desktop development with C++") and Git Bash.

```bash
pnpm install
bash scripts/fetch-ffmpeg.sh          # downloads the ffmpeg/ffprobe sidecars to src-tauri/binaries/
bash scripts/fetch-aria2.sh           # the aria2c sidecar for updates (built from source on macOS, a few minutes)
pnpm tauri dev                         # development mode
pnpm tauri build --bundles app,dmg     # package (macOS)
pnpm tauri build --bundles nsis        # package (Windows; run fetch-ffmpeg.sh and fetch-aria2.sh first for the .exe sidecars)
```

- `pnpm test`: frontend unit tests (LRC parsing, play queue, colors, UI languages and more)
- `cd src-tauri && cargo test`: backend tests (routing decisions, Range, lyrics lookup/encodings; the HLS and transcoding integration tests need ffmpeg on the machine)
- `pnpm dev` previews the interface in an ordinary browser (with the built-in mock; local files are opened with a file picker)
- `node scripts/i18n.mjs`: lists UI strings a language lacks; `--hant` fills in Traditional Chinese automatically (see [src/i18n](src/i18n))

Data: `~/Library/Application Support/com.lightplayer.app/` on macOS, `%APPDATA%\com.lightplayer.app\` on Windows
(`models/` recognition models, `lyrics/` the app's lyrics library, `backgrounds/`);
caches are in `~/Library/Caches/com.lightplayer.app/` (Windows: `%LOCALAPPDATA%\com.lightplayer.app\`).

## License notes

The app's code can be used freely. The bundled static FFmpeg builds (from [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)) contain GPL components
and are only run as separate processes; if you distribute the app publicly, follow their licenses or switch to an LGPL build (`scripts/fetch-ffmpeg.sh` can change the source).
The bundled [aria2](https://github.com/aria2/aria2) (for downloading updates) is licensed under GPL-2.0 and also only run as a separate process; the Windows build is the official one, and the macOS build is compiled from the official source by `scripts/fetch-aria2.sh`.
The Whisper models and whisper.cpp are open source under the MIT license.

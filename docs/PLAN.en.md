# LightPlayer desktop media player — development plan

[简体中文](PLAN.md) | English

## Background and goals

LightPlayer is a desktop media player for macOS first, with room to grow to Windows. Target features: full playback control, a playlist of same-kind files from the same folder, cover/artist display, lyrics (loaded automatically / uploaded / tapped by hand), **lyrics recognized by a local model**, detailed video info, light/dark and custom themes/backgrounds, and a subtle live audio waveform on both sides of the lyrics page.

Decisions made:
- Stack: **Tauri 2 + React + TypeScript**, with **support for every media format** (through an ffmpeg sidecar).
- Recognition models: **downloaded on first use**, not bundled in the installer.
- Platforms: macOS for now (Apple Silicon first, universal build); Windows is a later goal the architecture leaves room for.

---

## 1. Architecture

```
┌──────────────────── React frontend (WKWebView / later WebView2) ────────────────┐
│ Playback controls, list, lyrics page, lyrics editor, settings/theme, library    │
│ <audio>/<video> (direct output; the element's volume is the in-app volume)      │
└───────────────▲─────────────────────────────── Tauri IPC (invoke / event) ─────┘
                │ http://127.0.0.1:<random port>/?token=… (Range / chunked streams)
┌───────────────┴──────────────── Rust backend ─────────────────────────────────┐
│ media: probing (ffprobe), folder scans, metadata/covers (lofty), playback      │
│        routing (direct/remux/transcode)                                         │
│ server: local axum server (Range for direct playback + ffmpeg pipe streams)    │
│ lyrics: same-name lyrics lookup, encoding detection (GBK/UTF-8), saving, the   │
│         app's lyrics library                                                   │
│ asr: model management (download/verify), ffmpeg decode to 16k → (vocal         │
│      separation) → VAD → whisper-rs (Metal)                                    │
│ sidecar: ffmpeg / ffprobe (LGPL build, universal2)                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Playing every format (the key design)
The WebView can natively play only mp3/aac/m4a/alac/wav/aiff/flac/mp4/mov (h264/hevc) and the like. With a bundled **ffmpeg/ffprobe sidecar**, the Rust `router` picks a strategy from the ffprobe result and the decoders the frontend reports (`canPlayType` / `MediaSource.isTypeSupported`):

| Strategy | When | How |
|---|---|---|
| Direct | The container and codecs are supported by the WebView | The local server returns the original file by Range; seeking is fully native |
| Audio transcode cache | ape/wma/dsf/dff/tta/wv/mka/ac3/dts… | ffmpeg decodes the whole file to FLAC in the cache folder (a few hundred ms to a few seconds), then plays it Direct; LRU cache limit 2 GB |
| Remux | The video codec is supported but the container isn't (h264/hevc in mkv/flv/ts/avi) | Streamed through a pipe with `ffmpeg -c:v copy -c:a aac -f mp4 -movflags frag_keyframe+empty_moov+default_base_moof`; meanwhile the whole file is remuxed into the cache in the background, and playback switches to Direct seamlessly when done |
| Transcode | The codec isn't supported (wmv/rmvb/mpeg2/vc1/divx…) | Live hardware transcoding with `h264_videotoolbox` (Windows later: nvenc/qsv/amf with a libx264 fallback) |

Remux/Transcode use a **virtual timeline**: the frontend keeps `PlaybackSession{ baseOffset, duration }`, the displayed time is `baseOffset + element.currentTime`, and seeking outside the buffered range calls `request_stream(path, start)`, which restarts ffmpeg with `-ss start` and updates `baseOffset`. The local server uses a random port and a per-session token, listens only on 127.0.0.1, and sends CORS headers.

### Distribution and permissions
- Developer ID signing + notarization (not the sandboxed App Store), since otherwise "scan the same folder / same-name lyrics" would need permission folder by folder; the sidecar binaries are signed too (hardened runtime).
- Audio and video types are registered through `fileAssociations` in `tauri.conf.json`, and macOS `RunEvent::Opened { urls }` is handled for double-clicking / "Open with" in Finder.

---

## 2. Directory layout (planned)

```
LightPlayer/
├─ docs/PLAN.md                      # this document
├─ package.json / vite.config.ts / tsconfig.json / index.html
├─ scripts/fetch-ffmpeg.sh           # downloads and places the ffmpeg/ffprobe sidecars (not committed)
├─ src/                              # React frontend
│  ├─ core/player/PlaybackController.ts   # wraps the media element, virtual timeline, stream sessions
│  ├─ core/player/audioGraph.ts           # Gain (in-app volume) + Analyser (waveform)
│  ├─ core/playlist/queue.ts              # in order / repeat all / repeat one / shuffle (pure functions, testable)
│  ├─ core/lyrics/{lrcParser,lrcSerializer,lyricSync}.ts
│  ├─ stores/{player,playlist,lyrics,settings}Store.ts   # zustand
│  ├─ components/  TransportBar, ProgressBar, VolumeSlider, PlayModeButton,
│  │               PlaylistPanel, NowPlaying, CoverArt, VideoSurface, VideoInfoDialog,
│  │               LyricsView, LyricsEditor, AiLyricsBanner, ThemeSettings
│  ├─ pages/ {PlayerPage, LyricsPage, SettingsPage}
│  ├─ styles/tokens.css                   # theme CSS variables
│  ├─ i18n/{zh-CN,en}.json
│  └─ lib/ipc.ts                          # typed invoke wrappers
└─ src-tauri/
   ├─ tauri.conf.json / capabilities/default.json / binaries/
   └─ src/
      ├─ lib.rs, commands.rs, settings.rs
      ├─ media/{kinds,scan,probe,metadata,router}.rs
      ├─ server/{mod,range,stream}.rs
      ├─ lyrics/{mod,encoding,store}.rs
      └─ asr/{models,pipeline,separate,postprocess}.rs
```

Main dependencies: Rust — `tauri 2`, `tauri-plugin-{dialog,fs,store,shell}`, `axum`, `tokio`, `lofty`, `whisper-rs` (features=`metal`), `ort` (ONNX: Silero VAD / vocal separation), `reqwest`, `sha2`, `chardetng` + `encoding_rs`, `natord`, `ferrous-opencc`, `souvlaki` (system media keys / Now Playing). Frontend — React 18, zustand, Vite, Vitest, `culori` (OKLCH colors).

### IPC
- `open_media(path) -> MediaItem { kind: Audio|Video, play_url, strategy, duration, meta }`
- `scan_playlist(path) -> Vec<MediaEntry>`
- `get_metadata(path) -> { title, artist, album, cover_url }`
- `get_video_info(path) -> VideoInfo`
- `request_stream(path, start_secs) -> url`
- `find_lyrics(path) -> Option<LyricsSource { content, origin: Sidecar|Embedded|Library|Ai }>`
- `save_lyrics(path, content, target: SameDir|Library)`
- `asr_list_models / asr_download_model / asr_start(path, opts) / asr_cancel`
- Events: `asr://progress`, `model://download-progress`, `app://open-files`

---

## 3. How each requirement is met

**1. Play/pause**: the central button + Space + system media keys (`souvlaki`; macOS Control Center "Now Playing", Windows SMTC later).

**2. Play modes**: one button cycles in order → repeat all → repeat one → shuffle, with an icon + tooltip; the state is saved. Implemented as pure functions in `queue.ts`; shuffle uses a Fisher-Yates order (no repeats within a round) + a history stack, so "Previous" goes back to the song actually heard before.

**3. Previous/next**: computed from the mode; when more than 3 s in, "Previous" first goes back to the start (as mainstream players do). In-order mode stops at the end. Shortcuts ⌘← / ⌘→.

**4. ±15 seconds**: two buttons; shortcuts J / L. The step can be changed in settings.

**5. Progress bar and volume**:
- Custom progress bar: dragging only updates the preview and seeks on release (no stutter while dragging); hovering shows a time tooltip; the buffered range is shown. ←/→ move the position (5 s by default, configurable), wherever the focus is (except text fields).
- Volume: a slider (0–100%, optionally 150% gain) through the element's volume, **affecting only the in-app volume, never the system volume**; mute button, ↑/↓, mouse wheel, volume remembered.

**6. Playlist**: after a file is opened, Rust scans its folder (not recursively) and classifies by extension: audio lists only audio, video only video; natural sort ("2" before "10"); search filter, double-click to play, the current item highlighted. Ways to open: menu ⌘O, dragging onto the window, double-click / "Open with" in Finder, recent files.

**7. Cover and info (audio only shows cover/artist)**: `lofty` reads title/artist/album/embedded cover (cached as a file served by the local server); fallbacks: `cover/folder/<same name>.jpg|png` in the same folder → a generated gradient placeholder. With no artist, an "Artist - Title" file name is parsed; failing that the artist line is hidden. Videos only show the file name.

**8. Lyrics page**: click the cover/title to open (with a shared-element transition), Esc goes back.
- Load order: a same-name `.lrc` in the same folder (case-insensitive, also `name.*.lrc`) → embedded lyrics (USLT/SYLT) → the app's lyrics library → otherwise **"No lyrics"**.
- Encoding detection (`chardetng`, with Chinese LRC in GBK/Big5 in mind).
- Parser: multiple timestamps per line, `[offset:]`, `[ti/ar/al]`, two lines with the same timestamp read as a translation, enhanced LRC `<mm:ss.xx>` word timings; plain `.txt` shows as static lyrics without a timeline.
- Display: the current line highlighted and enlarged, smooth scrolling to the center, click a line to jump, follow resumes 3 s after manual scrolling, global offset in ±0.5 s steps, font size.
- **Upload lyrics**: choose `.lrc/.txt/.srt` → parse and preview → save next to the media (same name) or in the app's lyrics library (automatic fallback when the folder isn't writable).
- **Making lyrics by hand (tapping) in the editor**:
  - Tapping mode: paste plain lyrics → play → press Space/Enter to time the current line and move on, Backspace undoes, pause/rewind 15 s at any time.
  - Table mode: each line's "time + text" is editable, ±0.1 s nudges, insert/delete/move lines, click a time to listen from there.
  - Preview mode: try it out in the normal lyrics view.
  - Saved as `<media name>.lrc`; confirms before overwriting an existing file and keeps `.lrc.bak`.

**9. Lyrics recognition by model (the focus)**:
- Model management (settings page): `tiny`/`base`/`small`/`large-v3-turbo (q5_0, recommended on Apple Silicon)`; the first click on "Recognize lyrics" leads to downloading into `~/Library/Application Support/LightPlayer/models`; resumable downloads, SHA-256 verification, switchable sources (Hugging Face / the hf-mirror mirror, for networks in mainland China).
- Pipeline (Rust background thread, cancelable, progress events to the frontend): ffmpeg decodes to 16 kHz mono → **vocal separation (optional, MDX-Net/Demucs ONNX, a big gain for songs, as a second phase)** → Silero VAD segmentation → `whisper-rs` (Metal GPU, token timestamps, automatic/chosen language, a Chinese initial prompt nudging toward Simplified Chinese and sentence breaks) → post-processing: filter hallucinations (repeats, known phantom lines such as "subtitles provided by…", segments with high no_speech_prob), split long sentences at pauses, optional OpenCC Traditional-to-Simplified → LRC (with word timings).
- The result is saved in the app's lyrics library (marked `origin=Ai`, never overwriting the user's files) and immediately shows and scrolls like normal lyrics, with a banner **"These lyrics were made by a recognition model and may contain errors"** + an "Edit and proofread" button → opens the editor from item 8; once saved it can be written as a `.lrc` next to the song, and the banner becomes "AI lyrics (proofread)".

**10. Video details**: during video playback an "ⓘ" button in the control bar (shortcut I) opens a panel: file size, resolution (with rotation/display aspect ratio), frame rate (parsed from `avg_frame_rate`, e.g. 23.976), total, video and audio bit rates, plus codecs, duration, container, audio sample rate/channels, HDR info and the current playback strategy (direct/remux/transcode). The data comes from ffprobe JSON.

**11. Appearance**:
- Light/dark/same as system; every color is a CSS variable in `tokens.css`.
- Custom accent color: preset swatches + a color picker; hover/pressed/muted shades are derived in OKLCH, keeping text contrast.
- Custom background image: the chosen image is copied to the app's data folder; adjustable blur (0–40 px), dim opacity and fit; panels are frosted glass (backdrop-filter); optionally "use the cover as the background while audio plays".

**Extra: audio waveform on both sides of the lyrics page**: shown when the window is at least 1100 px wide (the lyrics column is at most 640 px, leaving at least 200 px each side); data from an `AnalyserNode`, drawn as thin mirrored bars/soft curves, opacity 0.15–0.25, in the accent color, heavily smoothed, capped at 30 fps; stopped/static while paused, when the window is hidden, or with the system's "reduce motion". Fallback: if the WebView can't sample the media source, Rust precomputes an RMS envelope with ffmpeg (20 ms resolution) and the animation follows currentTime.

---

## 4. Milestones

| Phase | Content |
|---|---|
| M0 | Scaffold (Tauri 2 + Vite React TS), ffmpeg sidecar script, local media server, CI (macos-14) |
| M1 | Core playback 1–5, shortcuts, in-app volume |
| M2 | Playlist and modes 6, opening files/drag and drop/file associations/recent files |
| M3 | Metadata/covers 7, video details 10 |
| M4 | Every-format routing: audio transcode cache, Remux, Transcode, virtual timeline |
| M5 | Lyrics display, automatic lookup, upload (first half of 8) |
| M6 | Lyrics editor: tapping/table/preview/saving (second half of 8) |
| M7 | Model management + recognition pipeline + AI banner (9); M7b vocal separation |
| M8 | Themes/backgrounds 11, side waveforms |
| M9 | Extra features, performance and memory polish, signing and notarization, universal build |

---

## 5. Suggested extra features (practical / novel / fun)

Practical:
1. **Playback speed** 0.5–3× (audio keeps its pitch with `preservesPitch`).
2. **A-B loop** (language learning, learning songs by ear).
3. **Sleep timer**: fade out and pause after N minutes or "after this song".
4. **Resume playback**: videos/long audio remember where you left off.
5. **Subtitles**: external srt/ass/vtt and embedded subtitles (converted to WebVTT by ffmpeg); and **reuse the model from item 9 to make subtitles for videos**.
6. **10-band equalizer + presets**, ReplayGain loudness normalization.
7. **Mini player / picture-in-picture**, a small always-on-top window.
8. **Video screenshots, frame stepping** (, / .).

Novel / fun:
9. **Floating desktop lyrics** (transparent, always on top, can be locked click-through).
10. **Dynamic theme from the cover**: the cover's main color as the accent and background gradient.
11. **Karaoke word-by-word highlight**: from enhanced LRC and the model's word timestamps.
12. **Lyrics share cards**: pick a few lines + the cover to make a nice image.
13. **Crossfade / gapless playback** between songs.
14. **Traditional/Simplified conversion of lyrics, bilingual (original + translation) display**.
15. **Listening stats**: play counts and time recorded locally, with a small monthly report.

---

## 6. Risks and mitigations
- WKWebView and custom streams: a local HTTP server instead of a custom scheme; Remux remuxes the whole file in the background and then switches to Direct for precise seeking.
- Whisper's limited accuracy on singing: vocal separation + VAD + hallucination filtering + a clear note that it may contain errors + proofreading in the editor.
- Licenses: ffmpeg as an LGPL build called as a sidecar; whisper.cpp and the model weights are MIT.
- Windows later: WebView2 decodes different formats → routing driven by the frontend's reported capabilities covers it; `souvlaki` and hardware encoder fallbacks are already planned.

---

## 7. Verification (during implementation)
- Rust unit tests: folder scan filtering and natural sort, extension classes, GBK/UTF-8 lyrics decoding, ffprobe JSON fixtures → routing decisions, frame rate parsing, Range header parsing, hallucination filtering.
- Integration tests: in CI, ffmpeg generates sine-wave mp3/flac/ape and mkv/avi test clips to check each strategy outputs a playable stream.
- Frontend Vitest: LRC parse/serialize round trips, play mode queues (no repeats within a shuffle round, previous-song history), finding the current lyric line, virtual timeline conversions.
- UI: Playwright on the Vite dev page (mock IPC) covering shortcuts, progress dragging and the lyrics editor's tapping flow.
- Manual checklist (run `pnpm tauri dev` on a Mac): go through requirements 1–11 and the waveform.

---

## 9. Implementation status (v0.1.0)

| Item | Status | Notes |
|---|---|---|
| Requirements 1–7, 10 | ✅ Done | See the feature table in the README |
| Requirement 8 lyrics page / upload / tapping | ✅ Done | Tapping, line editing, preview, saving next to the song / to the app's lyrics library / export |
| Requirement 9 lyrics recognition by model | ✅ Done | whisper.cpp (Metal) + Silero VAD + vocal band boost + hallucination filtering + Traditional-to-Simplified + word timings; a real speech smoke test runs in macOS CI |
| Requirement 11 light/dark / accent color / background image | ✅ Done | Plus "color from cover" |
| Lyrics page waveform | Removed (1.0.1) | The Web Audio chain was dropped so that seeking takes effect immediately |
| Every-format playback | ✅ Done | Direct / audio conversion cache / HLS remux / HLS hardware transcoding + virtual timeline |
| Extras: speed, A-B loop, sleep timer, resume playback | ✅ Done | |
| Extras: external/embedded subtitles, AI-generated video subtitles | ✅ Done | Text subtitles only (PGS/VobSub picture subtitles not yet supported) |
| Extras: cover colors, karaoke word highlight, screenshots, frame stepping, media keys/Control Center | ✅ Done | |
| Extras: equalizer, mini player/PiP, desktop lyrics, share cards, crossfade, listening stats | ⏳ Not done | Later iterations |
| Deep-learning vocal separation (Demucs/MDX) | ⏳ Not done | For now an ffmpeg filter boosts the vocal band |
| Apple notarization | ⏳ Needs a developer account | CI uses ad-hoc signing for now |

### Verified
- Rust: unit tests for routing decisions, ffprobe parsing, Range, lyrics lookup and GBK decoding, post-processing and more; integration tests for audio conversion, HLS remuxing/transcoding and the HTTP server with ffmpeg on the machine.
- Frontend: Vitest unit tests for LRC/SRT parsing and serializing, the play queue, colors, formatting and more.
- The real Tauri app (Linux WebKitGTK + Xvfb) end to end: opening a WMA from the command line (live conversion), the same-folder playlist, same-name lyrics in sync, MKV remux + external subtitles, AVI live transcoding, seeking beyond what has been generated, tapping and saving an .lrc, the recognition model dialog.
- GitHub Actions: builds the macOS arm64 .app / .dmg.

### v0.1.1 fixes (feedback round 2)
- Black screen in full-screen video: in immersive mode the grid had only `main` left as a child, placed in a 0-height first row; fixed. Full screen became immersive viewing (title/control bars hide, a dark floating control bar, single-click pause no longer clashes with double-click full screen, state synced with the green button / the system leaving full screen).
- Single click on a playlist item plays it; the playlist can be folded (state saved; when folded a "List" handle shows at the right edge).
- The macOS traffic lights moved down (`trafficLightPosition`) to line up with the title bar buttons.
- Hovering playback bar and other buttons for 1 s shows a hint with the feature and shortcut (custom hints instead of the system title).
- The waveform became low mirrored bars across the whole playback bar (at most about 52 px tall).
- The highlighted lyric is strictly centered; clicking a lyric highlights it at once with a quick 280 ms scroll; an Aa font size menu (14–56 px) and ⌘+/⌘−/⌘0.
- The ±15 s buttons became circular arrow icons with the number in the middle.

### v0.2.0 library (feedback round 3)
- Library: backend in `src-tauri/src/library/` (`library.json` written atomically; incremental scanning with 4 threads, reusing entries whose `mtime` and `size` are unchanged; records of offline roots kept; an exclusion list).
- Thumbnails: a `/thumb` route on the local server makes thumbnails from the embedded cover, a folder cover or a frame at 10% of a video, scaled by ffmpeg and cached as JPEG, at most 3 at a time.
- Frontend: the library page (songs, albums, artists, videos, favorites, recently played, playlists), virtual scrolling lists, context menus, folder management, drag in to add; playing from the library makes the current view the queue, and the playlist shows where it came from.
- UI text no longer uses "·", checked by the unit test `src/__tests__/no-middle-dot.test.ts`.

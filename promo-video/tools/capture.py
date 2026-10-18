"""Captures the promo's footage from the real app.

Start the app's browser preview first (repo root: `pnpm dev --port 5173`), then:

    python3 tools/capture.py            # → footage/*.png + footage/rects.json

The preview runs on its built-in mock. This script swaps the mock's placeholder songs for the
promo's made-up ones (names, covers, lyrics) as the page loads; nothing in the app's source changes.
Screens are taken at 2× so the camera can close in. The progress slider and its times are hidden:
the film draws the progress line itself, and rects.json says where it sits.
"""
import asyncio, datetime, json, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "footage")
URL = "http://localhost:5173/"
W, H, DPR = 1280, 800, 2

SONGS = [
    ("夏夜微光", "林间", "夏夜"), ("海边的信", "南风", "潮汐"), ("慢慢来", "白昼", "慢慢来"),
    ("向光而行", "星野", "向光"), ("晚安城市", "林间", "夏夜"), ("第七个春天", "雾岛", "春天"),
    ("山间小屋", "青木", "山间小屋"), ("雨后", "空山", "雨后"), ("远行", "鹿鸣", "远行"),
    ("旧时光", "北岸", "旧时光"), ("蓝色星球", "云端", "蓝色星球"), ("落日飞行", "风铃", "落日飞行"),
    ("风吹过的街", "南风", "潮汐"), ("漫游", "星野", "向光"), ("白日梦", "雾岛", "春天"),
    ("月光邮局", "青木", "山间小屋"), ("小城故事多", "北岸", "旧时光"), ("云上的鲸", "云端", "蓝色星球"),
    ("一起去看海", "南风", "潮汐"), ("橘子汽水", "白昼", "慢慢来"), ("星期天", "鹿鸣", "远行"),
    ("长夜", "空山", "雨后"), ("灯火", "风铃", "落日飞行"), ("纸飞机", "星野", "向光"),
    ("晴天日记", "白昼", "慢慢来"), ("北方的雪", "北岸", "旧时光"), ("花开的声音", "雾岛", "春天"),
    ("夜航", "云端", "蓝色星球"), ("回声", "空山", "雨后"), ("晚风", "林间", "夏夜"),
]
LRC = "\n".join(f"[00:{i * 6:02d}.00]{l}" for i, l in enumerate([
    "晚风经过窗台", "把灯光吹成海", "你说慢一点也没关系", "我们还有整个夏天",
    "星星落在耳边", "旋律替我说完", "那些没讲出口的想念", "都在这首歌里面"]))

INIT = """
(() => {
  const S = %s, C = %s;
  const byId = new Map();
  window.__PROMO_SONGS = (seed, n) => Array.from({ length: n }, (_, i) => {
    const k = (seed.length * 7 + i) %% S.length, s = S[seed.startsWith('推荐') ? i %% S.length : k];
    const id = 4200000 + (seed.startsWith('推荐') ? i : 100 + k);
    const song = { id, name: s[0], artists: [s[1]], album: s[2], cover: C[(seed.startsWith('推荐') ? i : k) %% C.length],
      duration: 192 + ((i * 37) %% 110), vip: false, unavailable: false };
    byId.set(id, song); return song;
  });
  window.__PROMO_META = (id, cover) => { const s = byId.get(id); return s
    ? { title: s.name, artist: s.artists[0], cover: cover ?? s.cover, name: s.artists[0] + ' - ' + s.name }
    : { title: '夏夜微光', artist: '林间', cover, name: '林间 - 夏夜微光' }; };
  window.__PROMO_LRC = %s;
  // a local library: the same songs as files in many formats, with their covers
  const EXT = ['flac', 'ape', 'm4a', 'wav', 'mp3', 'dsf', 'ogg', 'wma', 'aiff', 'opus'];
  const LIB = S.slice(0, 24).map((s, i) => ({ path: `/Users/demo/Music/${s[1]} - ${s[0]}.${EXT[i %% EXT.length]}`, kind: 'audio',
    size: 31457280 + i * 1048576, mtime: 0, title: s[0], artist: s[1], album: s[2], albumArtist: s[1], trackNo: 1 + (i %% 9),
    year: 2024, duration: 192 + ((i * 37) %% 110), source: 'added', addedAt: 1760000000 - i * 3600, playCount: 3 + (i %% 5), lastPlayed: null }));
  window.__PROMO_LIB = LIB;
  const thumbs = new Map(LIB.map((t, i) => [t.path, C[i %% C.length]]));
  window.__PROMO_THUMB = p => thumbs.get(p) ?? null;
  localStorage.setItem('lightplayer-settings', JSON.stringify({ state: Object.assign({ language: 'zh-Hans',
    netease: { enabled: true, quality: 'lossless' }, playlistOpen: false, volume: 0.8 }, window.__PROMO_SETTINGS || {}), version: 99 }));
  if (window.__PROMO_LAYOUT) localStorage.setItem('lightplayer-layouts', JSON.stringify({ state: { custom: [], active: window.__PROMO_LAYOUT }, version: 1 }));
})();
"""

# Against the module as Vite serves it (TypeScript already stripped).
PATCHES = [
    ("let mockNetease = false;", "let mockNetease = true;"),
    ("const mockSongs = (seed, n) =>", "const mockSongs = (seed, n) => window.__PROMO_SONGS(seed, n);\nconst __oldMockSongs = (seed, n) =>"),
    ("fileName: `歌手${id % 7} - 歌曲${id}`,", "fileName: window.__PROMO_META(id, null).name,"),
    ("name: `歌手${id % 7} - 歌曲${id}`,", "name: window.__PROMO_META(id, null).name,"),
    ("meta: { title: `歌曲${id}`, artist: `歌手${id % 7}`, cover: cloudCovers.get(path) ?? null },",
     "meta: (({ title, artist, cover }) => ({ title, artist, cover }))(window.__PROMO_META(id, cloudCovers.get(path) ?? null)),"),
    ('name: "预览用户喜欢的音乐"', 'name: "我喜欢的音乐"'),
    ('nickname: "预览用户"', 'nickname: "听歌的人"'),
    ('"副歌一出来眼泪就下来了[大哭]"', '"副歌一出来眼泪就下来了"'),
    ('case "find_lyrics": {',
     'case "find_lyrics": { if (String(path).startsWith("netease:")) return { content: window.__PROMO_LRC, origin: "online", format: "lrc", path: null };'),
    ("tracks: [], favorites: []", "tracks: window.__PROMO_LIB || [], favorites: []"),
    ("if (!isTauri || serverBaseCache === null) return null;", "if (!isTauri || serverBaseCache === null) return window.__PROMO_THUMB ? window.__PROMO_THUMB(path) : null;"),
    # the weather the sky shots ask for
    ("code: 2,", "code: window.__PROMO_WX?.code ?? 2,"),
    ("isDay: true,", "isDay: window.__PROMO_WX?.isDay ?? true,"),
    ("precipitation: 0,", "precipitation: window.__PROMO_WX?.precipitation ?? 0,"),
    ("cloudCover: 55,", "cloudCover: window.__PROMO_WX?.cloudCover ?? 55,"),
]
SKY_ONLY = ("body * { visibility: hidden !important; } .weather-sky, .weather-canvas, .weather-dim { visibility: visible !important; }"
            " .weather-dim { opacity: 0 !important; }")
SKIES = {  # name: (hour, minute, weather)
    "sky-dusk": (17, 40, {"code": 2, "isDay": True, "precipitation": 0, "cloudCover": 55}),
    "sky-rain": (14, 10, {"code": 63, "isDay": True, "precipitation": 3.2, "cloudCover": 96}),
    "sky-snow": (9, 30, {"code": 73, "isDay": True, "precipitation": 1.4, "cloudCover": 90}),
    "sky-night": (22, 40, {"code": 0, "isDay": False, "precipitation": 0, "cloudCover": 4}),
}

HIDE_PROGRESS = ".transport .progress-row > * { visibility: hidden !important; }"
NO_TIPS = "[role=tooltip], .tooltip, .tip, .toasts { display: none !important; } * { caret-color: transparent !important; }"


async def patch(route):
    r = await route.fetch()
    body = await r.text()
    for a, b in PATCHES:
        if a not in body:
            print("mock patch no longer applies:", a[:60])
        body = body.replace(a, b)
    await route.fulfill(response=r, body=body)


async def page(browser, settings=None, layout=None, clock=None, wx=None, size=(W, H, DPR)):
    ctx = await browser.new_context(viewport={"width": size[0], "height": size[1]}, device_scale_factor=size[2], locale="zh-CN")
    pg = await ctx.new_page()
    pg.set_default_timeout(8000)
    if clock:
        await pg.clock.install(time=clock)
    await pg.route("**/src/lib/ipc.ts*", patch)
    pre = ""
    if settings:
        pre += f"window.__PROMO_SETTINGS = {json.dumps(settings)};"
    if layout:
        pre += f"window.__PROMO_LAYOUT = {json.dumps(layout)};"
    if wx:
        pre += f"window.__PROMO_WX = {json.dumps(wx)};"
    await pg.add_init_script(pre + INIT % (json.dumps(SONGS, ensure_ascii=False), COVERS, json.dumps(LRC, ensure_ascii=False)))
    pg.on("pageerror", lambda e: print("pageerror:", e))
    await pg.goto(URL)
    await pg.wait_for_timeout(1800)
    await pg.add_style_tag(content=NO_TIPS)
    return pg


async def rect(pg, sel, nth=0):
    loc = pg.locator(sel).nth(nth)
    b = await loc.bounding_box()
    return None if b is None else {k: round(v, 1) for k, v in b.items()}


async def play_daily(pg, row=0):
    await pg.get_by_text("每日推荐", exact=True).click()
    await pg.wait_for_timeout(900)
    await pg.locator(".tt-row").filter(has_text=SONGS[row][0]).first.dblclick()
    await pg.wait_for_timeout(1500)
    print("  paused:", await pg.evaluate("[...document.querySelectorAll('audio,video')].map(m => m.paused)"))
    if await pg.evaluate("[...document.querySelectorAll('audio,video')].every(m => m.paused)"):
        await pg.locator(".transport .play-btn").click()
        await pg.wait_for_timeout(1200)
        print("  after play:", await pg.evaluate("[...document.querySelectorAll('audio,video')].map(m => m.paused)"))
    await pg.mouse.move(640, 400)
    await pg.locator(".transport").first.hover()
    await pg.mouse.move(5, 5)
    await pg.wait_for_timeout(500)


async def shot(pg, name):
    await pg.mouse.move(-10, -10)
    await pg.wait_for_timeout(400)
    await pg.screenshot(path=os.path.join(OUT, name + ".png"))
    print("shot", name)


async def main():
    global COVERS
    COVERS = open(os.path.join(OUT, "covers.json")).read()
    rects = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])

        # 1. the NetEase daily list, a song playing; then liked; then the comments open
        pg = await page(b)
        await play_daily(pg)
        await pg.add_style_tag(content=HIDE_PROGRESS)
        rects["track"] = await rect(pg, ".transport .progress-row .slider")
        rects["heart"] = await rect(pg, ".transport .fav")
        rects["comment"] = await rect(pg, ".transport .cm-toggle")
        rects["daily"] = await rect(pg, "text=每日推荐", 0)
        rects["liked"] = await rect(pg, "text=我喜欢的音乐", 0)
        rects["quality"] = await rect(pg, "text=无损", 0)
        rects["play"] = await rect(pg, ".transport .play-btn", 0)
        rects["row0"] = await rect(pg, ".tt-row", 0)
        await shot(pg, "daily-a")
        await pg.locator(".transport .fav").click()
        await pg.wait_for_timeout(900)
        await shot(pg, "daily-b")
        await pg.keyboard.press("c")
        await pg.wait_for_timeout(1400)
        rects["comments"] = await rect(pg, "aside.comments", 0)
        await shot(pg, "daily-c")
        await pg.close()

        # 2. the local library: songs in many formats, then the album wall
        pg = await page(b)
        await play_daily(pg)
        await pg.add_style_tag(content=HIDE_PROGRESS)
        await pg.locator(".sidebar, nav, aside").get_by_text("歌曲", exact=True).first.click()
        await pg.wait_for_timeout(1200)
        rects["navAlbums"] = await rect(pg, "text=专辑", 0)
        await shot(pg, "lib-songs")
        await pg.get_by_text("专辑", exact=True).first.click()
        await pg.wait_for_timeout(1500)
        await shot(pg, "lib-albums")
        await pg.close()

        # 3. the vinyl player page
        pg = await page(b, layout="vinyl")
        await play_daily(pg)
        await pg.add_style_tag(content=HIDE_PROGRESS)
        await pg.locator(".transport .mini .thumb").first.click()
        await pg.wait_for_timeout(1500)
        rects["vinylDisc"] = await rect(pg, "[data-lp=vinyl]", 0)
        await shot(pg, "vinyl")
        await pg.close()

        # 4. a second computer: the same song, dark theme
        pg = await page(b, settings={"theme": "dark"})
        await play_daily(pg)
        await pg.add_style_tag(content=HIDE_PROGRESS)
        await pg.locator(".transport .mini .thumb").first.click()
        await pg.wait_for_timeout(1500)
        await shot(pg, "dark")
        await pg.close()

        # 5. skies alone, full frame: the weather theme's own drawing with the UI hidden
        for name, (hh, mm, wx) in SKIES.items():
            when = datetime.datetime.now().replace(hour=hh, minute=mm, second=0, microsecond=0)
            pg = await page(b, settings={"theme": "weather"}, clock=when, wx=wx, size=(1920, 1080, 1))
            await pg.add_style_tag(content=SKY_ONLY)
            await pg.wait_for_timeout(3500)
            await shot(pg, name)
            await pg.close()
        await b.close()
    rects["viewport"] = {"w": W, "h": H, "dpr": DPR}
    json.dump(rects, open(os.path.join(OUT, "rects.json"), "w"), indent=1)
    print(json.dumps(rects))


asyncio.run(main())

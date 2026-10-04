// Media library: folders scanned recursively, played / dropped files,
// favourites and user playlists, browsed by song, album, artist or video.

import { useEffect, useMemo, useState } from "react";
import * as C from "../core/controller";
import {
  deletePlaylist,
  importFolderAsPlaylist,
  newPlaylist,
  openAlbumMenu,
  openTrackMenu,
  playTracks,
  renamePlaylist,
  shuffleTracks,
} from "../core/library/actions";
import { derive, filterTracks, playlistTracks, UNKNOWN_ALBUM, UNKNOWN_ARTIST, type Album, type Artist } from "../core/library/views";
import { Icon, type IconName } from "../components/Icon";
import { Thumb, TrackTable } from "../components/TrackTable";
import { tip } from "../components/Tooltip";
import { formatTime, stem } from "../lib/format";
import { type LibraryTrack } from "../lib/ipc";
import { useLibrary, type LibraryNav } from "../stores/library";
import { loadNeteaseList, refreshNetease, searchNetease, useNetease } from "../stores/netease";
import { usePlayer, useUI } from "../stores/player";
import { useSettings } from "../stores/settings";

const NAV: { view: "songs" | "albums" | "artists" | "videos" | "favorites" | "recent"; label: string; icon: IconName }[] = [
  { view: "songs", label: "歌曲", icon: "music" },
  { view: "albums", label: "专辑", icon: "album" },
  { view: "artists", label: "艺术家", icon: "user" },
  { view: "videos", label: "视频", icon: "film" },
  { view: "favorites", label: "收藏", icon: "heart" },
  { view: "recent", label: "最近播放", icon: "clock" },
];

const go = (nav: LibraryNav) => useLibrary.setState({ nav, query: "" });

function totalDuration(tracks: LibraryTrack[]) {
  const s = tracks.reduce((a, t) => a + (t.duration ?? 0), 0);
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

/** Joins the non-empty parts of a subtitle with Chinese commas. */
const parts = (...xs: (string | number | false | null | undefined)[]) => xs.filter(Boolean).join("，");

/** A video keeps playing behind the library; this is the way back to it. */
function NowPlayingVideo() {
  const media = usePlayer((s) => (s.media?.kind === "video" ? s.media : null));
  const playing = usePlayer((s) => s.playing);
  if (!media) return null;
  return (
    <button className="lib-now-video" onClick={() => useUI.setState({ page: "player" })} {...tip("返回视频播放页", "⌘L")}>
      <Icon name="film" size={17} />
      <span className="grow">
        <span className="k">{playing ? "正在播放视频" : "视频已暂停"}</span>
        <span className="n">{media.meta?.title || media.name}</span>
      </span>
      <Icon name="chevronRight" size={15} />
    </button>
  );
}

function Sidebar() {
  const nav = useLibrary((s) => s.nav);
  const playlists = useLibrary((s) => s.data.playlists);
  const progress = useLibrary((s) => s.progress);
  const active = (v: string) =>
    nav.view === v || (nav.view === "album" && nav.from === v) || (nav.view === "artist" && v === "artists");
  return (
    <aside className="lib-side">
      <NowPlayingVideo />
      <div className="lib-nav">
        {NAV.map((n) => (
          <button key={n.view} className={`lib-link ${active(n.view) ? "on" : ""}`} onClick={() => go({ view: n.view })}>
            <Icon name={n.icon} size={17} />
            {n.label}
          </button>
        ))}
      </div>
      <div className="lib-group">
        <span>歌单</span>
        <div className="acts">
          <button className="icon-btn small" onClick={() => void importFolderAsPlaylist().then((id) => id && go({ view: "playlist", id }))} {...tip("导入文件夹为歌单")}>
            <Icon name="folderPlus" size={16} />
          </button>
          <button className="icon-btn small" onClick={() => void newPlaylist().then((id) => id && go({ view: "playlist", id }))} {...tip("新建歌单")}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>
      <div className="lib-nav lib-playlists">
        {playlists.map((p) => (
          <button
            key={p.id}
            className={`lib-link ${nav.view === "playlist" && nav.id === p.id ? "on" : ""}`}
            onClick={() => go({ view: "playlist", id: p.id })}
          >
            <Icon name="playlist" size={17} />
            <span className="ell">{p.name}</span>
            <span className="n">{p.items.length}</span>
          </button>
        ))}
        {!playlists.length && (
          <div className="lib-hint">
            还没有歌单。
            <button className="link" onClick={() => void importFolderAsPlaylist().then((id) => id && go({ view: "playlist", id }))}>
              导入文件夹为歌单
            </button>
          </div>
        )}
      </div>
      <NeteaseSidebar />
      <div className="lib-side-foot">
        {progress && (
          <div className="lib-scan">
            <div className="row">
              <span>正在扫描</span>
              <span>
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="progress-bar">
              <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        <button className="lib-link" onClick={() => useUI.setState({ overlay: "libraryFolders" })}>
          <Icon name="folder" size={17} />
          管理文件夹
        </button>
      </div>
    </aside>
  );
}

/** The experimental NetEase Cloud Music section of the sidebar. */
function NeteaseSidebar() {
  const enabled = useSettings((s) => s.netease.enabled);
  const account = useNetease((s) => s.account);
  const playlists = useNetease((s) => s.playlists);
  const nav = useLibrary((s) => s.nav);
  useEffect(() => {
    if (enabled && account === undefined) void refreshNetease();
  }, [enabled, account]);
  if (!enabled) return null;
  const on = (list: string) => (nav.view === "netease" && nav.list === list ? "on" : "");
  return (
    <>
      <div className="lib-group">
        <span>
          网易云音乐 <em className="ne-exp">试验</em>
        </span>
        {account && (
          <div className="acts">
            <button className="icon-btn small" onClick={() => void refreshNetease()} {...tip("刷新歌单")}>
              <Icon name="refresh" size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="lib-nav lib-playlists ne-side">
        {account === null && (
          <div className="lib-hint">
            登录后可以播放你的歌单和每日推荐。
            <button className="link" onClick={() => useUI.setState({ overlay: "neteaseLogin" })}>
              登录
            </button>
          </div>
        )}
        {account && (
          <>
            <button className={`lib-link ${on("daily")}`} onClick={() => go({ view: "netease", list: "daily" })}>
              <Icon name="sun" size={17} />
              每日推荐
            </button>
            <button className={`lib-link ${on("search")}`} onClick={() => go({ view: "netease", list: "search" })}>
              <Icon name="search" size={17} />
              搜索
            </button>
            {playlists.map((p) => (
              <button key={p.id} className={`lib-link ${on(`pl:${p.id}`)}`} onClick={() => go({ view: "netease", list: `pl:${p.id}` })}>
                <Icon name={p.liked ? "heart" : "playlist"} size={17} />
                <span className="ell">{p.liked ? "我喜欢的音乐" : p.name}</span>
                <span className="n">{p.count}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function Header({
  title,
  sub,
  tracks,
  source,
  back,
  extra,
  search = true,
}: {
  title: string;
  sub?: string;
  tracks: LibraryTrack[];
  source: string;
  back?: () => void;
  extra?: React.ReactNode;
  search?: boolean;
}) {
  const query = useLibrary((s) => s.query);
  return (
    <div className="lib-head">
      <div className="lib-title">
        {back && (
          <button className="icon-btn" onClick={back} {...tip("返回")}>
            <Icon name="chevronLeft" />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      <div className="lib-actions">
        {search && (
          <div className="search">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="搜索标题、艺术家、专辑"
              value={query}
              onChange={(e) => useLibrary.setState({ query: e.target.value })}
            />
          </div>
        )}
        {extra}
        <button className="btn primary" disabled={!tracks.length} onClick={() => playTracks(tracks, 0, source)}>
          <Icon name="play" size={15} /> 播放全部
        </button>
        <button className="btn" disabled={!tracks.length} onClick={() => shuffleTracks(tracks, source)}>
          <Icon name="shuffle" size={15} /> 随机播放
        </button>
      </div>
    </div>
  );
}

function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="lib-empty">
      <div className="ico">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

const addFolderBtn = (
  <button className="btn primary" onClick={() => void C.addLibraryFolderWithDialog()}>
    <Icon name="folderPlus" size={16} /> 添加文件夹
  </button>
);

function SongsView({ tracks, title, source, empty }: { tracks: LibraryTrack[]; title: string; source: string; empty: React.ReactNode }) {
  const query = useLibrary((s) => s.query);
  const shown = useMemo(() => filterTracks(tracks, query), [tracks, query]);
  return (
    <>
      <Header title={title} sub={parts(`${shown.length} 首`, totalDuration(shown))} tracks={shown} source={source} />
      {!tracks.length ? empty : shown.length ? <TrackTable tracks={shown} source={query ? `搜索“${query}”` : source} /> : <NoMatch />}
    </>
  );
}

function NoMatch() {
  return <Empty icon="search" title="没有找到匹配的结果" text="换个关键词试试" />;
}

function AlbumCard({ a, onOpen }: { a: Album; onOpen: () => void }) {
  return (
    <div className="lib-card" onClick={onOpen} onContextMenu={(e) => openAlbumMenu(e, a, onOpen)}>
      <div className="art">
        <Thumb path={a.tracks[0].path} size={256} icon="album" />
        <button
          className="card-play"
          onClick={(e) => {
            e.stopPropagation();
            playTracks(a.tracks, 0, `专辑《${a.title}》`);
          }}
          {...tip("播放专辑")}
        >
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="name" data-tip={a.title}>
        {a.title}
      </div>
      <div className="meta">{a.artist || `${a.tracks.length} 首`}</div>
    </div>
  );
}

function AlbumsView({ albums }: { albums: Album[] }) {
  const query = useLibrary((s) => s.query).trim().toLowerCase();
  const shown = useMemo(
    () => (query ? albums.filter((a) => `${a.title} ${a.artist}`.toLowerCase().includes(query)) : albums),
    [albums, query],
  );
  const tracks = useMemo(() => shown.flatMap((a) => a.tracks), [shown]);
  return (
    <>
      <Header title="专辑" sub={`${shown.length} 张专辑`} tracks={tracks} source="全部专辑" />
      {!albums.length ? (
        <Empty icon="album" title="还没有专辑" text="添加含有音乐的文件夹后，会按专辑标签自动归类" action={addFolderBtn} />
      ) : shown.length ? (
        <div className="lib-grid">
          {shown.map((a) => (
            <AlbumCard key={a.key} a={a} onOpen={() => go({ view: "album", key: a.key, from: "albums" })} />
          ))}
        </div>
      ) : (
        <NoMatch />
      )}
    </>
  );
}

function AlbumDetail({ album, from }: { album: Album | undefined; from: "albums" | "artists" }) {
  const back = () => {
    if (from === "artists" && album) go({ view: "artist", name: album.artist || UNKNOWN_ARTIST });
    else go({ view: "albums" });
  };
  if (!album) return <Empty icon="album" title="专辑不存在" text="它可能已经从媒体库中移除" />;
  const source = `专辑《${album.title}》`;
  const sub = parts(album.artist, album.year && `${album.year} 年`, `${album.tracks.length} 首`, totalDuration(album.tracks));
  return (
    <>
      <div className="lib-hero">
        <button className="icon-btn back" onClick={back} {...tip("返回")}>
          <Icon name="chevronLeft" />
        </button>
        <Thumb path={album.tracks[0].path} size={256} icon="album" className="hero-art" />
        <div className="hero-info">
          <div className="kind">专辑</div>
          <h1>{album.title}</h1>
          <div className="sub">{sub}</div>
          <div className="lib-actions">
            <button className="btn primary" onClick={() => playTracks(album.tracks, 0, source)}>
              <Icon name="play" size={15} /> 播放全部
            </button>
            <button className="btn" onClick={() => shuffleTracks(album.tracks, source)}>
              <Icon name="shuffle" size={15} /> 随机播放
            </button>
            <button className="icon-btn" onClick={(e) => openAlbumMenu(e, album, () => {})} {...tip("更多：移除专辑、移到废纸篓等")}>
              <Icon name="more" />
            </button>
          </div>
        </div>
      </div>
      <TrackTable tracks={album.tracks} source={source} hideAlbum sortable={false} numbered="track" />
    </>
  );
}

function initial(name: string) {
  const ch = [...name.trim()][0] ?? "?";
  return ch.toUpperCase();
}

function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) % 360;
  return h;
}

function ArtistsView({ artists }: { artists: Artist[] }) {
  const query = useLibrary((s) => s.query).trim().toLowerCase();
  const shown = useMemo(() => (query ? artists.filter((a) => a.name.toLowerCase().includes(query)) : artists), [artists, query]);
  const tracks = useMemo(() => shown.flatMap((a) => a.tracks), [shown]);
  return (
    <>
      <Header title="艺术家" sub={`${shown.length} 位艺术家`} tracks={tracks} source="全部艺术家" />
      {!artists.length ? (
        <Empty icon="user" title="还没有艺术家" text="添加含有音乐的文件夹后，会按艺术家标签自动归类" action={addFolderBtn} />
      ) : shown.length ? (
        <div className="lib-grid artists">
          {shown.map((a) => (
            <div key={a.name} className="lib-card artist" onClick={() => go({ view: "artist", name: a.name })}>
              <div className="avatar" style={{ "--h": hue(a.name) } as React.CSSProperties}>
                {a.name === UNKNOWN_ARTIST ? <Icon name="user" size={15} /> : initial(a.name)}
              </div>
              <div className="name" data-tip={a.name}>
                {a.name}
              </div>
              <div className="meta">
                {a.albums.filter((x) => x.title !== UNKNOWN_ALBUM).length} 张专辑，{a.tracks.length} 首
              </div>
            </div>
          ))}
        </div>
      ) : (
        <NoMatch />
      )}
    </>
  );
}

function ArtistDetail({ artist }: { artist: Artist | undefined }) {
  const query = useLibrary((s) => s.query);
  const shown = useMemo(() => (artist ? filterTracks(artist.tracks, query) : []), [artist, query]);
  if (!artist) return <Empty icon="user" title="艺术家不存在" text="可能已经从媒体库中移除" />;
  const source = `艺术家 ${artist.name}`;
  const albums = artist.albums.filter((a) => a.title !== UNKNOWN_ALBUM);
  return (
    <>
      <Header
        title={artist.name}
        sub={parts(`${albums.length} 张专辑`, `${artist.tracks.length} 首`, totalDuration(artist.tracks))}
        tracks={shown}
        source={source}
        back={() => go({ view: "artists" })}
      />
      <div className="lib-scroll">
        {albums.length > 0 && !query && (
          <div className="lib-grid compact">
            {albums.map((a) => (
              <AlbumCard key={a.key} a={a} onOpen={() => go({ view: "album", key: a.key, from: "artists" })} />
            ))}
          </div>
        )}
      </div>
      <TrackTable tracks={shown} source={source} />
    </>
  );
}

function VideosView({ videos }: { videos: LibraryTrack[] }) {
  const query = useLibrary((s) => s.query);
  const shown = useMemo(() => filterTracks(videos, query), [videos, query]);
  const current = usePlayer((s) => s.media?.path);
  const source = query ? `搜索“${query}”` : "全部视频";
  return (
    <>
      <Header title="视频" sub={parts(`${shown.length} 个视频`, totalDuration(shown))} tracks={shown} source={source} />
      {!videos.length ? (
        <Empty icon="film" title="还没有视频" text="添加含有视频的文件夹，或把视频拖到这里" action={addFolderBtn} />
      ) : shown.length ? (
        <div className="lib-grid videos">
          {shown.map((v, i) => (
            <div
              key={v.path}
              className={`lib-card video ${v.path === current ? "current" : ""}`}
              onClick={() => playTracks(shown, i, source)}
              onContextMenu={(e) => openTrackMenu(e, v, { queue: shown, source })}
            >
              <div className="art wide">
                <Thumb path={v.path} size={256} icon="film" />
                {v.duration ? <span className="badge-dur">{formatTime(v.duration)}</span> : null}
              </div>
              <div className="name" data-tip={stem(v.path)}>
                {v.title || stem(v.path)}
              </div>
              <div className="meta">{v.width && v.height ? `${v.width} × ${v.height}` : "分辨率未知"}</div>
            </div>
          ))}
        </div>
      ) : (
        <NoMatch />
      )}
    </>
  );
}

/** A NetEase list: daily recommendations, search results or a playlist. */
function NeteaseView({ list }: { list: string }) {
  const entry = useNetease((s) => s.lists[list]);
  const playlists = useNetease((s) => s.playlists);
  const account = useNetease((s) => s.account);
  const searched = useNetease((s) => s.searchQuery);
  const query = useLibrary((s) => s.query);
  const [input, setInput] = useState(searched);
  const isSearch = list === "search";
  useEffect(() => {
    if (account && !isSearch) loadNeteaseList(list);
  }, [list, account, isSearch]);
  const tracks = entry?.tracks ?? [];
  const shown = useMemo(() => (isSearch ? tracks : filterTracks(tracks, query)), [tracks, query, isSearch]);
  if (account === null) {
    return (
      <Empty
        icon="music"
        title="没有登录网易云音乐"
        text="登录后可以播放你的歌单、我喜欢的音乐和每日推荐"
        action={
          <button className="btn primary" onClick={() => useUI.setState({ overlay: "neteaseLogin" })}>
            登录
          </button>
        }
      />
    );
  }
  const pl = list.startsWith("pl:") ? playlists.find((p) => `pl:${p.id}` === list) : undefined;
  const title = list === "daily" ? "每日推荐" : isSearch ? "搜索网易云音乐" : pl ? (pl.liked ? "我喜欢的音乐" : pl.name) : "歌单";
  const source = `网易云音乐 ${isSearch ? `搜索“${searched}”` : title}`;
  const searchBox = isSearch && (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        searchNetease(input);
      }}
    >
      <Icon name="search" size={15} />
      <input type="search" autoFocus placeholder="歌名、歌手、专辑，按回车搜索" value={input} onChange={(e) => setInput(e.target.value)} />
    </form>
  );
  const sub = entry?.loading ? "正在加载…" : parts(tracks.length && `${tracks.length} 首`, totalDuration(tracks));
  return (
    <>
      <Header
        title={title}
        sub={sub || undefined}
        tracks={shown.filter((t) => !t.unavailable)}
        source={source}
        search={!isSearch}
        extra={
          <>
            {searchBox}
            {!isSearch && (
              <button className="icon-btn" disabled={entry?.loading} onClick={() => loadNeteaseList(list, true)} {...tip("刷新")}>
                <Icon name="refresh" />
              </button>
            )}
          </>
        }
      />
      {entry?.error ? (
        <Empty
          icon="warning"
          title="加载失败"
          text={entry.error}
          action={
            <button className="btn" onClick={() => (isSearch ? searchNetease(searched) : loadNeteaseList(list, true))}>
              重试
            </button>
          }
        />
      ) : !tracks.length ? (
        entry?.loading ? (
          <Empty icon="music" title="正在加载…" text="" />
        ) : isSearch ? (
          <Empty icon="search" title={searched ? "没有找到相关歌曲" : "搜索网易云音乐"} text={searched ? "换个关键词试试" : "输入歌名、歌手或专辑，按回车搜索"} />
        ) : (
          <Empty icon="playlist" title="这里还没有歌曲" text="" />
        )
      ) : shown.length ? (
        <TrackTable tracks={shown} source={source} sortable={!isSearch} />
      ) : (
        <NoMatch />
      )}
    </>
  );
}

function PlaylistView({ id }: { id: string }) {
  const data = useLibrary((s) => s.data);
  const query = useLibrary((s) => s.query);
  const pl = data.playlists.find((p) => p.id === id);
  const tracks = useMemo(() => playlistTracks(data, id), [data, id]);
  const shown = useMemo(() => filterTracks(tracks, query), [tracks, query]);
  if (!pl) return <Empty icon="playlist" title="歌单不存在" text="它可能已被删除" />;
  const source = `歌单 ${pl.name}`;
  return (
    <>
      <Header
        title={pl.name}
        sub={parts(`${tracks.length} 首`, totalDuration(tracks))}
        tracks={shown}
        source={source}
        extra={
          <>
            <button className="icon-btn" onClick={() => void renamePlaylist(id)} {...tip("重命名歌单")}>
              <Icon name="edit" />
            </button>
            <button className="icon-btn" onClick={() => void deletePlaylist(id)} {...tip("删除歌单")}>
              <Icon name="trash" />
            </button>
          </>
        }
      />
      {!tracks.length ? (
        <Empty icon="playlist" title="歌单是空的" text="在歌曲上点右键，选择“添加到歌单”" />
      ) : shown.length ? (
        <TrackTable tracks={shown} source={source} playlistId={query ? undefined : id} sortable={!!query} />
      ) : (
        <NoMatch />
      )}
    </>
  );
}

export function LibraryPage() {
  const data = useLibrary((s) => s.data);
  const loaded = useLibrary((s) => s.loaded);
  const nav = useLibrary((s) => s.nav);
  const d = useMemo(() => derive(data), [data]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !useUI.getState().overlay && !document.querySelector(".popover, .ctx-menu") && t?.tagName !== "INPUT") {
        useUI.setState({ page: "player" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const libraryEmpty = loaded && !data.tracks.length;
  const emptyAll = (
    <Empty
      icon="library"
      title="媒体库还是空的"
      text="添加你的音乐或视频文件夹（会包含所有子文件夹），也可以直接把文件、文件夹拖到这里。播放过的文件也会自动记录在媒体库中。"
      action={addFolderBtn}
    />
  );

  let body: React.ReactNode;
  switch (nav.view) {
    case "songs":
      body = <SongsView tracks={d.songs} title="歌曲" source="全部歌曲" empty={emptyAll} />;
      break;
    case "favorites":
      body = (
        <SongsView
          tracks={d.favorites}
          title="收藏"
          source="我的收藏"
          empty={<Empty icon="heart" title="还没有收藏" text="点歌曲右侧的心形，或在播放栏点心形收藏正在播放的内容" />}
        />
      );
      break;
    case "recent":
      body = <SongsView tracks={d.recent} title="最近播放" source="最近播放" empty={<Empty icon="clock" title="还没有播放记录" text="播放过的歌曲和视频会出现在这里" />} />;
      break;
    case "albums":
      body = <AlbumsView albums={d.albums} />;
      break;
    case "album":
      body = <AlbumDetail album={d.albums.find((a) => a.key === nav.key)} from={nav.from} />;
      break;
    case "artists":
      body = <ArtistsView artists={d.artists} />;
      break;
    case "artist":
      body = <ArtistDetail artist={d.artists.find((a) => a.name === nav.name)} />;
      break;
    case "videos":
      body = <VideosView videos={d.videos} />;
      break;
    case "playlist":
      body = <PlaylistView id={nav.id} />;
      break;
    case "netease":
      body = <NeteaseView list={nav.list} />;
      break;
  }

  return (
    <div className="library-page">
      <Sidebar />
      <section className="lib-main panel">
        {libraryEmpty && nav.view !== "playlist" && nav.view !== "netease" ? (
          <>
            <Header title="媒体库" tracks={[]} source="" search={false} />
            {emptyAll}
          </>
        ) : (
          body
        )}
      </section>
    </div>
  );
}

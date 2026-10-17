# LightPlayer 宣传片

用 [Remotion](https://www.remotion.dev) 制作的 LightPlayer 宣传动画，1920 × 1080，30 fps，无配乐。画面文字使用简体中文。

目前有三个风格候选：

| 合成 | 风格 | 时长 | 特点 |
|---|---|---|---|
| `A-Dark` | 暗场 | 47.5 秒 | 黑色舞台，Three.js 立体图标、黑胶唱机和媒体隧道，GLSL 光束与天气天空 |
| `B-Light` | 白昼 | 约 37 秒 | 白底黑字，以排版为主，节奏明快，界面平铺展示 |
| `C-Aurora` | 流光 | 34 秒 | 全程流动的 GLSL 渐变背景，毛玻璃窗口，颜色随场景变化 |

三个版本讲的是同一组功能：几乎所有格式都能播放、滚动高亮的歌词、黑胶唱片播放页、天气主题、桌面歌词、主题色与布局自定义。

## 使用

```bash
npm i
npm run dev        # 打开 Remotion Studio 预览和调整
npm run render:a   # 渲染 暗场，输出到 out/
npm run render:b   # 渲染 白昼
npm run render:c   # 渲染 流光
```

在没有显卡的 Linux 服务器上渲染时，加上 `--gl=swangle` 使用软件 WebGL，例如：

```bash
npx remotion render A-Dark out/LightPlayer-A-Dark.mp4 --gl=swangle
```

每个场景也单独注册成了合成（`A-Scenes`、`B-Scenes`、`C-Scenes` 文件夹），可以在 Studio 中单独打开和渲染。

## 结构

```
src/
  Root.tsx              注册全部合成
  a/  b/  c/            三个风格：scenes.tsx 是各个场景，Video.tsx 把场景串成完整视频
  shared/
    ui/                 按 App 真实样式重建的界面：标题栏、播放栏、播放页、歌词页、媒体库、黑胶、桌面歌词
    three/              Three.js 物体：立体图标、黑胶唱机、媒体隧道
    gl/                 WebGL2 画布组件和 GLSL 着色器：光束、天空、雨雪、壁纸、流动渐变
    Headline.tsx        逐字浮现的大标题
    covers.ts           原创专辑封面与视频画面（SVG 绘制）
    data.ts             虚构的歌曲与歌词
```

修改标题文字：在各风格的 `scenes.tsx` 中找到对应的 `<Headline>`。所有动画都由当前帧计算，任意一帧都可以单独渲染。

## 素材

- 歌名、歌手、歌词和封面都是为这部片子原创的虚构内容。
- 字体为 Noto Sans SC 与 Inter（SIL Open Font License），通过 Fontsource 打包，渲染时不需要联网。
- 界面是按 App 的样式变量（`src/styles/app.css`）和图标（`src/components/Icon.tsx`）重建的，App 界面改版后需要同步更新 `src/shared/ui`。

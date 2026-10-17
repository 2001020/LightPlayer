# LightPlayer 宣传片

用 [Remotion](https://www.remotion.dev) 制作的 LightPlayer 宣传动画，16:9，无配乐，画面文字为简体中文。可以导出 720p 到 4K、24 到 60 帧的视频。

目前有三个风格候选：

| 合成 | 风格 | 时长 | 特点 |
|---|---|---|---|
| `A-Dark` | 暗场 | 47.5 秒 | 黑色舞台，Three.js 立体图标、黑胶唱机和媒体隧道，GLSL 光束与天气天空 |
| `B-Light` | 白昼 | 约 37 秒 | 白底黑字，以排版为主，节奏明快，界面平铺展示 |
| `C-Aurora` | 流光 | 34 秒 | 全程流动的 GLSL 渐变背景，毛玻璃窗口，颜色随场景变化 |

三个版本讲的是同一组功能：几乎所有格式都能播放、滚动高亮的歌词、黑胶唱片播放页、天气主题、桌面歌词、主题色与布局自定义。

## 文字编辑器

需要先安装 [Node.js](https://nodejs.org) 20 或更新版本。

- macOS：双击 `打开编辑器.command`
- Windows：双击 `打开编辑器.bat`
- 或在终端中运行：

  ```bash
  npm i
  npm run editor
  ```

第一次运行会先安装依赖，之后浏览器会自动打开编辑页面（`http://127.0.0.1:5180`）。编辑器只改文字，不改画面。

**编辑**

- 页面顶部切换要编辑的视频：暗场、白昼、流光。
- 右侧列出视频里的全部文字：
  - 每个场景的标题，只属于当前视频。
  - 共用内容：歌名、艺术家、歌词、专辑墙、侧栏歌单、窗口里的按钮和标签。这些在三个视频里是同一份，改一处三个视频都会变。
- 点一个输入框，左边的预览会跳到这段文字出现的位置，并用蓝框标出。边输入边看效果。
- 也可以直接点预览画面里的文字，跳到对应的输入框。
- 文字比建议的长时，画面里会自动缩小字号，保证放得下。留空则不显示。
- 每个输入框右侧的 ↺ 恢复这一项的默认文字。右上角「更多」里可以放弃未保存的修改，或把全部文字恢复默认。
- 按「保存」或 ⌘S / Ctrl+S，文字会写入 `texts.json`。

**导出**

点「导出视频」，选择：

| 选项 | 可选值 |
|---|---|
| 视频 | 暗场 / 白昼 / 流光 |
| 分辨率 | 720p、1080p、2K（1440p）、4K（2160p） |
| 帧率 | 24、25、30、50、60 帧/秒 |
| 编码 | H.264（MP4）、H.265（MP4）、ProRes 422（MOV，用于后期剪辑） |
| 画质 | 高 / 标准 |
| 画面渲染 | 显卡 / 软件 |
| 视频编码器 | 显卡编码 / 软件编码 |

- 导出前会自动保存文字。文件保存在 `out/` 文件夹，例如 `out/LightPlayer-A-Dark-2160p60.mp4`。
- 导出在本机进行。可以关掉导出窗口继续编辑，进度会显示在「导出视频」按钮上。导出期间不要关闭终端窗口。
- 动画按时间计算，任何帧率下速度都一样。60 帧导出的每一帧都是新画面，不是重复帧。
- 4K 不是放大 1080p 的画面，而是按两倍像素密度重新绘制，文字和图形同样清晰。

**显卡**

- 画面渲染：用浏览器的 WebGL 绘制每一帧。macOS 上通过 Metal，Windows 上通过 Direct3D。
  - 导出窗口里的「检测显卡是否可用」会用导出时同样的方式启动渲染浏览器，显示它实际用到的显卡型号；如果只用上了软件渲染，也会提示。
- 视频编码器：
  - macOS 使用 VideoToolbox，支持 H.264 和 H.265；ProRes 需要芯片带 ProRes 编码单元。
  - Windows 上需要 NVIDIA 显卡（NVENC）。
  - 打开导出窗口时会逐个测试显卡编码器，不可用的自动改用软件编码。导出中途显卡编码出错，也会自动改用软件编码重新导出。
- 第一次导出前，Remotion 会下载一个渲染用的浏览器（Chrome Headless Shell，约 100 MB），之后不再下载。

## 命令行

```bash
npm run dev        # 打开 Remotion Studio，可以调整画面
npm run render:a   # 用 texts.json 中的文字渲染 暗场，1080p 30 帧，输出到 out/
npm run render:b   # 渲染 白昼
npm run render:c   # 渲染 流光
```

命令行同样可以指定帧率和分辨率：`--props` 里的 `fps` 设置帧率，`--scale` 是相对 1080p 的倍数。例如 4K 60 帧：

```bash
npx remotion render A-Dark out/A-4K60.mp4 --props='{"fps":60}' --scale=2 --gl=angle
```

在没有显卡的 Linux 服务器上渲染时，改用 `--gl=swangle`（软件 WebGL）。

每个场景也单独注册成了合成（`A-Scenes`、`B-Scenes`、`C-Scenes` 文件夹），可以在 Studio 中单独打开和渲染。

## 结构

```
texts.json              视频里的全部文字（编辑器保存到这里）
打开编辑器.command/.bat   双击启动编辑器
editor/                 文字编辑器
  src/                  编辑页面：预览、文字列表、导出窗口；fields.ts 列出每段文字和它在预览中的位置
  server/               本地服务：读写 texts.json，调用 Remotion 渲染和编码
src/
  Root.tsx              注册全部合成
  videos.tsx            三个视频的场景列表，Studio 和编辑器共用
  a/  b/  c/            三个风格：scenes.tsx 是各个场景，Video.tsx 列出场景顺序和时长
  shared/
    texts.tsx           文字的结构、默认值和读取方法
    TimeScale.tsx       按导出帧率换算动画时间
    ui/                 按 App 真实样式重建的界面：标题栏、播放栏、播放页、歌词页、媒体库、黑胶、桌面歌词
    three/              Three.js 物体：立体图标、黑胶唱机、媒体隧道
    gl/                 WebGL2 画布组件和 GLSL 着色器：光束、天空、雨雪、壁纸、流动渐变
    Headline.tsx        逐字浮现的大标题
    covers.ts           原创专辑封面与视频画面（SVG 绘制）
    data.ts             歌曲的封面与时长
```

新增一段文字时：在 `src/shared/texts.tsx` 的 `DEFAULT_TEXTS` 中加一个字段，在场景中用 `useTexts()` 读取，给显示它的元素加上 `data-tk="路径"`，再在 `editor/src/fields.ts` 中登记它出现的场景和帧。所有动画都由当前帧计算，任意一帧都可以单独渲染。

## 素材

- 歌名、歌手、歌词和封面都是为这部片子原创的虚构内容。
- 字体为 Noto Sans SC 与 Inter（SIL Open Font License），通过 Fontsource 打包，渲染时不需要联网。
- 界面是按 App 的样式变量（`src/styles/app.css`）和图标（`src/components/Icon.tsx`）重建的，App 界面改版后需要同步更新 `src/shared/ui`。

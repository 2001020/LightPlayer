import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { BCustomize, BDesktop, BEnd, BIntro, BLibrary, BLyrics, BMosaic, BVinyl, BWeather } from "./scenes";

/** 白昼: 1195 frames of scenes minus 8 10-frame crossfades = 1115 frames. */
export const BLight: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#fbfbfd" }}>
    <TransitionSeries name="白昼">
      <TransitionSeries.Sequence name="听见光" durationInFrames={90}>
        <BIntro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="你的音乐 一目了然" durationInFrames={150}>
        <BLibrary />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="几乎所有格式" durationInFrames={135}>
        <BMosaic />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="每一句 都在发光" durationInFrames={165}>
        <BLyrics />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="让唱片 转起来" durationInFrames={135}>
        <BVinyl />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="天气 就是主题" durationInFrames={150}>
        <BWeather />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="歌词 浮于桌面之上" durationInFrames={120}>
        <BDesktop />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="由你定义" durationInFrames={130}>
        <BCustomize />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
      <TransitionSeries.Sequence name="结尾" durationInFrames={120}>
        <BEnd />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

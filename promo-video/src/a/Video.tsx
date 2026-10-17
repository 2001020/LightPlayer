import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { ACustomize, ADesktop, AEnd, AFormats, AHero, AIcon, ALyrics, AOpening, AVinyl, AWeather } from "./scenes";

/** 暗场: 1560 frames of scenes minus 9 15-frame crossfades = 1425 frames. */
export const ADark: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <TransitionSeries name="暗场">
      <TransitionSeries.Sequence name="听见光" durationInFrames={120}>
        <AOpening />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="图标" durationInFrames={135}>
        <AIcon />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="轻巧 也全能" durationInFrames={165}>
        <AHero />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="几乎所有格式" durationInFrames={165}>
        <AFormats />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="每一句 都在发光" durationInFrames={210}>
        <ALyrics />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="让唱片 转起来" durationInFrames={150}>
        <AVinyl />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="窗外的天气 就是主题" durationInFrames={195}>
        <AWeather />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="歌词 浮于桌面之上" durationInFrames={135}>
        <ADesktop />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="由你定义" durationInFrames={135}>
        <ACustomize />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="结尾" durationInFrames={150}>
        <AEnd />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

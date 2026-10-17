import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill } from "remotion";
import { CCustomize, CDay, CDesktop, CEnd, CHero, CLyrics, COpening, CVinyl } from "./scenes";

/** 流光: 1160 frames of scenes minus 7 20-frame crossfades = 1020 frames. */
export const CAurora: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <TransitionSeries name="流光">
      <TransitionSeries.Sequence name="听见光" durationInFrames={120}>
        <COpening />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="轻巧 也全能" durationInFrames={150}>
        <CHero />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="每一句 都在发光" durationInFrames={190}>
        <CLyrics />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="让唱片 转起来" durationInFrames={140}>
        <CVinyl />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="天色 随时间流转" durationInFrames={165}>
        <CDay />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="歌词 浮于桌面之上" durationInFrames={130}>
        <CDesktop />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="由你定义" durationInFrames={130}>
        <CCustomize />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence name="结尾" durationInFrames={135}>
        <CEnd />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

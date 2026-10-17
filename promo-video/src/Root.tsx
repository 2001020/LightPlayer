import { Composition, Folder } from "remotion";
import { ACustomize, ADesktop, AEnd, AFormats, AHero, AIcon, ALyrics, AOpening, AVinyl, AWeather } from "./a/scenes";
import { ADark } from "./a/Video";
import { BCustomize, BDesktop, BEnd, BIntro, BLibrary, BLyrics, BMosaic, BVinyl, BWeather } from "./b/scenes";
import { BLight } from "./b/Video";
import { CCustomize, CDay, CDesktop, CEnd, CHero, CLyrics, COpening, CVinyl } from "./c/scenes";
import { CAurora } from "./c/Video";
import "./shared/fonts";

// Three style candidates for the LightPlayer promo, 1920 x 1080 at 30 fps, silent.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Candidates">
        <Composition id="A-Dark" component={ADark} durationInFrames={1425} fps={30} width={1920} height={1080} />
        <Composition id="B-Light" component={BLight} durationInFrames={1115} fps={30} width={1920} height={1080} />
        <Composition id="C-Aurora" component={CAurora} durationInFrames={1020} fps={30} width={1920} height={1080} />
      </Folder>
      <Folder name="A-Scenes">
        <Composition id="A1-Opening" component={AOpening} durationInFrames={120} fps={30} width={1920} height={1080} />
        <Composition id="A2-Icon" component={AIcon} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="A3-Hero" component={AHero} durationInFrames={165} fps={30} width={1920} height={1080} />
        <Composition id="A4-Formats" component={AFormats} durationInFrames={165} fps={30} width={1920} height={1080} />
        <Composition id="A5-Lyrics" component={ALyrics} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="A6-Vinyl" component={AVinyl} durationInFrames={150} fps={30} width={1920} height={1080} />
        <Composition id="A7-Weather" component={AWeather} durationInFrames={195} fps={30} width={1920} height={1080} />
        <Composition id="A8-Desktop" component={ADesktop} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="A9-Customize" component={ACustomize} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="A10-End" component={AEnd} durationInFrames={150} fps={30} width={1920} height={1080} />
      </Folder>
      <Folder name="B-Scenes">
        <Composition id="B1-Intro" component={BIntro} durationInFrames={90} fps={30} width={1920} height={1080} />
        <Composition id="B2-Library" component={BLibrary} durationInFrames={150} fps={30} width={1920} height={1080} />
        <Composition id="B3-Mosaic" component={BMosaic} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="B4-Lyrics" component={BLyrics} durationInFrames={165} fps={30} width={1920} height={1080} />
        <Composition id="B5-Vinyl" component={BVinyl} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="B6-Weather" component={BWeather} durationInFrames={150} fps={30} width={1920} height={1080} />
        <Composition id="B7-Desktop" component={BDesktop} durationInFrames={120} fps={30} width={1920} height={1080} />
        <Composition id="B8-Customize" component={BCustomize} durationInFrames={130} fps={30} width={1920} height={1080} />
        <Composition id="B9-End" component={BEnd} durationInFrames={120} fps={30} width={1920} height={1080} />
      </Folder>
      <Folder name="C-Scenes">
        <Composition id="C1-Opening" component={COpening} durationInFrames={120} fps={30} width={1920} height={1080} />
        <Composition id="C2-Hero" component={CHero} durationInFrames={150} fps={30} width={1920} height={1080} />
        <Composition id="C3-Lyrics" component={CLyrics} durationInFrames={190} fps={30} width={1920} height={1080} />
        <Composition id="C4-Vinyl" component={CVinyl} durationInFrames={140} fps={30} width={1920} height={1080} />
        <Composition id="C5-Day" component={CDay} durationInFrames={165} fps={30} width={1920} height={1080} />
        <Composition id="C6-Desktop" component={CDesktop} durationInFrames={130} fps={30} width={1920} height={1080} />
        <Composition id="C7-Customize" component={CCustomize} durationInFrames={130} fps={30} width={1920} height={1080} />
        <Composition id="C8-End" component={CEnd} durationInFrames={135} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};

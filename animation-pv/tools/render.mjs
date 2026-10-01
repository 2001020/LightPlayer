#!/usr/bin/env node
// Frame-exact offline render of the film to MP4 (H.264 + AAC).
//
//   node animation-pv/tools/render.mjs --lang zh --height 1080 --fps 30 --out LightPlayer-PV-zh.mp4
//
// Options: --from / --to (seconds), --crf (quality, default 18), --mute,
// --ui 1.5 (UI texture scale, faster), --nomsaa (no multisampling, faster).
//
// Needs Playwright (npm i -D playwright, or a global install) and ffmpeg on
// PATH. Each frame is rendered through the page's capture hook
// (?capture=1), so the result does not depend on how fast the machine is;
// the soundtrack is rendered with an OfflineAudioContext and muxed in.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((a) => {
      const [k, ...v] = a.trim().split(/\s+/);
      return [k, v.join(" ") || "1"];
    }),
);
const lang = args.lang || "zh";
const height = +(args.height || 1080);
const fps = +(args.fps || 30);
const from = +(args.from || 0);
const to = args.to ? +args.to : null;
const out = path.resolve(args.out || `LightPlayer-PV-${lang}.mp4`);
const quality = +(args.crf || 18);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const globalRoot = (await import("node:child_process")).execSync("npm root -g").toString().trim();
  ({ chromium } = await import(pathToFileURL(path.join(globalRoot, "playwright", "index.mjs")).href));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const extra = (args.ui ? `&ui=${args.ui}` : "") + (args.nomsaa ? "&nomsaa" : "");
const page = pathToFileURL(path.join(here, "..", `${lang}.html`)).href + `?capture=1&res=${height}${extra}`;
const width = Math.round((height * 16) / 9);

const gpuArgs = process.platform === "linux" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-gpu", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: [...gpuArgs, "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });
const tab = await browser.newPage({ viewport: { width, height } });
tab.on("pageerror", (e) => console.error("page error:", e.message));
await tab.goto(page);
await tab.waitForFunction(() => typeof window.PV_RENDER === "function");
await tab.waitForTimeout(600);
const duration = await tab.evaluate(() => window.PV_DURATION);
const end = Math.min(to ?? duration, duration);
const frames = Math.floor((end - from) * fps);

// soundtrack
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-pv-"));
const wav = path.join(tmp, "score.wav");
if (!args.mute) {
  console.log("rendering soundtrack…");
  const b64 = await tab.evaluate(() => window.PV_AUDIO());
  fs.writeFileSync(wav, Buffer.from(b64, "base64"));
}

const ff = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-c:v",
    "mjpeg",
    "-i",
    "-",
    ...(args.mute ? [] : ["-ss", String(from), "-i", wav]),
    "-map",
    "0:v",
    ...(args.mute ? [] : ["-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-shortest"]),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    String(quality),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const started = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / fps;
  const b64 = await tab.evaluate((time) => {
    window.PV_RENDER(time);
    return document.getElementById("pv").toDataURL("image/jpeg", 0.96).split(",")[1];
  }, t);
  const buf = Buffer.from(b64, "base64");
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % fps === 0) {
    const el = (Date.now() - started) / 1000;
    const eta = (el / (i + 1)) * (frames - i - 1);
    process.stdout.write(`\rframe ${i + 1}/${frames}  ${Math.round(el)}s elapsed, about ${Math.round(eta)}s left   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nwrote ${out}`);

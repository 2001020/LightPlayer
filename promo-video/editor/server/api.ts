// Local HTTP API for the editor page, served by the Vite dev server. It only
// listens on this machine; it reads and writes texts.json and runs exports.

import { spawn } from "node:child_process";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { mergeTexts } from "../../src/shared/texts";
import { CODECS, type ExportSettings, FRAME_RATES, HEIGHTS } from "../shared/types";
import { cancelExport, checkGpu, startExport, status, systemInfo } from "./render";

const readBody = (req: IncomingMessage) =>
  new Promise<unknown>((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error("请求太大"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

function validSettings(v: unknown, videos: string[]): ExportSettings {
  const s = (v ?? {}) as Partial<ExportSettings>;
  if (!videos.includes(String(s.video))) throw new Error("未知的视频");
  if (!HEIGHTS.includes(s.height as never)) throw new Error("不支持的分辨率");
  if (!FRAME_RATES.includes(s.fps as never)) throw new Error("不支持的帧率");
  if (!CODECS.includes(s.codec as never)) throw new Error("不支持的编码");
  return {
    video: s.video!,
    height: s.height!,
    fps: s.fps!,
    codec: s.codec!,
    quality: s.quality === "standard" ? "standard" : "high",
    gpu: s.gpu !== false,
    hwEncode: s.hwEncode !== false,
  };
}

/** Opens a file with the system, or shows it in Finder / Explorer. */
function reveal(file: string, show: boolean) {
  const p = process.platform;
  const [cmd, args] =
    p === "darwin"
      ? ["open", show ? ["-R", file] : [file]]
      : p === "win32"
        ? show
          ? ["explorer.exe", [`/select,${file}`]]
          : ["cmd.exe", ["/c", "start", "", file]]
        : ["xdg-open", [show ? path.dirname(file) : file]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

export function editorApi(root: string, videos: string[]): Plugin {
  const textsFile = path.join(root, "texts.json");
  const outDir = path.join(root, "out");

  const readTexts = () => {
    try {
      return mergeTexts(JSON.parse(fs.readFileSync(textsFile, "utf8")));
    } catch {
      return mergeTexts({});
    }
  };

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void> | void> = {
    "GET /texts": (_req, res) => send(res, 200, readTexts()),
    "PUT /texts": async (req, res) => {
      const texts = mergeTexts(await readBody(req));
      const tmp = `${textsFile}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(texts, null, 2)}\n`);
      fs.renameSync(tmp, textsFile);
      send(res, 200, texts);
    },
    "GET /system": async (_req, res) => send(res, 200, await systemInfo(outDir)),
    "POST /gpu-check": async (_req, res) => send(res, 200, await checkGpu(root)),
    "GET /export": (_req, res) => send(res, 200, status()),
    "POST /export": async (req, res) => {
      const body = (await readBody(req)) as { settings?: unknown };
      send(res, 200, startExport(root, validSettings(body.settings, videos), readTexts()));
    },
    "POST /export/cancel": (_req, res) => {
      cancelExport();
      send(res, 200, status());
    },
    "POST /reveal": async (req, res) => {
      const { file, show } = (await readBody(req)) as { file?: string; show?: boolean };
      const full = path.resolve(String(file));
      // Only files this tool wrote.
      if (path.dirname(full) !== outDir || !fs.existsSync(full)) return send(res, 400, { error: "找不到文件" });
      reveal(full, show !== false);
      send(res, 200, { ok: true });
    },
  };

  return {
    name: "lightplayer-editor-api",
    configureServer(server) {
      server.middlewares.use("/api", (req, res) => {
        // Every write needs this header, which other web pages cannot send here
        // without a CORS preflight that this server never approves.
        if (req.method !== "GET" && req.headers["x-lightplayer-editor"] !== "1") return send(res, 403, { error: "forbidden" });
        const route = routes[`${req.method} ${(req.url ?? "").split("?")[0]}`];
        if (!route) return send(res, 404, { error: "not found" });
        Promise.resolve(route(req, res)).catch((e: unknown) => send(res, 400, { error: e instanceof Error ? e.message : String(e) }));
      });
    },
  };
}

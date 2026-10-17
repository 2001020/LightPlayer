import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { editorApi } from "./server/api";

const root = path.resolve(__dirname, "..");

// The text editor: `npm run editor` serves it on this machine only.
export default defineConfig({
  root: __dirname,
  plugins: [react(), editorApi(root, ["A-Dark", "B-Light", "C-Aurora"])],
  server: {
    host: "127.0.0.1",
    port: 5180,
    open: true,
    fs: { allow: [root] },
    // Saved texts and exported videos are not part of the editor page.
    watch: { ignored: [/[\\/]texts\.json(\.tmp)?$/, /[\\/]out[\\/]/, /[\\/]node_modules[\\/]\.cache[\\/]/] },
  },
  clearScreen: false,
});

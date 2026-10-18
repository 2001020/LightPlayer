// Writes footage/covers.json: the original SVG album covers drawn for the old promo, as data URLs.
// Run with: node --experimental-strip-types tools/covers.mjs
import { COVERS, genCover, svgUrl } from "../old/src/shared/covers.ts";
import { writeFileSync } from "node:fs";
const list = [...COVERS.map(svgUrl)];
for (let i = 0; list.length < 30; i++) list.push(svgUrl(genCover(i + 3)));
writeFileSync(new URL("../footage/covers.json", import.meta.url), JSON.stringify(list));
console.log("covers", list.length);

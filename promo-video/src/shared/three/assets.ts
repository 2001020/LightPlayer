import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { svgUrl } from "../covers";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Draws SVG markup into a canvas, optionally with rounded corners. */
export async function svgCanvas(svg: string, w: number, h: number, radius = 0) {
  const img = await loadImage(svgUrl(svg));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (radius) {
    g.beginPath();
    g.roundRect(0, 0, w, h, radius);
    g.clip();
  }
  g.drawImage(img, 0, 0, w, h);
  return c;
}

/**
 * Builds something asynchronously (textures) and holds rendering until it
 * is ready, so no frame is captured without it.
 */
export function useAsset<T>(make: () => Promise<T>, label: string): T | null {
  const [value, setValue] = useState<T | null>(null);
  const [handle] = useState(() => delayRender(label));
  useEffect(() => {
    make().then(setValue, (e: Error) => {
      throw e;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (value) continueRender(handle);
  }, [value, handle]);
  return value;
}

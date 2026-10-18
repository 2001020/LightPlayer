import { useMemo } from "react";
import * as THREE from "three";
import { COVERS, genCover, genFrame, rng } from "../covers";
import { canvasTexture, svgCanvas, useAsset } from "./assets";

type Tile = { tex: number; video: boolean };

const KINDS: Tile[] = [
  ...COVERS.map((_, i) => ({ tex: i, video: false })),
  ...Array.from({ length: 10 }, (_, i) => ({ tex: COVERS.length + i, video: false })),
  ...Array.from({ length: 10 }, (_, i) => ({ tex: COVERS.length + 10 + i, video: true })),
];

export function useTunnelTextures() {
  return useAsset(async () => {
    const covers = await Promise.all([...COVERS, ...Array.from({ length: 10 }, (_, i) => genCover(i + 1))].map((s) => svgCanvas(s, 512, 512, 36)));
    const frames = await Promise.all(Array.from({ length: 10 }, (_, i) => svgCanvas(genFrame(i + 1), 768, 432, 30)));
    return [...covers, ...frames].map(canvasTexture);
  }, "Tunnel textures");
}

/**
 * Album covers and video stills streaming toward the camera around an open
 * center. `travel` is how far the field has moved (units).
 */
export const MediaTunnel: React.FC<{ textures: THREE.Texture[]; travel: number; count?: number; depth?: number }> = ({
  textures,
  travel,
  count = 72,
  depth = 48,
}) => {
  const tiles = useMemo(() => {
    const r = rng(21);
    return Array.from({ length: count }, (_, i) => {
      const kind = KINDS[i % KINDS.length];
      const angle = i * 2.39996 + r() * 0.3;
      const radius = 2.7 + r() * 2.2;
      return { kind, angle, radius, z0: (i / count) * depth, tilt: (r() - 0.5) * 0.5, size: 0.9 + r() * 0.5 };
    });
  }, [count, depth]);
  return (
    <group>
      {tiles.map((t, i) => {
        const z = ((t.z0 + travel) % depth) - depth + 4;
        const w = t.kind.video ? 1.78 * t.size : t.size;
        const h = t.size;
        return (
          <mesh
            key={i}
            position={[Math.cos(t.angle) * t.radius * 1.5, Math.sin(t.angle) * t.radius * 0.95, z]}
            rotation={[t.tilt * 0.4, -Math.cos(t.angle) * 0.35, t.tilt * 0.3]}
          >
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={textures[t.kind.tex]} transparent toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
};

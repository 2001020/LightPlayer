import { useMemo } from "react";
import * as THREE from "three";
import { COVERS, rng } from "../covers";
import { canvasTexture, svgCanvas, useAsset } from "./assets";

const R = 2;

/** Grooves, label and center hole drawn on a 2048px canvas. */
async function discCanvas(cover: number) {
  const N = 2048;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d")!;
  const m = N / 2;
  g.fillStyle = "#0b0b0d";
  g.fillRect(0, 0, N, N);
  const r = rng(3);
  const label = m * 0.36;
  for (let rad = label + 30; rad < m - 6; rad += 2.2) {
    // Quiet gaps between tracks read as smoother, darker bands.
    const gap = [0.52, 0.66, 0.8].some((f) => Math.abs(rad / m - f) < 0.008);
    const l = gap ? 6 : 13 + r() * 9;
    g.strokeStyle = `rgb(${l},${l},${l + 2})`;
    g.lineWidth = 1.3;
    g.beginPath();
    g.arc(m, m, rad, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,.12)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(m, m, m - 6, 0, Math.PI * 2);
  g.stroke();
  const art = await svgCanvas(COVERS[cover], 1024, 1024);
  g.save();
  g.beginPath();
  g.arc(m, m, label, 0, Math.PI * 2);
  g.clip();
  g.drawImage(art, m - label, m - label, label * 2, label * 2);
  g.restore();
  g.fillStyle = "#d8d8dc";
  g.beginPath();
  g.arc(m, m, 14, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Light reflected by the grooves: two soft wedges that stay put while the disc turns. */
function sheenCanvas() {
  const N = 1024;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d")!;
  const m = N / 2;
  const grad = g.createConicGradient(0.5, m, m);
  const stops: [number, number][] = [
    [0, 0],
    [0.05, 0.38],
    [0.11, 0],
    [0.5, 0],
    [0.555, 0.3],
    [0.61, 0],
    [1, 0],
  ];
  for (const [o, a] of stops) grad.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(m, m, m - 4, 0, Math.PI * 2);
  g.arc(m, m, m * 0.38, 0, Math.PI * 2, true);
  g.fill("evenodd");
  return c;
}

type Textures = { disc: THREE.Texture; sheen: THREE.Texture };

export function useVinylTextures(cover: number) {
  return useAsset<Textures>(async () => ({ disc: canvasTexture(await discCanvas(cover)), sheen: canvasTexture(sheenCanvas()) }), "Vinyl textures");
}

/**
 * A record on a platter with a tonearm. `spin` turns the disc (radians),
 * `arm` swings the tonearm from rest (0) onto the record (1).
 */
export const Vinyl3D: React.FC<{ textures: Textures; spin: number; arm: number }> = ({ textures, spin, arm }) => {
  const pivot = new THREE.Vector3(2.45, 0, -1.75);
  const aim = (x: number, z: number) => Math.atan2(-(z - pivot.z), x - pivot.x);
  const rest = aim(2.75, 1.45);
  const play = aim(1.0, 1.15);
  const angle = rest + (play - rest) * arm;
  const L = Math.hypot(1.0 - pivot.x, 1.15 - pivot.z);
  const discMats = useMemo(
    () => [
      new THREE.MeshPhysicalMaterial({ color: "#0d0d10", roughness: 0.5, envMapIntensity: 0.2 }),
      new THREE.MeshPhysicalMaterial({ map: textures.disc, roughness: 0.32, specularIntensity: 0.35, envMapIntensity: 0.08 }),
      new THREE.MeshPhysicalMaterial({ color: "#0d0d10", envMapIntensity: 0.2 }),
    ],
    [textures],
  );
  return (
    <group>
      <mesh position={[0, -0.09, 0]}>
        <cylinderGeometry args={[R * 1.04, R * 1.06, 0.12, 128]} />
        <meshPhysicalMaterial color="#1a1a1e" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh rotation={[0, spin, 0]} material={discMats}>
        <cylinderGeometry args={[R, R, 0.04, 160]} />
      </mesh>
      <mesh position={[0, 0.0215, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[R * 2, R * 2]} />
        <meshBasicMaterial map={textures.sheen} opacity={0.75} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.1, 24]} />
        <meshPhysicalMaterial color="#d0d0d6" metalness={1} roughness={0.2} />
      </mesh>
      <group position={pivot}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.26, 0.3, 0.24, 48]} />
          <meshPhysicalMaterial color="#c8c8ce" metalness={1} roughness={0.25} />
        </mesh>
        <group rotation={[0, angle, 0]} position={[0, 0.3, 0]}>
          <mesh position={[L / 2 - 0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, L - 0.3, 24]} />
            <meshPhysicalMaterial color="#e6e6ea" metalness={1} roughness={0.18} />
          </mesh>
          <mesh position={[-0.38, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.2, 32]} />
            <meshPhysicalMaterial color="#5a5a62" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[L - 0.1, -0.14, 0]}>
            <boxGeometry args={[0.34, 0.08, 0.2]} />
            <meshPhysicalMaterial color="#2a2a30" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

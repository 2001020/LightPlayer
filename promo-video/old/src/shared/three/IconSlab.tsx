import { useMemo } from "react";
import * as THREE from "three";

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** The app icon as a glossy rounded slab, 2 units wide. */
export const IconSlab: React.FC<{
  texture: THREE.Texture;
  rotation?: [number, number, number];
  position?: [number, number, number];
  scale?: number;
}> = ({ texture, rotation = [0, 0, 0], position = [0, 0, 0], scale = 1 }) => {
  const geometry = useMemo(() => {
    // A superellipse-like squircle: quadratic corners with a large radius.
    const g = new THREE.ExtrudeGeometry(roundedRect(2, 2, 0.5), {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 10,
      curveSegments: 48,
    });
    g.center();
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 1.05) / 2.1, (pos.getY(i) + 1.05) / 2.1);
    uv.needsUpdate = true;
    return g;
  }, []);
  return (
    <mesh geometry={geometry} rotation={rotation} position={position} scale={scale}>
      <meshPhysicalMaterial attach="material-0" map={texture} roughness={0.28} metalness={0} clearcoat={1} clearcoatRoughness={0.08} />
      <meshPhysicalMaterial attach="material-1" color="#5aa9ff" roughness={0.22} metalness={0.35} clearcoat={1} clearcoatRoughness={0.1} />
    </mesh>
  );
};

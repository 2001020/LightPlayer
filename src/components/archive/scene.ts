// The archive theme's 3D field: rows of frosted boxes seen from high and far,
// one box per song in the playlist. A simplified port of the archive scene of
// LBEILC/RhineLabUI (MIT, see public/archive/LICENSE-RhineLabUI.txt): same
// lens, lighting, materials and waves, without its post-processing, sound,
// detail view or branding. Each box carries its song's cover. It only draws
// while something moves.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  BASE_Y,
  COLUMN_SPACING,
  ROW_SPACING,
  cellOf,
  columnStrength,
  damp,
  idleWave,
  layout,
  panToCells,
  selectionWave,
  settled,
  shoulder,
  smooth,
  trackAt,
  type Cell,
  type Layout,
  type Spring,
  type Vec2,
} from "./field";

export type ArchiveQuality = "low" | "standard" | "high";

export interface ArchiveSong {
  path: string;
  name: string;
}

/** Cover image URL of a song at a pixel size, or null when it has none. */
export type CoverUrl = (path: string, size: number) => string | null;

const LANES = 9;
const ROWS = 44;
const BACKGROUND = "#eae5e1";
/** Surfaces drawn for every box; the rest only on the chosen one. */
const ARRAY_PARTS = ["Frosted_Polymer", "Ivory_Edges", "Titanium_Fasteners", "Index_Inlay", "Optical_Diffuser"];
const HOVER_LIFT = 0.28;
const CHOSEN_LIFT = 0.62;
/** The chosen box sits this far in front of the camera's aim, like the reference. */
const RAIL = 2.17;

/** Where the camera looks: just behind the chosen box. */
const AIM = new THREE.Vector3(-1.091, -0.045, 0.481);

const key = (c: Cell) => `${c.lane}:${c.row}`;

/** Covers of the array share one texture: 21 × 21 tiles of 96 px. */
const ATLAS = 2048;
const TILE = 96;
const PER_ROW = Math.floor(ATLAS / TILE);
const CHOSEN_TILE = 256;
/** Covers asked for at once; the media server also streams the audio. */
const MAX_LOADS = 3;
/** The cover on the front of each box (box space), at its upper left. */
const COVER_SIZE = 1.7;
const COVER_CENTER = new THREE.Vector3(-1.1, 2.7, 0.216);

interface Slot {
  tile: number;
  ready: boolean;
  /** Frame in which a drawn box last showed it. */
  used: number;
}

interface Free {
  lane: number;
  row: number;
  /** Columns / boxes per second, for the glide after letting go. */
  vLane: number;
  vRow: number;
  held: boolean;
  at: number;
}

interface Pulse {
  cell: Cell;
  time: number;
}

export class ArchiveScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(6, 16 / 9, 5, 300);
  private light: THREE.DirectionalLight;
  private instances: THREE.InstancedMesh[] = [];
  private chosenModel = new THREE.Group();
  private fullMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private arrayMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private labelCanvas = document.createElement("canvas");
  private labelTexture = new THREE.CanvasTexture(this.labelCanvas);
  private dummy = new THREE.Object3D();
  private raycaster = new THREE.Raycaster();
  private drawn: Cell[] = [];

  private plan: Layout = layout(0);
  private chosen: Cell = { lane: 0, row: 0 };
  private chosenIndex = -1;
  private camX: Spring = { value: 0, velocity: 0 };
  private camZ: Spring = { value: RAIL, velocity: 0 };
  private rowFocus: Spring = { value: 0, velocity: 0 };
  private laneFocus: Spring = { value: 0, velocity: 0 };
  private lift: Spring = { value: 0, velocity: 0 };
  private hoverCell: Cell | null = null;
  private hoverLifts = new Map<string, { cell: Cell; value: number }>();
  private pulses: Pulse[] = [];
  private pointer: { x: number; y: number } | null = null;
  /** The view while dragged or gliding: a point between boxes. */
  private free: Free | null = null;

  private songs: ArchiveSong[] = [];
  private coverUrl: CoverUrl = () => null;
  private atlas = document.createElement("canvas");
  private atlasTexture = new THREE.CanvasTexture(this.atlas);
  /** Tiles drawn since the last frame, to send to the GPU one by one. */
  private newTiles: number[] = [];
  private tileCanvas = document.createElement("canvas");
  private slots = new Map<string, Slot>();
  private freeTiles = Array.from({ length: PER_ROW * PER_ROW }, (_, i) => i);
  private loads = 0;
  private coverSlots = new Float32Array(LANES * ROWS * 3);
  private coverAttr = new THREE.InstancedBufferAttribute(this.coverSlots, 3);
  private chosenCanvas = document.createElement("canvas");
  private chosenTexture = new THREE.CanvasTexture(this.chosenCanvas);
  private chosenCover = "";
  /** The song whose sharp cover the chosen box shows. */
  private chosenSharp = "";
  private chosenTimer = 0;
  private wanted: { song: ArchiveSong; distance: number }[] = [];
  private frameNo = 0;
  /** Only the idle drift moves: a slower frame rate is enough. */
  private drifting = false;

  private quality: ArchiveQuality = "standard";
  private motion = true;
  private playing = false;
  private active = true;
  private loaded = false;
  private disposed = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  private clock = 0;
  private last = 0;
  private frame = 0;
  private lastDraw = 0;
  private resizeObserver: ResizeObserver;
  /** Requested frames, for checking that a still scene stops drawing. */
  frames = 0;

  onHover?: (index: number | null) => void;
  /** The chosen song changed (wheel, drag, click or `choose`). */
  onChoose?: (index: number) => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = "archive-canvas";
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      // The canvases still hold every picture.
      for (const t of [this.atlasTexture, this.chosenTexture, this.labelTexture]) t.needsUpdate = true;
      this.newTiles = [];
      this.invalidate();
    });

    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = new THREE.Fog(BACKGROUND, 22, 47);
    // Studio light of the reference ("baseline" look).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = 0.48;
    this.scene.add(new THREE.HemisphereLight("#fffaf5", "#b4a18c", 0.65));
    this.light = new THREE.DirectionalLight("#fff7ed", 1.4);
    this.light.position.set(-6, 14, -5);
    this.light.castShadow = true;
    Object.assign(this.light.shadow.camera, { left: -16, right: 16, top: 15, bottom: -15, near: 0.1, far: 45 });
    this.light.shadow.normalBias = 0.035;
    this.light.shadow.bias = -0.0003;
    this.light.shadow.radius = 4;
    const fill = new THREE.DirectionalLight("#ffffff", 0.6);
    fill.position.set(7, 8, -10);
    this.scene.add(this.light, fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: "#d8c9b9", roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4.63;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.labelCanvas.width = 512;
    this.labelCanvas.height = 220;
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture.anisotropy = 4;
    this.atlas.width = this.atlas.height = ATLAS;
    this.tileCanvas.width = this.tileCanvas.height = TILE;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.anisotropy = 4;
    this.chosenCanvas.width = this.chosenCanvas.height = CHOSEN_TILE;
    this.chosenTexture.colorSpace = THREE.SRGBColorSpace;
    this.chosenTexture.anisotropy = 8;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.reduced.addEventListener("change", this.invalidate);
    document.addEventListener("visibilitychange", this.invalidate);
  }

  async load(url: string) {
    const gltf = await new GLTFLoader().loadAsync(url);
    if (this.disposed) return;
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    for (const mesh of meshes) {
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const source = mesh.material as THREE.MeshPhysicalMaterial;
      const name = source.name.replace(/\.\d+$/, "");
      const mat = fullMaterial(name, source);
      const shared = ARRAY_PARTS.includes(name);
      const arrayMat = shared ? arrayMaterial(name, mat) : null;
      // The chosen box looks like its neighbours; its inner parts only show
      // through the frosted shell at high quality.
      if (arrayMat) this.arrayMaterials.set(name, arrayMat);
      else this.fullMaterials.set(name, mat);
      const part = new THREE.Mesh(geom, arrayMat ?? mat);
      part.castShadow = name === "Optical_Diffuser";
      part.receiveShadow = true;
      // The cover takes the printed label's place.
      part.visible = name !== "Printed_Label";
      this.chosenModel.add(part);
      if (!arrayMat) continue;
      const inst = new THREE.InstancedMesh(geom, arrayMat, LANES * ROWS);
      inst.name = name;
      // All surfaces move together: share one transform buffer.
      inst.instanceMatrix = this.instances[0]?.instanceMatrix ?? inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = name === "Optical_Diffuser";
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.instances.push(inst);
      this.scene.add(inst);
    }
    // The picking surface comes first.
    this.instances.sort((a, b) => Number(b.material === this.arrayMaterials.get("Frosted_Polymer")) - Number(a.material === this.arrayMaterials.get("Frosted_Polymer")));
    // Covers: one face per box, its picture picked from the atlas per instance.
    const coverGeom = new THREE.PlaneGeometry(COVER_SIZE, COVER_SIZE).translate(COVER_CENTER.x, COVER_CENTER.y, COVER_CENTER.z);
    coverGeom.setAttribute("coverSlot", this.coverAttr.setUsage(THREE.DynamicDrawUsage));
    const covers = new THREE.InstancedMesh(coverGeom, coverMaterial(this.atlasTexture), LANES * ROWS);
    covers.name = "Covers";
    covers.instanceMatrix = this.instances[0].instanceMatrix;
    covers.receiveShadow = true;
    covers.frustumCulled = false;
    this.instances.push(covers);
    this.scene.add(covers);
    const chosenCover = new THREE.Mesh(
      new THREE.PlaneGeometry(COVER_SIZE, COVER_SIZE).translate(COVER_CENTER.x, COVER_CENTER.y, COVER_CENTER.z + 0.004),
      new THREE.MeshStandardMaterial({ map: this.chosenTexture, roughness: 0.42, envMapIntensity: 0.5 }),
    );
    chosenCover.receiveShadow = true;
    this.chosenModel.add(chosenCover);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.344),
      new THREE.MeshBasicMaterial({ map: this.labelTexture, toneMapped: false, transparent: true, depthWrite: false }),
    );
    label.position.set(0.32, 3.36, 0.225);
    this.chosenModel.add(label);
    this.scene.add(this.chosenModel);
    // The atlas goes to the GPU once; new covers are added tile by tile.
    this.renderer.initTexture(this.atlasTexture);
    this.loaded = true;
    this.applyQuality();
    this.drawLabel();
    this.invalidate();
  }

  // ---- state from the app ----

  setQuality(q: ArchiveQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
  }

  setMotion(on: boolean) {
    this.motion = on;
    this.invalidate();
  }

  setPlaying(on: boolean) {
    this.playing = on;
    this.invalidate();
  }

  /** False while the field is covered (library, lyrics, video): nothing is drawn. */
  setActive(on: boolean) {
    this.active = on;
    if (!on) this.setPointer(null);
    this.invalidate();
  }

  /** The songs of the playlist, one per box, and where their covers are. */
  setPlaylist(songs: ArchiveSong[], coverUrl: CoverUrl) {
    this.songs = songs;
    this.coverUrl = coverUrl;
    const n = songs.length;
    if (n !== this.plan.n) {
      const before = this.chosenIndex;
      this.plan = layout(n);
      if (this.chosenIndex >= n) this.chosenIndex = n ? 0 : -1;
      if (this.chosenIndex >= 0) this.chosen = cellOf(this.chosenIndex, this.chosen, this.plan);
      this.free = null;
      if (this.chosenIndex !== before) this.onChoose?.(this.chosenIndex);
    }
    this.drawLabel();
    this.showChosenCover();
    this.invalidate();
  }

  /** Brings song `index` forward (the nearest copy of its box). */
  choose(index: number, ripple = true) {
    if (index < 0 || index >= this.plan.n) return;
    this.free = null;
    const cell = cellOf(index, this.chosen, this.plan);
    this.chooseCell(cell, ripple);
  }

  /** Moves the choice by whole boxes; returns the song now chosen. */
  step(lanes: number, rows: number): number {
    if (!this.plan.n) return -1;
    this.free = null;
    this.chooseCell({ lane: this.chosen.lane + lanes, row: this.chosen.row + rows }, true);
    return this.chosenIndex;
  }

  get chosenSong() {
    return this.chosenIndex;
  }

  /** Whether the field is being dragged or still gliding after a drag. */
  get moving() {
    return this.free !== null;
  }

  private chooseCell(cell: Cell, ripple: boolean) {
    const same = cell.lane === this.chosen.lane && cell.row === this.chosen.row;
    const before = this.chosenIndex;
    this.chosen = cell;
    this.chosenIndex = trackAt(cell, this.plan);
    if (!same) {
      // While dragging the boxes pass under the view: no rise from 0, no ripple.
      if (ripple) {
        this.lift.value = 0;
        this.lift.velocity = 0;
      }
      if (ripple && !this.reduced.matches) {
        this.pulses.push({ cell: { ...cell }, time: this.clock });
        this.pulses = this.pulses.slice(-6);
      }
      this.drawLabel();
      this.showChosenCover();
    }
    if (this.chosenIndex !== before) this.onChoose?.(this.chosenIndex);
    this.invalidate();
  }

  // ---- dragging ----

  /** Starts dragging the field from where the view is now. */
  grab() {
    if (!this.plan.n) return;
    this.free = {
      lane: this.camX.value / COLUMN_SPACING,
      row: (this.camZ.value - RAIL) / ROW_SPACING,
      vLane: 0,
      vRow: 0,
      held: true,
      at: performance.now(),
    };
  }

  /** Moves the field with the pointer by (dx, dy) pixels, in any direction. */
  panBy(dx: number, dy: number) {
    const f = this.free;
    if (!f) return;
    const { lane, row } = this.screenAxes();
    const d = panToCells(lane, row, { x: dx, y: dy });
    f.lane += d.lane;
    f.row += d.row;
    const now = performance.now();
    const dt = Math.max(8, now - f.at) / 1000;
    f.at = now;
    f.vLane = THREE.MathUtils.lerp(f.vLane, d.lane / dt, 0.4);
    f.vRow = THREE.MathUtils.lerp(f.vRow, d.row / dt, 0.4);
    this.followFree();
    this.invalidate();
  }

  /** Lets go: the field glides on, slows down and settles on a box. */
  release() {
    const f = this.free;
    if (!f) return;
    f.held = false;
    // A pause before letting go means no glide.
    if (performance.now() - f.at > 90 || this.reduced.matches) f.vLane = f.vRow = 0;
    this.invalidate();
  }

  private followFree() {
    const f = this.free!;
    const cell = { lane: Math.round(f.lane), row: Math.round(f.row) };
    if (cell.lane !== this.chosen.lane || cell.row !== this.chosen.row) this.chooseCell(cell, false);
  }

  /** How far one column and one box move on screen (pixels). */
  private screenAxes(): { lane: Vec2; row: Vec2 } {
    this.placeCamera();
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const at = (v: THREE.Vector3) => {
      const p = v.project(this.camera);
      return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    };
    const o = at(AIM.clone());
    const l = at(AIM.clone().add(new THREE.Vector3(COLUMN_SPACING, 0, 0)));
    const r = at(AIM.clone().add(new THREE.Vector3(0, 0, ROW_SPACING)));
    return { lane: { x: l.x - o.x, y: l.y - o.y }, row: { x: r.x - o.x, y: r.y - o.y } };
  }

  /** The pointer over the field (client coordinates), or null when it left. */
  setPointer(p: { x: number; y: number } | null) {
    this.pointer = p;
    this.invalidate();
  }

  /** The song under a point, or -1. */
  songAt(x: number, y: number): number {
    const cell = this.pick(x, y);
    return cell ? trackAt(cell, this.plan) : -1;
  }

  /** Requests frames counted (testing) and boxes drawn. */
  stats() {
    return { frames: this.frames, drawn: this.drawn.length, chosen: this.chosenIndex, quality: this.quality };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.reduced.removeEventListener("change", this.invalidate);
    document.removeEventListener("visibilitychange", this.invalidate);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    clearTimeout(this.chosenTimer);
    this.scene.environment?.dispose();
    this.labelTexture.dispose();
    this.atlasTexture.dispose();
    this.chosenTexture.dispose();
    this.renderer.dispose();
    // Give the GPU context back now rather than whenever it is collected.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---- drawing ----

  invalidate = () => {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  };

  private applyQuality() {
    const q = this.quality;
    const dpr = Math.min(devicePixelRatio, q === "low" ? 1 : q === "standard" ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== "low";
    this.light.castShadow = q !== "low";
    const size = q === "high" ? 2048 : 1024;
    if (this.light.shadow.mapSize.x !== size) {
      this.light.shadow.mapSize.set(size, size);
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
    }
    // Frosted transmission needs a second pass of the whole scene each frame.
    const clear = q === "high";
    for (const [name, mat] of this.arrayMaterials) {
      mat.transmission = clear && name === "Frosted_Polymer" ? 0.78 : 0;
      // Clearcoat is a second specular layer on most of the screen.
      mat.clearcoat = clear && name === "Frosted_Polymer" ? 0.3 : 0;
      mat.needsUpdate = true;
    }
    for (const mat of this.fullMaterials.values()) {
      mat.transmission = clear ? (mat.userData.transmission ?? 0) : 0;
      mat.needsUpdate = true;
    }
    // The inner diffuser only shows through clear shells; opaque shells cast
    // the shadows themselves.
    for (const inst of this.instances) {
      if (inst.name === "Optical_Diffuser") inst.visible = clear;
      if (inst.name === "Frosted_Polymer") inst.castShadow = !clear;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.invalidate();
  }

  private drawLabel() {
    const c = this.labelCanvas.getContext("2d");
    if (!c) return;
    // Drawn at half size: it is small on screen and redrawn while dragging.
    c.setTransform(0.5, 0, 0, 0.5, 0, 0);
    c.fillStyle = "#e6e2d9";
    c.fillRect(0, 0, 1024, 440);
    c.fillStyle = "#171713";
    c.fillRect(12, 12, 1000, 6);
    c.fillRect(12, 419, 1000, 3);
    const n = this.chosenIndex >= 0 ? this.chosenIndex + 1 : 0;
    c.font = "600 34px -apple-system, 'Segoe UI', 'PingFang SC', sans-serif";
    c.fillStyle = "#878476";
    c.fillText(`${String(n).padStart(3, "0")} / ${String(this.plan.n).padStart(3, "0")}`, 25, 92);
    c.fillStyle = "#171713";
    c.font = "bold 150px -apple-system, 'Segoe UI', 'PingFang SC', sans-serif";
    c.fillText("NO." + String(n).padStart(3, "0"), 18, 340);
    this.labelTexture.needsUpdate = true;
    this.invalidate();
  }

  // ---- covers ----

  /** Points box `i` (at `cell`) at its song's cover, asking for it when missing. */
  private coverOf(cell: Cell, i: number, centerLane: number, centerRow: number) {
    const song = this.songs[trackAt(cell, this.plan)];
    const slot = song ? this.slots.get(song.path) : undefined;
    const o = i * 3;
    if (slot) slot.used = this.frameNo;
    if (slot?.ready) {
      this.coverSlots[o] = ((slot.tile % PER_ROW) * TILE) / ATLAS;
      this.coverSlots[o + 1] = 1 - ((Math.floor(slot.tile / PER_ROW) + 1) * TILE) / ATLAS;
      this.coverSlots[o + 2] = 1;
    } else {
      this.coverSlots[o + 2] = 0;
      if (song && !slot) this.wanted.push({ song, distance: Math.abs(cell.lane - centerLane) * 6 + Math.abs(cell.row - centerRow) });
    }
  }

  /** Starts loading the missing covers nearest the view, a few at a time. */
  private loadCovers() {
    const wanted = this.wanted.sort((a, b) => a.distance - b.distance);
    for (const { song } of wanted) {
      if (this.loads >= MAX_LOADS) break;
      if (this.slots.has(song.path)) continue;
      const tile = this.takeTile();
      if (tile < 0) break;
      const slot: Slot = { tile, ready: false, used: this.frameNo };
      this.slots.set(song.path, slot);
      this.loads++;
      void loadImage(this.coverUrl(song.path, 128)).then((img) => {
        this.loads--;
        if (this.disposed) return;
        if (this.slots.get(song.path) === slot) {
          const c = this.atlas.getContext("2d")!;
          const x = (tile % PER_ROW) * TILE;
          const y = Math.floor(tile / PER_ROW) * TILE;
          if (img) drawCover(c, img, x, y, TILE);
          else drawTitle(c, song.name, x, y, TILE);
          slot.ready = true;
          this.newTiles.push(tile);
          // Until its sharp copy arrives, the chosen box shows this one.
          if (song === this.songs[this.chosenIndex] && this.chosenSharp !== song.path) this.paintChosenFromAtlas(slot);
        }
        this.invalidate();
      });
    }
  }

  /** A free atlas tile, or the one of the cover unseen the longest. */
  private takeTile(): number {
    const free = this.freeTiles.pop();
    if (free !== undefined) return free;
    let oldest: [string, Slot] | null = null;
    for (const e of this.slots) if (e[1].ready && e[1].used < this.frameNo && (!oldest || e[1].used < oldest[1].used)) oldest = e;
    if (!oldest) return -1;
    this.slots.delete(oldest[0]);
    return oldest[1].tile;
  }

  private paintChosenFromAtlas(slot: Slot) {
    const c = this.chosenCanvas.getContext("2d")!;
    c.drawImage(this.atlas, (slot.tile % PER_ROW) * TILE, Math.floor(slot.tile / PER_ROW) * TILE, TILE, TILE, 0, 0, CHOSEN_TILE, CHOSEN_TILE);
    this.chosenTexture.needsUpdate = true;
  }

  /** Adds the covers drawn since the last frame to the atlas on the GPU. */
  private uploadTiles() {
    if (!this.newTiles.length) return;
    const tex = (this.renderer.properties.get(this.atlasTexture) as { __webglTexture?: WebGLTexture }).__webglTexture;
    if (!tex) {
      this.atlasTexture.needsUpdate = true;
      this.newTiles = [];
      return;
    }
    const gl = this.renderer.getContext();
    const t = this.tileCanvas.getContext("2d")!;
    this.renderer.state.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    for (const tile of this.newTiles) {
      const x = (tile % PER_ROW) * TILE;
      const y = Math.floor(tile / PER_ROW) * TILE;
      t.drawImage(this.atlas, x, y, TILE, TILE, 0, 0, TILE, TILE);
      // Flipped like the whole atlas: canvas rows run down, texture rows up.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, ATLAS - y - TILE, gl.RGBA, gl.UNSIGNED_BYTE, this.tileCanvas);
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.newTiles = [];
  }

  /** The chosen box's cover: the array's copy at once, a sharper one once settled. */
  private showChosenCover() {
    const song = this.songs[this.chosenIndex];
    const path = song?.path ?? "";
    if (path === this.chosenCover) return;
    this.chosenCover = path;
    this.chosenSharp = "";
    const c = this.chosenCanvas.getContext("2d")!;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, CHOSEN_TILE, CHOSEN_TILE);
    const slot = song ? this.slots.get(path) : undefined;
    if (slot?.ready) this.paintChosenFromAtlas(slot);
    this.chosenTexture.needsUpdate = true;
    this.requestSharpCover();
  }

  /** Loads the chosen box's sharp cover, unless the field is still moving. */
  private requestSharpCover() {
    clearTimeout(this.chosenTimer);
    this.chosenTimer = 0;
    const song = this.songs[this.chosenIndex];
    if (!song || this.free || this.chosenSharp === song.path) return;
    const path = song.path;
    this.chosenTimer = window.setTimeout(() => {
      this.chosenTimer = 0;
      void loadImage(this.coverUrl(path, CHOSEN_TILE)).then((img) => {
        if (this.disposed || this.chosenCover !== path) return;
        const c = this.chosenCanvas.getContext("2d")!;
        if (img) drawCover(c, img, 0, 0, CHOSEN_TILE);
        else drawTitle(c, song.name, 0, 0, CHOSEN_TILE);
        this.chosenSharp = path;
        this.chosenTexture.needsUpdate = true;
        this.invalidate();
      });
    }, 140);
  }

  private pick(x: number, y: number): Cell | null {
    if (!this.loaded || !this.instances.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // The chosen box is a separate model in front of the array.
    const chosenHit = this.raycaster.intersectObject(this.chosenModel, true)[0];
    const hit = this.raycaster.intersectObject(this.instances[0], false)[0];
    if (chosenHit && (!hit || chosenHit.distance <= hit.distance)) return { ...this.chosen };
    if (!hit || hit.instanceId === undefined) return null;
    return this.drawn[hit.instanceId] ?? null;
  }

  private tick = (now: number) => {
    this.frame = 0;
    const hidden = document.visibilityState === "hidden";
    if (!this.active || hidden || !this.loaded) return;
    // At most 60 frames a second, 30 at low quality or while only drifting.
    if (now - this.lastDraw < (this.quality === "low" || this.drifting ? 31 : 15)) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    this.frames++;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.lastDraw = now;
    this.clock += dt;
    const moving = this.update(dt);
    this.uploadTiles();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    if (moving) this.frame = requestAnimationFrame(this.tick);
    else this.last = 0;
  };

  /** Advances the simulation; true while anything still moves. */
  private update(dt: number): boolean {
    const reduced = this.reduced.matches;
    const rate = (r: number) => (reduced ? 60 : r);
    const t = this.clock;
    this.frameNo++;
    // After a drag the view glides on, slows down, then settles on a box.
    const f = this.free;
    if (f && !f.held) {
      f.lane += f.vLane * dt;
      f.row += f.vRow * dt;
      const decay = Math.exp(-dt * 4.2);
      f.vLane *= decay;
      f.vRow *= decay;
      this.followFree();
      if (Math.abs(f.vLane) < 0.08 && Math.abs(f.vRow) < 0.8) {
        this.free = null;
        this.chooseCell({ lane: Math.round(f.lane), row: Math.round(f.row) }, true);
        this.requestSharpCover();
      }
    }
    const targetX = this.free ? this.free.lane * COLUMN_SPACING : this.chosen.lane * COLUMN_SPACING;
    const targetZ = this.free ? this.free.row * ROW_SPACING + RAIL : this.chosen.row * ROW_SPACING + RAIL;
    if (this.free) {
      // The field stays under the pointer.
      Object.assign(this.camX, { value: targetX, velocity: 0 });
      Object.assign(this.camZ, { value: targetZ, velocity: 0 });
    } else {
      damp(this.camX, targetX, rate(3.7), dt);
      damp(this.camZ, targetZ, rate(3.7), dt);
    }
    damp(this.rowFocus, this.chosen.row, rate(5), dt);
    damp(this.laneFocus, this.chosen.lane, rate(4), dt);
    damp(this.lift, this.plan.n ? CHOSEN_LIFT : 0, rate(7.6), dt);
    this.pulses = this.pulses.filter((p) => t - p.time < 3.2);

    // Hover: the box under the pointer rises a little.
    this.hoverCell = this.pointer ? this.pick(this.pointer.x, this.pointer.y) : null;
    const hoverKey = this.hoverCell ? key(this.hoverCell) : null;
    if (this.hoverCell && hoverKey && !this.hoverLifts.has(hoverKey)) this.hoverLifts.set(hoverKey, { cell: this.hoverCell, value: 0 });
    let hoverMoving = false;
    for (const [k, h] of this.hoverLifts) {
      const target = k === hoverKey ? HOVER_LIFT : 0;
      h.value = reduced ? target : THREE.MathUtils.lerp(h.value, target, 1 - Math.exp(-dt * 14));
      if (Math.abs(h.value - target) > 1e-3) hoverMoving = true;
      if (target === 0 && h.value < 1e-4) this.hoverLifts.delete(k);
    }
    const hoverLift = (c: Cell) => this.hoverLifts.get(key(c))?.value ?? 0;
    const idle = this.motion && this.playing && !reduced;

    const field = (row: number, lane: number) => {
      let h = shoulder(row - this.rowFocus.value) * columnStrength(lane, this.laneFocus.value);
      if (idle) h += idleWave(row, lane, t);
      let ripple = 0;
      for (const p of this.pulses) {
        const distance = Math.hypot(row - p.cell.row, (lane - p.cell.lane) * 2.2);
        ripple += selectionWave(distance, t - p.time);
      }
      return h + THREE.MathUtils.clamp(ripple, -0.6, 0.6);
    };

    // The boxes around the camera, in world space relative to it.
    const centerLane = Math.round(this.camX.value / COLUMN_SPACING);
    const centerRow = Math.round((this.camZ.value - RAIL) / ROW_SPACING);
    this.drawn = [];
    this.wanted = [];
    const chosenKey = key(this.chosen);
    // Nearest boxes first (the camera is on the low-lane, high-row side), so
    // the ones they hide are not shaded.
    for (let lane = centerLane - 4; lane <= centerLane + 4; lane++) {
      for (let row = centerRow - 20 + ROWS - 1; row >= centerRow - 20; row--) {
        const cell = { lane, row };
        if (this.plan.n && key(cell) === chosenKey) continue;
        const y = BASE_Y + field(row, lane) + hoverLift(cell);
        const slope = field(row + 0.5, lane) - field(row - 0.5, lane);
        this.dummy.position.set(lane * COLUMN_SPACING - this.camX.value, y, row * ROW_SPACING - this.camZ.value);
        this.dummy.rotation.set(slope * 0.024, 0, 0);
        this.dummy.updateMatrix();
        this.instances[0].setMatrixAt(this.drawn.length, this.dummy.matrix);
        this.coverOf(cell, this.drawn.length, centerLane, centerRow);
        this.drawn.push(cell);
      }
    }
    for (const inst of this.instances) inst.count = this.drawn.length;
    this.instances[0].instanceMatrix.needsUpdate = true;
    this.coverAttr.needsUpdate = true;
    // New covers are asked for once the field stops: a long drag would
    // otherwise ask for every box it passes.
    if (!this.free) this.loadCovers();
    this.instances[0].computeBoundingSphere();

    const { row, lane } = this.chosen;
    this.chosenModel.visible = this.plan.n > 0;
    this.chosenModel.position.set(
      lane * COLUMN_SPACING - this.camX.value,
      BASE_Y + field(row, lane) + this.lift.value + hoverLift(this.chosen),
      row * ROW_SPACING - this.camZ.value,
    );
    this.chosenModel.rotation.set((field(row + 0.5, lane) - field(row - 0.5, lane)) * 0.024 * (1 - smooth(this.lift.value / CHOSEN_LIFT)), 0, 0);

    this.placeCamera();

    if (this.onHover) {
      const song = this.hoverCell ? trackAt(this.hoverCell, this.plan) : null;
      this.onHover(song !== null && song >= 0 ? song : null);
    }
    const busy =
      this.free !== null ||
      this.pulses.length > 0 ||
      hoverMoving ||
      !settled(this.camX, targetX) ||
      !settled(this.camZ, targetZ) ||
      !settled(this.rowFocus, this.chosen.row) ||
      !settled(this.laneFocus, this.chosen.lane) ||
      !settled(this.lift, this.plan.n ? CHOSEN_LIFT : 0);
    this.drifting = idle && !busy;
    return idle || busy;
  }

  /** The reference's settled archive shot: a long lens from high on the left. */
  private placeCamera() {
    const yaw = THREE.MathUtils.degToRad(59);
    const elevation = THREE.MathUtils.degToRad(19);
    const distance = 140;
    const span = 7.33;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    // Narrow windows keep the width of a 16:9 frame.
    const viewSpan = Math.max(span, (span * (16 / 9)) / aspect);
    const aim = AIM;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
    this.camera.position.copy(aim).addScaledVector(dir, distance);
    this.camera.lookAt(aim);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewSpan / (2 * distance)));
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + 5;
    fog.far = distance + 25;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}

const PAPER = "#efe8de";

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A square picture filling the tile (cropped to its middle). */
function drawCover(c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const s = Math.min(w, h);
  c.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, x, y, size, size);
}

/** A plain printed cover for songs without one: the title on paper. */
function drawTitle(c: CanvasRenderingContext2D, title: string, x: number, y: number, size: number) {
  c.save();
  c.fillStyle = PAPER;
  c.fillRect(x, y, size, size);
  c.fillStyle = "#2a2924";
  c.fillRect(x + size * 0.08, y + size * 0.1, size * 0.84, Math.max(1, size * 0.02));
  const font = Math.round(size * 0.14);
  c.font = `700 ${font}px -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  c.textBaseline = "top";
  const max = size * 0.84;
  const lines: string[] = [];
  let line = "";
  for (const ch of Array.from(title.trim())) {
    if (c.measureText(line + ch).width > max && line) {
      lines.push(line);
      line = ch.trim() ? ch : "";
      if (lines.length === 4) break;
    } else line += ch;
  }
  if (lines.length < 4 && line) lines.push(line);
  lines.forEach((l, i) => c.fillText(l, x + size * 0.08, y + size * 0.2 + i * font * 1.2, max));
  c.restore();
}

/** Covers of the array: a tile of the atlas per box, under a frosted veil. */
function coverMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.5, envMapIntensity: 0.5 });
  // Half a texel in from the tile's edge, so neighbours do not bleed in.
  const scale = ((TILE - 1) / ATLAS).toFixed(6);
  const inset = (0.5 / ATLAS).toFixed(6);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec3 coverSlot;\nvarying float vCover;\n" +
      shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\nvMapUv = vMapUv * ${scale} + coverSlot.xy + ${inset};\nvCover = coverSlot.z;`,
      );
    shader.fragmentShader =
      "varying float vCover;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        "if (vCover < 0.5) discard;\n#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.94, 0.91), 0.2);",
      );
  };
  return mat;
}

/** The chosen box's surfaces, tuned like the reference. */
function fullMaterial(name: string, source: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  const mat = source.clone() as THREE.MeshPhysicalMaterial;
  mat.envMapIntensity = 0.6;
  if (name === "Frosted_Polymer") {
    mat.color.set("#fffdfa");
    mat.transmission = 0.9;
    mat.thickness = 0.12;
    mat.roughness = 0.21;
    mat.ior = 1.46;
    mat.attenuationColor = new THREE.Color("#eee6df");
    mat.attenuationDistance = 2;
  }
  if (name === "Internal_Ceramic") {
    mat.color.set("#c7beb6");
    mat.roughness = 0.6;
  }
  if (name === "Printed_Label") mat.color.set("#eae5dc");
  if (name === "Ivory_Edges") {
    mat.color.set("#f0e7df");
    mat.roughness = 0.31;
    mat.transmission = 0.65;
    mat.thickness = 0.04;
  }
  if (name === "Optical_Diffuser") {
    mat.color.set("#e2dad4");
    mat.transmission = 0;
    mat.roughness = 0.7;
  }
  if (name === "Subsurface_Optics") {
    mat.color.set("#b9aba1");
    mat.roughness = 0.48;
    mat.metalness = 0.05;
  }
  if (name === "Optical_Edges") {
    mat.transmission = 0;
    mat.color.set("#d4c7be");
    mat.roughness = 0.26;
    mat.metalness = 0.08;
  }
  mat.userData.transmission = mat.transmission;
  return mat;
}

/** The array's simpler surfaces: opaque shells darkening towards the base. */
function arrayMaterial(name: string, full: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  const mat = full.clone();
  if (name === "Frosted_Polymer") {
    mat.transparent = false;
    mat.color.set("#fff7ed");
    mat.roughness = 0.28;
    mat.clearcoat = 0.3;
    mat.clearcoatRoughness = 0.25;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying float vPanelHeight;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPanelHeight = position.y / 3.7;");
      shader.fragmentShader =
        "varying float vPanelHeight;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.40, 0.30, 0.20), vec3(1.0, 0.98, 0.94), smoothstep(0.1, 1.0, vPanelHeight));",
        );
    };
  }
  if (name === "Optical_Diffuser") mat.color.set("#806447");
  if (name === "Ivory_Edges") {
    mat.transmission = 0;
    mat.color.set("#fff5e9");
    mat.roughness = 0.38;
  }
  if (name === "Index_Inlay") {
    mat.color.set("#e4d6c5");
    mat.metalness = 0.05;
  }
  return mat;
}

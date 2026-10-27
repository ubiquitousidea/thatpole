import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Canvas textures for the lo-fi look: tiny canvases sampled with nearest
// filtering, ordered dithering into coarse color steps, and pixel-font text.

export const FONT = '"Press Start 2P", monospace';
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function canvasTexture(w, h, draw, repeat = null) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  tex.userData.ctx = ctx;
  return tex;
}

// A base color with random specks, dithered: floors, concrete, asphalt.
export function speckle(base, specks, seed, n = 64) {
  return (ctx) => {
    const rand = rngLocal(seed);
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const roll = rand();
      let c = base;
      let acc = 0;
      for (const [col, p] of specks) {
        acc += p;
        if (roll < acc) {
          c = col;
          break;
        }
      }
      const j = (rand() - 0.5) * 24;
      img.data.set([c[0] + j, c[1] + j, c[2] + j, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    dither(ctx, n, n, 12);
  };
}

export function dither(ctx, w, h, step) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const th = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * step;
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] + th) / step) * step));
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function text(ctx, s, x, y, color, size = 8, align = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
}

// A route bullet: a filled circle with a letter, like the N's yellow disc.
export function bullet(ctx, x, y, r, fill, letter, ink = '#111') {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, letter, x + 0.5, y - 3.5, ink, 8, 'center');
}

function rngLocal(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Flat-shaded standard material, cached by its settings.
const cache = new Map();
export function std(color, roughness = 0.8, metalness = 0, extra = {}) {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra }));
  return cache.get(key);
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
// A box from corner ranges: box(parent, mat, [x0, x1], [y0, y1], [z0, z1]).
export function box(parent, material, xr, yr, zr) {
  const m = new THREE.Mesh(UNIT_BOX, material);
  m.scale.set(Math.abs(xr[1] - xr[0]), Math.abs(yr[1] - yr[0]), Math.abs(zr[1] - zr[0]));
  m.position.set((xr[0] + xr[1]) / 2, (yr[0] + yr[1]) / 2, (zr[0] + zr[1]) / 2);
  parent.add(m);
  return m;
}

// A textured rectangle facing +z (rotate it to face elsewhere).
export function panel(parent, tex, w, h, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    opts.basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, ...opts.mat }),
  );
  parent.add(m);
  return m;
}

// Bake a group's direct mesh children into one mesh per material, to cut draw
// calls. Nested groups (doors) and instanced meshes are left alone.
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    const geo = child.geometry.clone();
    geo.applyMatrix4(m.multiplyMatrices(inv, child.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!byMat.has(child.material)) byMat.set(child.material, { geos: [], order: child.renderOrder });
    byMat.get(child.material).geos.push(geo);
    group.remove(child);
  }
  for (const [material, { geos, order }] of byMat) {
    const mesh = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos), material);
    mesh.renderOrder = order;
    group.add(mesh);
  }
  return group;
}

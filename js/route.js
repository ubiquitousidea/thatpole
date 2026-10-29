import * as THREE from 'three';
import { trackY, PORTAL, RIVER, ROUTE_LEN, rng } from './ride.js';
import { canvasTexture, speckle, text, bullet, std, box, panel, mergeStatic } from './pixels.js';
import { CAR } from './layout.js';
import { QBP_PLATFORM, LEX_PLATFORM, QBP_STAIRS, SEVEN_X, RISE, STEPS, LANDING, GATE } from './stations.js';

// Everything outside the car, laid out along the track: track position u runs
// along local -z, and heights are absolute (the street is at STREET). The car
// stays at the origin, so the whole route group slides by (0, -trackY(u), u).

const STREET = -7;
const CUT_X = 2.8; // the outer face of the retaining walls in the cut
// The street leaves the trench open from where the track drops into the cut
// until the car's roof is below the street, past the portal, so the ground
// never slices through the car on the way down.
const CUT_U0 = firstU(0, (u) => trackY(u) < STREET + 1);
const CUT_U1 = firstU(PORTAL, (u) => trackY(u) < STREET - CAR.height - 0.5);
const TUNNEL_HALF = 2.3, TUNNEL_TOP = 4.2;
const STEP = 5; // tunnel segment length
const GREEN = new THREE.MeshBasicMaterial({ color: '#3dff6a' });
const AMBER = new THREE.MeshBasicMaterial({ color: '#ffcc22' });

export class Route {
  constructor() {
    this.group = new THREE.Group();
    this.rand = rng(21);
    this.queensboroPlaza();
    this.queens();
    this.elevated();
    this.tunnel();
    this.lexington();
  }

  // Slide the route so track position u is under the car.
  place(u) {
    this.group.position.set(0, -trackY(u), u);
  }

  // The lower level: an island platform on our left, the 7's track beyond
  // it, open air over Queens Plaza North on our right, and the upper level
  // overhead. Two stairways climb from the platform through the upper deck
  // to a locked gate.
  queensboroPlaza() {
    const g = new THREE.Group();
    const y = trackY(0);
    const P = QBP_PLATFORM;
    const concrete = new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, speckle([150, 148, 140], [[[110, 108, 100], 0.1]], 3), [8, 60]) });
    const yellow = std('#f2c230', 0.7);
    box(g, concrete, [P.x0, P.x1], [y - 0.5, y], [P.z0, P.z1]);
    box(g, yellow, [P.x1 - 0.5, P.x1], [y, y + 0.01], [P.z0, P.z1]);
    box(g, yellow, [P.x0, P.x0 + 0.5], [y, y + 0.01], [P.z0, P.z1]);
    // The upper level overhead: deck, cross girders, and columns outside the
    // tracks, with a hole over each stair. Its shade falls on the train.
    const steel = std('#45524c', 0.7, 0.3);
    const X0 = SEVEN_X - 2.7, X1 = 2.9;
    const hx0 = Math.min(...QBP_STAIRS.map((st) => st.x0)) - 0.15, hx1 = Math.max(...QBP_STAIRS.map((st) => st.x1)) + 0.15;
    const holes = QBP_STAIRS.map((st) => [st.z0 + st.dir * 3, st.z1].sort((a, b) => a - b));
    box(g, std('#5b625e', 0.9), [X0, hx0], [y + 4.7, y + RISE], [P.z0, P.z1]);
    box(g, std('#5b625e', 0.9), [hx1, X1], [y + 4.7, y + RISE], [P.z0, P.z1]);
    for (const [z0, z1] of around([P.z0, P.z1], holes)) box(g, std('#5b625e', 0.9), [hx0, hx1], [y + 4.7, y + RISE], [z0, z1]);
    for (let z = P.z0; z <= P.z1; z += 5) {
      if (holes.some(([a, b]) => z > a - 0.2 && z < b + 0.2)) {
        box(g, steel, [X0, hx0], [y + 4.35, y + 4.7], [z - 0.15, z + 0.15]);
        box(g, steel, [hx1, X1], [y + 4.35, y + 4.7], [z - 0.15, z + 0.15]);
      } else box(g, steel, [X0, X1], [y + 4.35, y + 4.7], [z - 0.15, z + 0.15]);
    }
    for (let z = P.z0 + 2.5; z <= P.z1; z += 10) {
      for (const x of [X0 + 0.2, X1 - 0.3]) box(g, steel, [x - 0.18, x + 0.18], [STREET, y + 4.7], [z - 0.18, z + 0.18]);
    }
    // Trackbeds and their edge girders: ours, and the 7's across the platform
    // (with its third rail; no 7 train today).
    for (const [x0, x1] of [[P.x1, X1 - 0.5], [X0 + 0.5, P.x0]]) {
      box(g, std('#3a332d', 1), [x0, x1], [y - 1.4, y - 1.0], [P.z0, P.z1]);
    }
    for (const x of [X1 - 0.5, X0 + 0.5]) box(g, steel, [x - 0.15, x + 0.15], [y - 1.9, y - 0.7], [P.z0, P.z1]);
    for (const x of [-0.72, 0.72, SEVEN_X - 0.72, SEVEN_X + 0.72]) box(g, std('#7c7c80', 0.4, 0.7), [x - 0.04, x + 0.04], [y - 1.0, y - 0.88], [P.z0 - 40, P.z1]);
    box(g, std('#7c7c80', 0.4, 0.7), [SEVEN_X - 1.45, SEVEN_X - 1.35], [y - 1.0, y - 0.8], [P.z0, P.z1]);
    box(g, std('#c9b98a', 0.8), [SEVEN_X - 1.5, SEVEN_X - 1.3], [y - 0.78, y - 0.74], [P.z0, P.z1]);
    // Station signs hanging from the upper deck, readable from the train.
    const sign = canvasTexture(140, 18, (c) => {
      c.fillStyle = '#111';
      c.fillRect(0, 0, 140, 18);
      c.fillStyle = '#fff';
      c.fillRect(0, 1, 140, 1);
      text(c, 'QUEENSBORO PLAZA', 4, 6, '#fff');
      bullet(c, 120, 10, 6, '#fccc0a', 'N');
      bullet(c, 133, 10, 6, '#fccc0a', 'W');
    });
    const sx = P.x1 - 1.2;
    for (let z = P.z0 + 8; z < P.z1; z += 16) {
      const m = panel(g, sign, 2.8, 0.36, { basic: true });
      m.position.set(sx + 0.01, y + 3.2, z);
      m.rotation.y = Math.PI / 2;
      const back = panel(g, sign, 2.8, 0.36, { basic: true });
      back.position.set(sx - 0.01, y + 3.2, z);
      back.rotation.y = -Math.PI / 2;
      box(g, steel, [sx - 0.02, sx + 0.02], [y + 3.38, y + 4.35], [z - 1.2, z - 1.15]);
      box(g, steel, [sx - 0.02, sx + 0.02], [y + 3.38, y + 4.35], [z + 1.15, z + 1.2]);
    }
    // A couple of platform benches down the middle.
    const bx = (hx0 + hx1) / 2;
    for (const z of [-32, 32]) {
      box(g, std('#7a5232', 0.8), [bx - 0.35, bx + 0.35], [y + 0.42, y + 0.48], [z - 1, z + 1]);
      box(g, steel, [bx - 0.25, bx + 0.25], [y, y + 0.42], [z - 0.9, z - 0.8]);
      box(g, steel, [bx - 0.25, bx + 0.25], [y, y + 0.42], [z + 0.8, z + 0.9]);
    }
    for (const st of QBP_STAIRS) stairway(g, st, y, steel);
    this.group.add(shade(mergeStatic(g)));
  }

  // Street, buildings and the Queensboro Bridge around the elevated stretch.
  queens() {
    const g = new THREE.Group();
    const asphalt = new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, speckle([70, 72, 76], [[[50, 50, 54], 0.1], [[100, 100, 100], 0.04]], 9), [1, 1]) });
    // The street, in pieces around the open trench (z runs 300 to -900).
    ground(g, asphalt, -300, -CUT_X, -900, 300);
    ground(g, asphalt, CUT_X, 300, -900, 300);
    ground(g, asphalt, -CUT_X, CUT_X, -CUT_U0, 300);
    ground(g, asphalt, -CUT_X, CUT_X, -900, -CUT_U1);
    const facades = ['#8c4a3a', '#a86a4a', '#7a6a5a', '#b9a68a', '#5f6870', '#9a8f86'].map((c, i) => facade(c, 31 + i));
    const rand = this.rand;
    for (let z = 120; z > -PORTAL - 200; z -= 14 + rand() * 10) {
      for (const s of [-1, 1]) {
        if (rand() < 0.15) continue;
        const w = 10 + rand() * 14, d = 10 + rand() * 12, h = 8 + rand() * (rand() < 0.2 ? 60 : 22);
        const x = s * (16 + rand() * 30 + w / 2);
        const tex = facades[Math.floor(rand() * facades.length)].clone();
        tex.repeat.set(Math.max(1, Math.round(d / 4)), Math.max(1, Math.round(h / 3.5)));
        tex.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: tex }));
        m.position.set(x, STREET + h / 2, z);
        g.add(m);
      }
    }
    // Manhattan skyline across the river, far ahead.
    for (let i = 0; i < 40; i++) {
      const h = 30 + rand() * 120;
      const m = new THREE.Mesh(new THREE.BoxGeometry(14 + rand() * 20, h, 14 + rand() * 20), std(rand() < 0.5 ? '#6f7f93' : '#8796a8', 1));
      m.position.set(-200 + rand() * 400, STREET + h / 2, -900 - rand() * 300);
      g.add(m);
    }
    // The Queensboro Bridge off to the left: towers and a truss deck.
    const steel = std('#5a6b70', 0.8, 0.2);
    const bx = -70;
    for (let z = -100; z > -1000; z -= 150) box(g, steel, [bx - 6, bx + 6], [STREET, STREET + 55], [z - 3, z + 3]);
    box(g, steel, [bx - 9, bx + 9], [STREET + 22, STREET + 30], [-1000, 0]);
    for (let z = 0; z > -1000; z -= 6) box(g, steel, [bx - 9.3, bx - 8.9], [STREET + 22, STREET + 30], [z - 0.2, z + 0.2]);
    this.group.add(mergeStatic(g));
  }

  // The structure carrying the track from the station down the ramp, then
  // retaining walls in the cut and the concrete portal.
  elevated() {
    const g = new THREE.Group();
    const steel = std('#45524c', 0.7, 0.3);
    const concrete = std('#8d8a82', 1);
    for (let u = 60; u < PORTAL; u += STEP) {
      const y = trackY(u + STEP / 2);
      const z = -u - STEP / 2;
      box(g, std('#3a332d', 1), [-2.2, 2.2], [y - 1.4, y - 1.0], [z - STEP / 2, z + STEP / 2]);
      for (const s of [-1, 1]) box(g, steel, [s * 1.9, s * 2.2], [y - 1.9, y - 0.7], [z - STEP / 2, z + STEP / 2]);
      if (y - 1.9 > STREET && u % 15 === 0) {
        for (const s of [-1, 1]) box(g, steel, [s * 1.9, s * 2.3], [STREET, y - 1.9], [z - 0.2, z + 0.2]);
      }
      if (y < STREET + 1) for (const s of [-1, 1]) box(g, concrete, [s * 2.4, s * 2.8], [y - 1.4, STREET + 1], [z - STEP / 2, z + STEP / 2]);
    }
    const y = trackY(PORTAL);
    for (const s of [-1, 1]) box(g, concrete, [s * TUNNEL_HALF, s * 9], [y - 1.4, STREET + 3], [-PORTAL, -PORTAL + 1]);
    box(g, concrete, [-TUNNEL_HALF, TUNNEL_HALF], [y + TUNNEL_TOP, STREET + 3], [-PORTAL, -PORTAL + 1]);
    this.group.add(shade(mergeStatic(g)));
  }

  // Tunnel segments from the portal to Lex: walls, roof, invert, cables,
  // passing lamps and signals. Cast-iron rings under the river.
  tunnel() {
    const segs = [];
    for (let u = PORTAL; u < ROUTE_LEN + 140; u += STEP) {
      if (u > ROUTE_LEN - 80 && u < ROUTE_LEN + 75) continue; // the station
      segs.push(u);
    }
    const wallTex = canvasTexture(32, 32, speckle([84, 80, 74], [[[58, 55, 50], 0.18], [[110, 104, 96], 0.05]], 17), [2, 2]);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const parts = [
      { x: [-TUNNEL_HALF - 0.3, -TUNNEL_HALF], y: [-1.4, TUNNEL_TOP], mat: wallMat },
      { x: [TUNNEL_HALF, TUNNEL_HALF + 0.3], y: [-1.4, TUNNEL_TOP], mat: wallMat },
      { x: [-TUNNEL_HALF, TUNNEL_HALF], y: [TUNNEL_TOP, TUNNEL_TOP + 0.3], mat: wallMat },
      { x: [-TUNNEL_HALF, TUNNEL_HALF], y: [-1.6, -1.0], mat: std('#2c2824', 1) },
      { x: [-TUNNEL_HALF + 0.02, -TUNNEL_HALF + 0.08], y: [1.2, 1.32], mat: std('#141414', 1) },
      { x: [-TUNNEL_HALF + 0.02, -TUNNEL_HALF + 0.08], y: [1.45, 1.55], mat: std('#141414', 1) },
      { x: [TUNNEL_HALF - 0.08, TUNNEL_HALF - 0.02], y: [2.6, 2.7], mat: std('#141414', 1) },
      { x: [-TUNNEL_HALF, -1.6], y: [-1.0, -0.2], mat: std('#4a4642', 1) }, // bench wall
    ];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const dir = new THREE.Vector3(), FWD = new THREE.Vector3(0, 0, -1);
    const segPose = (u) => {
      const y0 = trackY(u), y1 = trackY(u + STEP);
      dir.set(0, y1 - y0, -STEP).normalize();
      q.setFromUnitVectors(FWD, dir);
      return (y0 + y1) / 2;
    };
    for (const part of parts) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geo, part.mat, segs.length);
      segs.forEach((u, i) => {
        const y = segPose(u);
        p.set((part.x[0] + part.x[1]) / 2, y + (part.y[0] + part.y[1]) / 2, -u - STEP / 2);
        sc.set(part.x[1] - part.x[0], part.y[1] - part.y[0], STEP + 0.02);
        mesh.setMatrixAt(i, m.compose(p, q, sc));
      });
      this.group.add(mesh);
    }
    // Ribs every few meters under the river, lamps every 20 m, signals every 150 m.
    const ribs = [], lamps = [], signals = [];
    for (let u = PORTAL + 10; u < ROUTE_LEN + 140; u += 3) {
      if (u > ROUTE_LEN - 80 && u < ROUTE_LEN + 75) continue;
      if (u > RIVER.u0 && u < RIVER.u1) ribs.push(u);
    }
    for (let u = PORTAL + 15; u < ROUTE_LEN + 140; u += 20) if (u < ROUTE_LEN - 80 || u > ROUTE_LEN + 75) lamps.push(u);
    for (let u = PORTAL + 60; u < ROUTE_LEN - 80; u += 150) signals.push(u);
    const ribMat = std('#3c3530', 0.9, 0.2);
    const ribGeo = new THREE.BoxGeometry(1, 1, 1);
    const ribMesh = new THREE.InstancedMesh(ribGeo, ribMat, ribs.length * 3);
    ribs.forEach((u, i) => {
      const y = trackY(u);
      q.identity();
      for (const [k, x, yy, w, h] of [[0, -TUNNEL_HALF + 0.06, y + 1.4, 0.12, 5.6], [1, TUNNEL_HALF - 0.06, y + 1.4, 0.12, 5.6], [2, 0, y + TUNNEL_TOP - 0.06, 4.6, 0.12]]) {
        ribMesh.setMatrixAt(i * 3 + k, m.compose(p.set(x, yy, -u), q, sc.set(w, h, 0.25)));
      }
    });
    this.group.add(ribMesh);
    const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: '#fff2c0' }), lamps.length);
    lamps.forEach((u, i) => {
      const s = i % 2 ? 1 : -1;
      lampMesh.setMatrixAt(i, m.compose(p.set(s * (TUNNEL_HALF - 0.08), trackY(u) + 2.2, -u), q.identity(), sc.set(1, 1, 1)));
    });
    this.group.add(lampMesh);
    const sig = new THREE.Group();
    for (const u of signals) {
      const y = trackY(u);
      box(sig, std('#111', 1), [TUNNEL_HALF - 0.25, TUNNEL_HALF - 0.05], [y + 0.6, y + 1.3], [-u - 0.12, -u + 0.12]);
      box(sig, u % 300 < 150 ? GREEN : AMBER, [TUNNEL_HALF - 0.27, TUNNEL_HALF - 0.24], [y + 1.05, y + 1.17], [-u - 0.06, -u + 0.06]);
    }
    this.group.add(mergeStatic(sig));
  }

  // Lexington Av/59 St: platform on the left (-x), tiled walls with the name
  // in a mosaic band, painted columns and fluorescent strips.
  lexington() {
    const g = new THREE.Group();
    const y = trackY(ROUTE_LEN);
    const P = LEX_PLATFORM;
    const zc = -ROUTE_LEN;
    const concrete = new THREE.MeshLambertMaterial({ map: canvasTexture(64, 64, speckle([140, 138, 132], [[[100, 98, 92], 0.1]], 4), [6, 80]) });
    box(g, concrete, [P.x0, P.x1], [y - 1.4, y], [zc + P.z0, zc + P.z1]);
    box(g, std('#f2c230', 0.7), [P.x1 - 0.5, P.x1], [y, y + 0.01], [zc + P.z0, zc + P.z1]);
    box(g, std('#2c2824', 1), [P.x1, 2.3], [y - 1.6, y - 1.0], [zc + P.z0, zc + P.z1]);
    const tiles = tileTexture();
    const band = mosaicTexture();
    for (const [x, face] of [[P.x0, 1], [2.6, -1]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(P.z1 - P.z0, 5.6), new THREE.MeshLambertMaterial({ map: tiles }));
      wall.position.set(x, y + (face > 0 ? 1.8 : 1.4), zc);
      wall.rotation.y = face * Math.PI / 2;
      g.add(wall);
      for (let z = P.z0 + 6; z < P.z1; z += 12) {
        const m = panel(g, band, 3.2, 0.5, { mat: { roughness: 0.9 } });
        m.position.set(x + face * 0.01, y + 1.9, zc + z);
        m.rotation.y = face * Math.PI / 2;
      }
    }
    box(g, std('#d8d4c8', 1), [P.x0, 2.6], [y + 3.9, y + 4.1], [zc + P.z0, zc + P.z1]);
    for (let z = P.z0 + 2.5; z < P.z1; z += 5) {
      box(g, std('#3d5a73', 0.6, 0.2), [-3.3, -3.0], [y, y + 3.9], [zc + z - 0.15, zc + z + 0.15]);
      box(g, new THREE.MeshBasicMaterial({ color: '#fdfbe8' }), [-5.5, -5.3], [y + 3.85, y + 3.9], [zc + z - 1.2, zc + z + 1.2]);
    }
    this.group.add(mergeStatic(g));
  }
}

// The pieces of the range [z0, z1] outside the sorted holes [a, b].
function around([z0, z1], holes) {
  const out = [];
  let z = z0;
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (a > z) out.push([z, a]);
    z = Math.max(z, b);
  }
  if (z < z1) out.push([z, z1]);
  return out;
}

// One stairway from the platform (at y) up through the upper deck: solid
// steps, stepped walls a meter above them, handrails, the space under the
// landing walled off, a rail around the hole in the deck, and a locked gate
// on the landing with a sign.
function stairway(g, st, y, steel) {
  const wall = std('#8d8a82', 1), step = std('#76736c', 0.95), nosing = std('#c9a23c', 0.8);
  const len = Math.abs(st.z1 - st.z0), run = len / STEPS, rise = RISE / STEPS;
  const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  for (let k = 0; k < STEPS; k++) {
    const za = st.z0 + st.dir * k * run, zb = za + st.dir * run;
    const top = y + (k + 1) * rise;
    box(g, step, [st.x0, st.x1], [y, top], span(za, zb));
    box(g, nosing, [st.x0, st.x1], [top, top + 0.01], span(za, za + st.dir * 0.05));
    for (const xr of [[st.x0 - 0.15, st.x0], [st.x1, st.x1 + 0.15]]) box(g, wall, xr, [y, top + 1.0], span(za, zb));
  }
  // Handrails along the walls, rising with the steps.
  const ang = Math.atan2(RISE, len);
  for (const x of [st.x0 + 0.05, st.x1 - 0.05]) {
    const rail = box(g, steel, [-0.025, 0.025], [-0.025, 0.025], [-len / 2 / Math.cos(ang), len / 2 / Math.cos(ang)]);
    rail.position.set(x, y + RISE / 2 + 0.9, (st.z0 + st.z1) / 2);
    rail.rotation.x = -st.dir * ang;
  }
  // Under the landing, and the landing's walls up to the gate.
  const far = st.z1 + st.dir * LANDING;
  box(g, wall, [st.x0 - 0.15, st.x1 + 0.15], [y, y + 4.7], span(st.z1, far));
  for (const xr of [[st.x0 - 0.15, st.x0], [st.x1, st.x1 + 0.15]]) box(g, wall, xr, [y + RISE, y + RISE + 1.0], span(st.z1, far));
  // A rail across the low end of the hole in the deck.
  const hole = st.z0 + st.dir * 3;
  box(g, steel, [st.x0 - 0.15, st.x1 + 0.15], [y + RISE, y + RISE + 1.0], span(hole, hole - st.dir * 0.05));
  // The gate: bars between two rails, and the sign facing the stairs.
  const gz = st.z1 + st.dir * (GATE + 0.05);
  const gr = span(gz - 0.02, gz + 0.02);
  for (const yy of [0.1, 1.0, 1.95]) box(g, steel, [st.x0, st.x1], [y + RISE + yy, y + RISE + yy + 0.05], gr);
  for (let x = st.x0 + 0.06; x < st.x1; x += 0.12) box(g, steel, [x - 0.015, x + 0.015], [y + RISE, y + RISE + 2.0], gr);
  const tex = canvasTexture(64, 16, (c) => {
    c.fillStyle = '#b5181c';
    c.fillRect(0, 0, 64, 16);
    text(c, 'NO ENTRY', 32, 4, '#fff', 8, 'center');
  });
  const m = panel(g, tex, 1.0, 0.25, { basic: true });
  m.position.set((st.x0 + st.x1) / 2, y + RISE + 1.4, gz - st.dir * 0.04);
  m.rotation.y = st.dir > 0 ? Math.PI : 0;
}

function firstU(from, test) {
  let u = from;
  while (!test(u)) u += 1;
  return u;
}

// A flat patch of ground at street level, x0..x1 by z0..z1, its texture tiled
// in world space (one tile per 7.5 m) so the patches line up.
function ground(g, mat, x0, x1, z0, z1) {
  const T = 7.5;
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / T, (z1 - uv.getY(i) * (z1 - z0)) / T); // +v runs toward -z
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, STREET, (z0 + z1) / 2);
  g.add(m);
}

// Structure near the track throws shade on the car and takes the car's.
function shade(group) {
  group.traverse((o) => {
    if (!o.isMesh || o.material.isMeshBasicMaterial) return;
    o.castShadow = o.receiveShadow = true;
  });
  return group;
}

function facade(color, seed) {
  return canvasTexture(16, 16, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 16, 16);
    const rand = rng(seed);
    for (let y = 3; y < 15; y += 6) {
      for (let x = 2; x < 16; x += 7) {
        c.fillStyle = rand() < 0.25 ? '#e8d48a' : '#2b3440';
        c.fillRect(x, y, 4, 4);
      }
    }
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(0, 0, 16, 1);
  }, [1, 1]);
}

function tileTexture() {
  return canvasTexture(16, 16, (c) => {
    c.fillStyle = '#eeeadf';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#c9c4b6';
    for (let i = 0; i < 16; i += 4) {
      c.fillRect(0, i, 16, 1);
      c.fillRect((i / 4) % 2 ? 2 : 0, i, 1, 4);
    }
    for (let x = 4; x < 16; x += 4) for (let y = 0; y < 16; y += 4) c.fillRect(x + ((y / 4) % 2 ? 2 : 0), y, 1, 4);
  }, [60, 22]);
}

// The station name in a tile mosaic band with a border.
function mosaicTexture() {
  return canvasTexture(160, 26, (c) => {
    c.fillStyle = '#7a3b2e';
    c.fillRect(0, 0, 160, 26);
    for (let x = 0; x < 160; x += 4) {
      c.fillStyle = (x / 4) % 2 ? '#c9a23c' : '#2f5e57';
      c.fillRect(x, 0, 4, 3);
      c.fillRect(x, 23, 4, 3);
    }
    c.fillStyle = '#f4efe2';
    c.fillRect(4, 5, 152, 16);
    text(c, 'LEXINGTON AV', 80, 5, '#1b1b1b', 8, 'center');
    text(c, '59 ST', 80, 13, '#1b1b1b', 8, 'center');
  });
}

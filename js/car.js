import * as THREE from 'three';
import { CAR, DOOR_Z, DOOR_HALF, BENCHES, SEATS, POLES, SEAT_H, SEAT_W, POLE_X } from './layout.js';
import { canvasTexture, speckle, text, bullet, std, box, panel, mergeStatic } from './pixels.js';

// The R68 car the player rides, built from the floor plan in layout.js, plus
// plain shells for the cars ahead and behind. The car stays put at the world
// origin and the route scrolls past outside.

const H = CAR.height;
const WALL_TOP = 2.0;     // where the side wall meets the ceiling cove
const SILL = 0.95, LINTEL = 1.75; // window band
const DOOR_H = 1.9;
const RAIL_Y = 1.92;
// The N's R68 scheme: orange and yellow bucket seats on cream frames, warm
// stainless walls, a cream ceiling and a dark, glossy floor.
const COLORS = {
  wall: '#bdb49c', shell: '#aab0b7', ceiling: '#eee7d2', seatEnd: '#c9c0a6',
  pole: '#dcdad2', rubber: '#1d1f22', skirt: '#d6cca3',
};
const SEAT_COLORS = ['#f07c1c', '#f5bf26']; // orange, yellow, alternating in pairs
const ADS = [
  ['ONE SEAT', 'PER PERSON', 'PLEASE', '#ffd34d', '#1b1b3a'],
  ['HOLD ON.', 'TRAINS', 'STOP SHORT', '#ff6b4a', '#ffffff'],
  ['LEARN TO', 'CODE IN', '6 WEEKS!', '#2d6cdf', '#ffffff'],
  ['MATTRESS', 'MEGA SALE', '70% OFF', '#7a2ea0', '#ffe36e'],
  ['HURT?', 'CALL', '1-800-OUCH', '#111111', '#ffcf3f'],
  ['DONT LEAN', 'ON THE', 'POLE', '#e8e8e8', '#c4161c'],
];

export function buildCar() {
  const group = new THREE.Group();
  const M = {
    wall: std(COLORS.wall, 0.6, 0.1),
    shell: std(COLORS.shell, 0.4, 0.55),
    ceiling: std(COLORS.ceiling, 0.9),
    seats: SEAT_COLORS.map((c) => std(c, 0.35)),
    seatEnd: std(COLORS.seatEnd, 0.6, 0, { emissive: '#4a4536' }),
    pole: std(COLORS.pole, 0.35, 0.15, { emissive: '#6a675e' }),
    rubber: std(COLORS.rubber, 0.9),
    skirt: std(COLORS.skirt, 0.8),
    glass: new THREE.MeshStandardMaterial({ color: '#9fb4c4', transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: '#fff3d4' }),
  };

  // Floor: speckled gray, dithered.
  const floorTex = canvasTexture(64, 64, speckle([46, 48, 54], [[[30, 31, 36], 0.12], [[96, 98, 104], 0.04]], 5), [4, 26]);
  box(group, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.3, metalness: 0.1 }), [-CAR.halfW, CAR.halfW], [-0.06, 0], [-CAR.halfL, CAR.halfL]);
  // Yellow-ish door thresholds.
  for (const z of DOOR_Z) for (const s of [-1, 1]) {
    box(group, std('#8a8f96', 0.4, 0.6), [s * (CAR.halfW - 0.12), s * CAR.outerHalfW], [-0.05, 0.004], [z - DOOR_HALF, z + DOOR_HALF]);
  }

  // Ceiling and coves.
  box(group, M.ceiling, [-0.9, 0.9], [H, H + 0.04], [-CAR.halfL, CAR.halfL]);
  const coveLen = Math.hypot(CAR.halfW - 0.9, H - WALL_TOP), coveAng = Math.atan2(H - WALL_TOP, CAR.halfW - 0.9);
  for (const s of [-1, 1]) {
    const cove = box(group, M.ceiling, [-coveLen / 2, coveLen / 2], [0, 0.04], [-CAR.halfL, CAR.halfL]);
    cove.position.set(s * (CAR.halfW + 0.9) / 2, (H + WALL_TOP) / 2, 0);
    cove.rotation.z = -s * coveAng;
    // LED light strip along the ceiling edge.
    box(group, M.light, [s * 0.62, s * 0.8], [H - 0.02, H], [-CAR.halfL + 0.4, CAR.halfL - 0.4]);
  }

  // Side walls: solid lower and upper bands with windows between, door
  // openings with a header, and the doors themselves.
  const doors = [];
  for (const s of [-1, 1]) {
    const xr = [s * CAR.halfW, s * CAR.outerHalfW];
    BENCHES.forEach((b) => {
      box(group, M.wall, xr, [0, SILL], [b.z0, b.z1]);
      box(group, M.wall, xr, [LINTEL, WALL_TOP], [b.z0, b.z1]);
      box(group, M.shell, [s * CAR.outerHalfW, s * (CAR.outerHalfW + 0.01)], [-0.6, SILL], [b.z0, b.z1]);
      box(group, M.shell, [s * CAR.outerHalfW, s * (CAR.outerHalfW + 0.01)], [LINTEL, WALL_TOP], [b.z0, b.z1]);
      // Pillars split the band into windows of about 1.4 m.
      const len = b.z1 - b.z0, n = Math.max(1, Math.round(len / 1.6));
      const posts = [b.z0, ...Array.from({ length: n - 1 }, (_, i) => b.z0 + ((i + 1) * len) / n), b.z1];
      for (const z of posts) box(group, M.wall, xr, [SILL, LINTEL], [z - 0.09, z + 0.09]);
      const glass = box(group, M.glass, [s * (CAR.halfW + 0.05), s * (CAR.halfW + 0.07)], [SILL, LINTEL], [b.z0, b.z1]);
      glass.renderOrder = 2;
    });
    for (const z of DOOR_Z) {
      box(group, M.wall, xr, [DOOR_H, WALL_TOP], [z - DOOR_HALF, z + DOOR_HALF]);
      for (const dir of [-1, 1]) {
        const leaf = doorLeaf(M);
        leaf.position.set(s * (CAR.halfW + 0.075), 0, z + dir * DOOR_HALF / 2);
        group.add(leaf);
        doors.push({ leaf, side: s, z, dir });
      }
    }
  }

  // End walls with storm-door windows.
  for (const e of [-1, 1]) {
    const zr = [e * CAR.halfL, e * (CAR.halfL + 0.12)];
    box(group, M.wall, [-CAR.outerHalfW, -0.45], [0, H + 0.05], zr);
    box(group, M.wall, [0.45, CAR.outerHalfW], [0, H + 0.05], zr);
    box(group, M.wall, [-0.45, 0.45], [0, 1.0], zr);
    box(group, M.wall, [-0.45, 0.45], [1.75, H + 0.05], zr);
    box(group, std('#2a3540', 0.2), [-0.45, 0.45], [1.0, 1.75], zr);
  }

  // Roof and underframe, seen from the platform.
  box(group, M.shell, [-CAR.outerHalfW, CAR.outerHalfW], [H + 0.04, H + 0.35], [-CAR.halfL, CAR.halfL]);
  box(group, std('#26282c', 0.9), [-1.4, 1.4], [-0.9, -0.06], [-CAR.halfL + 0.5, CAR.halfL - 0.5]);

  // Seats: a bucket and backrest each, on a cream frame, colored in pairs.
  // Wall benches face across the car; the cross rows in each bay face along it.
  for (const seat of SEATS) {
    const s = seat.side, x = seat.x, z = seat.z;
    const seatMat = M.seats[Math.floor(seat.id / 2) % 2];
    const zr = [z - SEAT_W / 2 + 0.02, z + SEAT_W / 2 - 0.02];
    if (seat.kind === 'wall') {
      box(group, seatMat, [s * (CAR.halfW - 0.47), s * (CAR.halfW - 0.02)], [SEAT_H - 0.05, SEAT_H], zr);
      const back = box(group, seatMat, [s * (CAR.halfW - 0.07), s * (CAR.halfW - 0.01)], [SEAT_H, SEAT_H + 0.48], zr);
      back.rotation.z = s * 0.08;
      box(group, M.skirt, [s * (CAR.halfW - 0.4), s * CAR.halfW], [0, SEAT_H - 0.05], zr);
    } else {
      const f = seat.facing, xr = [x - 0.21, x + 0.21];
      box(group, seatMat, xr, [SEAT_H - 0.05, SEAT_H], [z - 0.22, z + 0.22]);
      const back = box(group, seatMat, xr, [SEAT_H, SEAT_H + 0.5], [z - f * 0.25 - 0.03, z - f * 0.25 + 0.03]);
      back.rotation.x = -f * 0.1;
      box(group, M.skirt, [x - 0.18, x + 0.18], [0, SEAT_H - 0.05], [z - 0.18, z + 0.18]);
    }
  }
  for (const p of POLES) {
    box(group, M.pole, [p.x - 0.022, p.x + 0.022], [0, H], [p.z - 0.022, p.z + 0.022]);
    if (Math.abs(p.x) === POLE_X) {
      const s = Math.sign(p.x);
      box(group, M.seatEnd, [s * (POLE_X + 0.03), s * CAR.halfW], [0.15, 1.2], [p.z - 0.015, p.z + 0.015]);
    }
  }
  // Overhead grab rails in front of each bench.
  for (const s of [-1, 1]) {
    for (const b of BENCHES) {
      box(group, M.pole, [s * 0.53, s * 0.57], [RAIL_Y, RAIL_Y + 0.04], [b.z0 + 0.1, b.z1 - 0.1]);
      for (const z of [b.z0 + 0.15, b.z1 - 0.15]) box(group, M.pole, [s * 0.54, s * 0.56], [RAIL_Y, H], [z - 0.01, z + 0.01]);
    }
  }

  // Ad cards on the upper wall, above the windows.
  BENCHES.forEach((b, i) => {
    for (const s of [-1, 1]) {
      const ad = ADS[(i * 2 + (s > 0 ? 1 : 0)) % ADS.length];
      const len = Math.min(1.4, b.z1 - b.z0 - 0.3);
      const m = panel(group, adTexture(ad), len, 0.22);
      m.position.set(s * (CAR.halfW - 0.005), (LINTEL + WALL_TOP) / 2, (b.z0 + b.z1) / 2);
      m.rotation.y = -s * Math.PI / 2;
    }
  });

  // Destination signs on the end bulkheads, over the storm door: the N's two
  // terminals and its bullet, as on the R68.
  const dest = destinationSign();
  for (const e of [-1, 1]) {
    const m = panel(group, dest, 1.15, 0.2, { basic: true });
    m.position.set(0, 1.98, e * (CAR.halfL - 0.01));
    m.rotation.y = e < 0 ? 0 : Math.PI;
  }

  // Route signs on the outside by the end doors: a yellow N bullet.
  const sign = canvasTexture(16, 16, (c) => {
    c.fillStyle = '#111';
    c.fillRect(0, 0, 16, 16);
    bullet(c, 8, 8, 7, '#fccc0a', 'N');
  });
  for (const s of [-1, 1]) {
    for (const z of [DOOR_Z[0] - 1.1, DOOR_Z[3] + 1.1]) {
      const m = panel(group, sign, 0.32, 0.32, { basic: true });
      m.position.set(s * (CAR.outerHalfW + 0.02), 1.55, z);
      m.rotation.y = s * Math.PI / 2;
    }
  }

  // The rest of the train: plain shells ahead and behind.
  const shellTex = canvasTexture(Math.round(CAR.halfL * 20), 26, carSide);
  const shellMats = [
    new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.45, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.45, metalness: 0.5 }),
    M.shell, M.shell, M.shell, M.shell,
  ];
  for (const k of [-2, -1, 1, 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(CAR.outerHalfW * 2, 2.6, CAR.halfL * 2), shellMats);
    m.position.set(0, 1.3 - 0.25, k * (CAR.halfL * 2 + 0.6));
    group.add(m);
  }

  mergeStatic(group);
  return {
    group,
    // side: -1, 1; open: 0 (shut) .. 1 (open)
    setDoors(side, open) {
      for (const d of doors) {
        const o = d.side === side ? open : 0;
        d.leaf.position.z = d.z + d.dir * (DOOR_HALF / 2 + o * (DOOR_HALF - 0.04));
      }
    },
    setLights(on) {
      M.light.color.set(on ? '#fff3d4' : '#55524a');
    },
  };
}

function doorLeaf(M) {
  const g = new THREE.Group();
  const w = DOOR_HALF;
  box(g, M.shell, [-0.03, 0.03], [0, 1.0], [-w / 2, w / 2]);
  box(g, M.shell, [-0.03, 0.03], [1.65, DOOR_H], [-w / 2, w / 2]);
  box(g, M.shell, [-0.03, 0.03], [1.0, 1.65], [-w / 2, -w / 2 + 0.08]);
  box(g, M.shell, [-0.03, 0.03], [1.0, 1.65], [w / 2 - 0.08, w / 2]);
  const glass = box(g, M.glass, [-0.01, 0.01], [1.0, 1.65], [-w / 2 + 0.08, w / 2 - 0.08]);
  glass.renderOrder = 2;
  return g;
}

function adTexture([a, b, c, bg, ink]) {
  return canvasTexture(96, 16, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 96, 16);
    text(ctx, a, 3, 1, ink, 8);
    text(ctx, `${b} ${c}`.slice(0, 11), 3, 9, ink, 8);
  });
}

// The R68's destination sign: black, with both terminals and the N bullet.
function destinationSign() {
  return canvasTexture(192, 34, (c) => {
    c.fillStyle = '#0d0d0f';
    c.fillRect(0, 0, 192, 34);
    c.fillStyle = '#2a2a30';
    c.fillRect(3, 16, 160, 1);
    text(c, 'Astoria Ditmars Blvd', 3, 4, '#f4f1e8');
    text(c, 'Coney Island', 3, 21, '#f4f1e8');
    bullet(c, 178, 17, 11, '#fccc0a', 'N');
  });
}

// The side of a stainless car: windows and doors on brushed steel.
function carSide(ctx, w, h) {
  ctx.fillStyle = '#a9afb6';
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 3) {
    ctx.fillStyle = x % 6 ? '#b3b9c0' : '#a1a7ae';
    ctx.fillRect(x, 0, 1, h);
  }
  const doors = DOOR_Z.map((z) => Math.round((z + CAR.halfL) * 10));
  ctx.fillStyle = '#1f262d';
  let x = 8;
  for (const d of doors) {
    for (; x + 12 < d - 7; x += 15) ctx.fillRect(x, 9, 12, 8);
    ctx.fillStyle = '#7d848c';
    ctx.fillRect(d - 7, 5, 13, 21);
    ctx.fillStyle = '#1f262d';
    ctx.fillRect(d - 5, 8, 4, 7);
    ctx.fillRect(d + 1, 8, 4, 7);
    x = d + 9;
  }
  for (; x + 12 < w - 4; x += 15) ctx.fillRect(x, 9, 12, 8);
}

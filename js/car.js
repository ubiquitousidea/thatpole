import * as THREE from 'three';
import { CAR, DOOR_Z, DOOR_HALF, BENCHES, BAYS, SEATS, POLES, SEAT_H, SEAT_W, SEAT_D, POLE_X, BAY_X, POD_TOP, RAIL_X, RAIL_Y } from './layout.js';
import { canvasTexture, speckle, dither, text, bullet, std, box, panel, mergeStatic } from './pixels.js';

// The R68 car the player rides, built from the floor plan in layout.js, plus
// the cars ahead and behind, which share its outside. The car stays put at the
// world origin and the route scrolls past outside.

const H = CAR.height;
const WALL_TOP = 2.0;     // where the side wall meets the ceiling cove
const SILL = 0.95, LINTEL = 1.75; // window band
const WIN_HALF = 0.8;     // one big window per door section, over the pod
const DOOR_H = 1.9;
// The outside: stainless skin from the skirt up to the eave, a sloped eave,
// then the roof. Car ends stand END_T proud of the inside end walls.
const OUT = CAR.outerHalfW, SKIN = OUT + 0.012;
const SKIRT_Y = -0.55, EAVE_Y = 2.08, ROOF_Y = 2.6, ROOF_X = 1.2;
const END_T = 0.135;
const RIBS = [-0.5, -0.44, -0.38, -0.32, -0.26, -0.2, SILL - 0.3, SILL - 0.24, SILL - 0.18]; // fluting
const TRUCK_Z = 8.0;      // truck centers, from the middle of the car
const GAP = 0.6;          // between cars
const NUMBERS = { '-2': 5492, '-1': 5491, 0: 5490, 1: 5489, 2: 5488 };
// The N's R68 scheme: wood-grain laminate walls, orange and yellow bucket
// seats on cream frames, a cream ceiling and a dark, glossy floor. Stainless
// outside.
const COLORS = {
  wood: '#8a5a32', shell: '#d4d8dc', rib: '#9ea4ab', roof: '#8d9298', ceiling: '#eee7d2', seatEnd: '#c9c0a6',
  pole: '#dcdad2', rubber: '#1d1f22', under: '#26282c',
};
const SEAT_COLORS = ['#f07c1c', '#f5bf26']; // orange, yellow, alternating
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
    wall: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6 }),
    shell: std(COLORS.shell, 0.45, 0.1),
    rib: std(COLORS.rib, 0.4, 0.1),
    roof: std(COLORS.roof, 0.6, 0.1),
    ceiling: std(COLORS.ceiling, 0.9),
    seats: SEAT_COLORS.map((c) => std(c, 0.35)),
    seatEnd: std(COLORS.seatEnd, 0.6, 0, { emissive: '#4a4536' }),
    pole: std(COLORS.pole, 0.35, 0.15, { emissive: '#6a675e' }),
    rubber: std(COLORS.rubber, 0.9),
    under: std(COLORS.under, 0.9),
    wheel: std('#3c3835', 0.6, 0.4),
    glass: new THREE.MeshStandardMaterial({ color: '#9fb4c4', transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }),
    dark: std('#2a3540', 0.2),
    light: new THREE.MeshBasicMaterial({ color: '#fff3d4' }),
    red: new THREE.MeshBasicMaterial({ color: '#d0201c' }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb030' }),
    head: new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
    lit: new THREE.MeshBasicMaterial({ color: '#4d463c' }),
    vent: new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.8 }),
    heater: new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.5, metalness: 0.3 }),
    flag: new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.7 }),
    route: new THREE.MeshBasicMaterial({ map: routeTexture() }),
  };
  const wood = { tile: 1.2 };

  // Floor: speckled gray, dithered.
  const floorTex = canvasTexture(64, 64, speckle([46, 48, 54], [[[30, 31, 36], 0.12], [[96, 98, 104], 0.04]], 5), [4, 26]);
  box(group, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.3, metalness: 0.1 }), [-CAR.halfW, CAR.halfW], [-0.06, 0], [-CAR.halfL, CAR.halfL]);
  // Door thresholds.
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

  // Side walls: wood-grain panels from the floor to the cove, with one big
  // window over each pod, door openings with a header, and the doors. The
  // leaves on one side that slide the same way move together, so they're
  // baked into one group per side and direction.
  const doors = [];
  for (const s of [-1, 1]) {
    const xr = [s * CAR.halfW, s * CAR.outerHalfW];
    for (const b of BENCHES) {
      box(group, M.wall, xr, [0, SILL], [b.z0, b.z1], wood);
      box(group, M.wall, xr, [LINTEL, WALL_TOP], [b.z0, b.z1], wood);
      if (b.end) {
        box(group, M.wall, xr, [SILL, LINTEL], [b.z0, b.z1], wood);
        continue;
      }
      box(group, M.wall, xr, [SILL, LINTEL], [b.z0, b.mid - WIN_HALF], wood);
      box(group, M.wall, xr, [SILL, LINTEL], [b.mid + WIN_HALF, b.z1], wood);
      gasket(group, M.rubber, s * (CAR.halfW - 0.012), s * CAR.halfW, b.mid, WIN_HALF, SILL, LINTEL);
      const glass = box(group, M.glass, [s * (CAR.halfW + 0.05), s * (CAR.halfW + 0.07)], [SILL, LINTEL], [b.mid - WIN_HALF, b.mid + WIN_HALF]);
      glass.renderOrder = 2;
    }
    for (const z of DOOR_Z) box(group, M.wall, xr, [DOOR_H, WALL_TOP], [z - DOOR_HALF, z + DOOR_HALF], wood);
    for (const dir of [-1, 1]) {
      const leaves = new THREE.Group();
      for (const z of DOOR_Z) doorLeaf(leaves, M, dir, s * (CAR.halfW + 0.06), z + dir * DOOR_HALF / 2);
      group.add(mergeStatic(leaves));
      doors.push({ leaves, side: s, dir });
    }
  }

  // End walls with storm-door windows.
  for (const e of [-1, 1]) {
    const zr = [e * CAR.halfL, e * (CAR.halfL + 0.12)];
    box(group, M.wall, [-CAR.outerHalfW, -0.45], [0, H + 0.05], zr, wood);
    box(group, M.wall, [0.45, CAR.outerHalfW], [0, H + 0.05], zr, wood);
    box(group, M.wall, [-0.45, 0.45], [0, 1.0], zr, wood);
    box(group, M.wall, [-0.45, 0.45], [1.75, H + 0.05], zr, wood);
    box(group, M.dark, [-0.45, 0.45], [1.0, 1.75], zr);
  }

  // Seats: orange and yellow buckets on cream frames, all hung off the wall
  // with nothing under them but the heater grille, as in the photo. Wall
  // benches face across the car. Each pod is two rows back to back, each
  // facing its bench, with a cream end panel at the aisle.
  for (const seat of SEATS) {
    const s = seat.side, x = seat.x, z = seat.z;
    if (seat.kind === 'wall') {
      const seatMat = M.seats[Math.floor((z + 20) / SEAT_W + 0.5) % 2];
      const zr = [z - SEAT_W / 2 + 0.015, z + SEAT_W / 2 - 0.015];
      box(group, seatMat, [s * (CAR.halfW - SEAT_D + 0.02), s * (CAR.halfW - 0.02)], [SEAT_H - 0.05, SEAT_H], zr);
      const back = box(group, seatMat, [s * (CAR.halfW - 0.07), s * (CAR.halfW - 0.01)], [SEAT_H, SEAT_H + 0.48], zr);
      back.rotation.z = s * 0.08;
    } else {
      const f = seat.facing, xr = [x - 0.205, x + 0.205];
      const seatMat = M.seats[(f > 0 ? 1 : 0) ^ (Math.abs(x) > 0.9 ? 1 : 0)];
      box(group, seatMat, xr, [SEAT_H - 0.05, SEAT_H], [z - 0.2, z + 0.2]);
      box(group, seatMat, xr, [SEAT_H - 0.05, POD_TOP - 0.05], [z - f * 0.26, z - f * 0.21]);
    }
  }
  // Each run of bench seats: a cream frame with a lip under the buckets, a cap
  // at each end, and the heater grille along the bottom of the wall.
  for (const run of benchRuns()) {
    const { s, z0, z1 } = run;
    box(group, M.seatEnd, [s * (CAR.halfW - SEAT_D), s * CAR.halfW], [SEAT_H - 0.11, SEAT_H - 0.05], [z0, z1]);
    box(group, M.seatEnd, [s * (CAR.halfW - SEAT_D), s * (CAR.halfW - SEAT_D + 0.025)], [SEAT_H - 0.11, SEAT_H + 0.01], [z0, z1]);
    box(group, M.heater, [s * (CAR.halfW - 0.14), s * CAR.halfW], [0.04, 0.32], [z0 + 0.05, z1 - 0.05], { tile: 0.12 });
    for (const z of [z0, z1]) {
      box(group, M.seatEnd, [s * (CAR.halfW - SEAT_D), s * CAR.halfW], [SEAT_H - 0.11, SEAT_H + 0.06], [z - 0.012, z + 0.012]);
      box(group, M.seatEnd, [s * (CAR.halfW - 0.12), s * CAR.halfW], [SEAT_H, SEAT_H + 0.5], [z - 0.012, z + 0.012]);
    }
  }
  // The pods: a cream shell under both rows, a cap on the shared back, and the
  // end panel, which tapers from the cap down to both seat fronts. Its pole
  // stands on the cap.
  for (const m of BAYS) for (const s of [-1, 1]) {
    const inner = s * (BAY_X + 0.03), outer = s * (CAR.halfW - 0.02);
    box(group, M.seatEnd, [inner, outer], [SEAT_H - 0.12, SEAT_H - 0.05], [m - 0.47, m + 0.47]);
    box(group, M.seatEnd, [s * (BAY_X + 0.01), s * CAR.halfW], [POD_TOP - 0.05, POD_TOP], [m - 0.06, m + 0.06]);
    box(group, M.heater, [s * (CAR.halfW - 0.14), s * CAR.halfW], [0.04, 0.32], [m - 0.45, m + 0.45], { tile: 0.12 });
    const ex = [s * BAY_X, s * (BAY_X + 0.03)];
    box(group, M.seatEnd, ex, [SEAT_H - 0.14, SEAT_H + 0.06], [m - 0.47, m + 0.47]);
    box(group, M.seatEnd, ex, [SEAT_H - 0.3, SEAT_H - 0.14], [m - 0.26, m + 0.26]);
    // The taper, in steps that narrow toward the cap.
    const n = 5, y0 = SEAT_H + 0.06, y1 = POD_TOP - 0.05;
    for (let k = 0; k < n; k++) {
      const half = 0.47 - (0.47 - 0.07) * (k + 1) / n;
      box(group, M.seatEnd, ex, [y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n], [m - half, m + half]);
    }
    for (const e of [-1, 1]) tube(group, M.seatEnd, [s * (BAY_X + 0.015), y0, m + e * 0.47], [s * (BAY_X + 0.015), y1, m + e * 0.07], 0.022);
  }
  for (const p of POLES) {
    const onPod = Math.abs(p.x) === BAY_X;
    box(group, M.pole, [p.x - 0.022, p.x + 0.022], [onPod ? POD_TOP : 0, H], [p.z - 0.022, p.z + 0.022]);
    if (Math.abs(p.x) !== POLE_X) continue;
    // At a bench's door end: an armrest from the stanchion to the wall that
    // drops to the seat, and a windscreen bar to the door post.
    const s = Math.sign(p.x);
    const door = DOOR_Z.reduce((a, d) => (Math.abs(d - p.z) < Math.abs(a - p.z) ? d : a));
    const dir = Math.sign(p.z - door);
    const za = p.z + dir * 0.03;
    tube(group, M.pole, [p.x, 0.75, za], [s * (CAR.halfW - 0.1), 0.75, za]);
    tube(group, M.pole, [s * (CAR.halfW - 0.1), 0.75, za], [s * (CAR.halfW - 0.1), SEAT_H + 0.02, za]);
    tube(group, M.pole, [p.x, 0.85, p.z], [s * CAR.halfW, 1.05, door + dir * DOOR_HALF]);
  }
  // Overhead grab rails in front of each bench.
  for (const s of [-1, 1]) {
    for (const b of BENCHES) {
      box(group, M.pole, [s * (RAIL_X - 0.02), s * (RAIL_X + 0.02)], [RAIL_Y, RAIL_Y + 0.04], [b.z0 + 0.1, b.z1 - 0.1]);
      for (const z of [b.z0 + 0.15, b.z1 - 0.15]) box(group, M.pole, [s * (RAIL_X - 0.01), s * (RAIL_X + 0.01)], [RAIL_Y, H], [z - 0.01, z + 0.01]);
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
  mergeStatic(group);

  // The outside, shared by every car in the train. Our car's has its inside
  // already; the others get a dim, lit box behind their windows.
  const outside = mergeStatic(exterior(M));
  group.add(outside, numberPlates(M, NUMBERS[0]));
  const filler = new THREE.Mesh(new THREE.BoxGeometry(CAR.halfW * 2, H, CAR.halfL * 2), M.lit);
  filler.position.y = H / 2;
  const shut = new THREE.Group();
  for (const s of [-1, 1]) for (const dir of [-1, 1]) for (const z of DOOR_Z) doorLeaf(shut, M, dir, s * (CAR.halfW + 0.06), z + dir * DOOR_HALF / 2);
  mergeStatic(shut);
  for (const k of [-2, -1, 1, 2]) {
    const car = new THREE.Group();
    car.position.z = k * (CAR.halfL * 2 + GAP);
    car.add(outside.clone(), shut.clone(), filler.clone(), numberPlates(M, NUMBERS[k]));
    if (k === -2) car.add(mergeStatic(cabEnd(M, -1, M.head)));
    if (k === 2) car.add(mergeStatic(cabEnd(M, 1, M.red)));
    group.add(car);
  }

  // The car's shell and the train shade the sun; glass and lamps don't.
  group.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    o.castShadow = !m.transparent && !m.isMeshBasicMaterial;
    o.receiveShadow = !m.isMeshBasicMaterial;
  });

  return {
    group,
    // side: -1, 1; open: 0 (shut) .. 1 (open)
    setDoors(side, open) {
      for (const d of doors) {
        const o = d.side === side ? open : 0;
        d.leaves.position.z = d.dir * o * (DOOR_HALF - 0.04);
      }
    },
    setLights(on) {
      M.light.color.set(on ? '#fff3d4' : '#55524a');
    },
  };
}

// The bench seats in runs along the wall: { s, z0, z1 } for each.
function benchRuns() {
  const runs = [];
  for (const s of [-1, 1]) {
    const zs = SEATS.filter((q) => q.kind === 'wall' && q.side === s).map((q) => q.z).sort((a, b) => a - b);
    for (const z of zs) {
      const last = runs[runs.length - 1];
      if (last && last.s === s && z - SEAT_W / 2 - last.z1 < 0.05) last.z1 = z + SEAT_W / 2;
      else runs.push({ s, z0: z - SEAT_W / 2, z1: z + SEAT_W / 2 });
    }
  }
  return runs;
}

// A round-ish bar of radius r from point a to point b, as a turned box.
const UP = new THREE.Vector3(0, 1, 0);
function tube(g, mat, a, b, r = 0.016) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const m = box(g, mat, [-r, r], [-d.length() / 2 - r, d.length() / 2 + r], [-r, r]);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

// A dark rubber gasket around a window in the plane x0..x1, centered on zc,
// with its corners cut off so they read as rounded.
function gasket(g, mat, x0, x1, zc, half, y0, y1, w = 0.04) {
  const xr = [x0, x1];
  box(g, mat, xr, [y0, y0 + w], [zc - half, zc + half]);
  box(g, mat, xr, [y1 - w, y1], [zc - half, zc + half]);
  box(g, mat, xr, [y0, y1], [zc - half, zc - half + w]);
  box(g, mat, xr, [y0, y1], [zc + half - w, zc + half]);
  for (const [cz, cy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const c = box(g, mat, xr, [-w / 2, w / 2], [-0.045, 0.045]);
    c.position.set((x0 + x1) / 2, cy < 0 ? y0 + w : y1 - w, zc + cz * (half - w));
    c.rotation.x = cz * cy * Math.PI / 4;
  }
}

// The same around a window in a car end (the plane z = z), centered on xc:
// built turned a quarter turn, then moved into g so it still merges.
function endGasket(g, mat, xc, z, half, y0, y1) {
  const gk = new THREE.Group();
  gasket(gk, mat, -0.006, 0.006, 0, half, y0, y1);
  gk.rotation.y = Math.PI / 2;
  gk.position.set(xc, 0, z);
  gk.updateMatrixWorld(true);
  for (const c of [...gk.children]) g.attach(c);
}

// One R68's outside, centered on its own middle: fluted stainless sides with
// a window per door section, sloped eaves and a ribbed roof with vent grilles,
// beveled ends with safety bars, and the trucks and boxes underneath. From the
// photos of 5490 and 5491 at Queensboro Plaza.
function exterior(M) {
  const g = new THREE.Group();
  const L = CAR.halfL;
  for (const s of [-1, 1]) {
    const xr = [s * OUT, s * SKIN];
    for (const b of BENCHES) {
      box(g, M.shell, xr, [SKIRT_Y, SILL], [b.z0, b.z1]);
      box(g, M.shell, xr, [LINTEL, EAVE_Y], [b.z0, b.z1]);
      if (b.end) box(g, M.shell, xr, [SILL, LINTEL], [b.z0, b.z1]);
      else {
        box(g, M.shell, xr, [SILL, LINTEL], [b.z0, b.mid - WIN_HALF]);
        box(g, M.shell, xr, [SILL, LINTEL], [b.mid + WIN_HALF, b.z1]);
        gasket(g, M.rubber, s * SKIN, s * (SKIN + 0.012), b.mid, WIN_HALF, SILL, LINTEL);
        // The hopper's frame across the top of the window.
        box(g, M.rubber, [s * (CAR.halfW + 0.06), s * (CAR.halfW + 0.08)], [LINTEL - 0.2, LINTEL - 0.18], [b.mid - WIN_HALF, b.mid + WIN_HALF]);
      }
      // Fluting along the bottom and a belt of ribs under the windows.
      for (const y of RIBS) box(g, M.rib, [s * SKIN, s * (SKIN + 0.008)], [y, y + 0.016], [b.z0 + 0.04, b.z1 - 0.04]);
    }
    // The N bullet in the first and last side windows, as in the photo.
    for (const z of [BENCHES[1].mid - WIN_HALF + 0.3, BENCHES[3].mid + WIN_HALF - 0.3]) {
      const m = panel(g, null, 0.3, 0.3, { material: M.route });
      m.position.set(s * (CAR.halfW + 0.09), 1.45, z);
      m.rotation.y = s * Math.PI / 2;
    }
    for (const z of DOOR_Z) {
      box(g, M.shell, xr, [DOOR_H, EAVE_Y], [z - DOOR_HALF, z + DOOR_HALF]);
      box(g, M.shell, xr, [SKIRT_Y, -0.06], [z - DOOR_HALF, z + DOOR_HALF]);
      for (const e of [-1, 1]) box(g, M.rubber, [s * SKIN, s * (SKIN + 0.01)], [-0.06, DOOR_H], [z + e * DOOR_HALF - 0.015, z + e * DOOR_HALF + 0.015]);
      // A red stripe under the door, and the amber door lamp up by the eave.
      box(g, M.red, [s * SKIN, s * (SKIN + 0.01)], [-0.15, -0.1], [z - 0.25, z + 0.25]);
      box(g, M.amber, [s * SKIN, s * (SKIN + 0.03)], [DOOR_H + 0.06, DOOR_H + 0.12], [z + DOOR_HALF + 0.08, z + DOOR_HALF + 0.16]);
    }
    // The sloped eave up to the roof, with a vent grille near each end.
    const len = Math.hypot(OUT - ROOF_X, ROOF_Y - EAVE_Y);
    const eave = box(g, M.roof, [-len / 2, len / 2], [-0.02, 0.02], [-L, L]);
    eave.position.set(s * (OUT + ROOF_X) / 2, (EAVE_Y + ROOF_Y) / 2, 0);
    eave.rotation.z = Math.atan2(ROOF_Y - EAVE_Y, -s * (OUT - ROOF_X));
    for (const e of [-1, 1]) {
      const vent = box(g, M.vent, [-len * 0.3, len * 0.3], [-0.025, 0.025], [-0.45, 0.45]);
      vent.position.set(s * (OUT + ROOF_X) / 2 - s * 0.01, (EAVE_Y + ROOF_Y) / 2 + 0.01, e * (L - 1.6));
      vent.rotation.z = eave.rotation.z;
    }
  }
  // The roof, ribbed along its length.
  box(g, M.roof, [-ROOF_X, ROOF_X], [H + 0.04, ROOF_Y], [-L, L]);
  for (let x = -ROOF_X + 0.15; x < ROOF_X; x += 0.3) box(g, M.rib, [x - 0.02, x + 0.02], [ROOF_Y, ROOF_Y + 0.02], [-L + 0.1, L - 0.1]);

  // Car ends: a stainless face around the storm-door window, beveled corner
  // posts, the door's seams, and safety bars reaching for the next car.
  for (const e of [-1, 1]) {
    const zr = [e * (L + 0.12), e * (L + END_T)];
    box(g, M.shell, [-OUT, -0.45], [SKIRT_Y, ROOF_Y], zr);
    box(g, M.shell, [0.45, OUT], [SKIRT_Y, ROOF_Y], zr);
    box(g, M.shell, [-0.45, 0.45], [SKIRT_Y, 1.0], zr);
    box(g, M.shell, [-0.45, 0.45], [1.75, ROOF_Y], zr);
    for (const x of [-0.5, 0.5]) box(g, M.rubber, [x - 0.012, x + 0.012], [0, 1.98], [e * (L + END_T), e * (L + END_T + 0.006)]);
    for (const s of [-1, 1]) {
      const post = box(g, M.shell, [-0.08, 0.08], [SKIRT_Y, EAVE_Y], [-0.08, 0.08]);
      post.position.set(s * (OUT - 0.035), (SKIRT_Y + EAVE_Y) / 2, e * (L + 0.1));
      post.rotation.y = Math.PI / 4;
      for (const y of [0.55, 0.9, 1.25]) box(g, M.shell, [s * 1.12, s * 1.15], [y, y + 0.03], [e * (L + END_T), e * (L + GAP / 2)]);
      box(g, M.shell, [s * 1.08, s * 1.18], [0.45, 1.35], [e * (L + END_T), e * (L + END_T + 0.04)]);
    }
  }
  for (const e of [-1, 1]) endGasket(g, M.rubber, 0, e * (L + END_T + 0.006), 0.45, 1.0, 1.75);

  // Underneath: the body's belly, equipment boxes, and two trucks with their
  // wheels on the rails and third-rail shoes.
  box(g, M.under, [-1.3, 1.3], [SKIRT_Y - 0.05, -0.06], [-L + 0.3, L - 0.3]);
  for (const [z0, z1] of [[-5.6, -3.2], [-2.6, -0.6], [0.4, 2.2], [3.0, 5.4]]) box(g, M.under, [-1.15, 1.15], [-0.82, SKIRT_Y], [z0, z1]);
  const wheel = new THREE.CylinderGeometry(0.43, 0.43, 0.08, 10);
  wheel.rotateZ(Math.PI / 2);
  for (const tz of [-TRUCK_Z, TRUCK_Z]) {
    box(g, M.under, [-1.05, 1.05], [-0.62, -0.34], [tz - 1.25, tz + 1.25]);
    box(g, M.wheel, [-0.9, 0.9], [-0.5, -0.4], [tz - 1.1, tz - 1.0]);
    box(g, M.wheel, [-0.9, 0.9], [-0.5, -0.4], [tz + 1.0, tz + 1.1]);
    for (const x of [-0.76, 0.76]) for (const dz of [-1.05, 1.05]) {
      const w = new THREE.Mesh(wheel, M.wheel);
      w.position.set(x, -0.45, tz + dz);
      g.add(w);
    }
    for (const s of [-1, 1]) box(g, M.under, [s * 1.12, s * 1.32], [-0.8, -0.74], [tz - 0.35, tz + 0.35]);
  }
  return g;
}

// The car number, black with white digits, high by each end door on both
// sides, with a flag decal under it.
function numberPlates(M, number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: plateTexture(number) });
  for (const s of [-1, 1]) {
    for (const [dz, e] of [[DOOR_Z[0], -1], [DOOR_Z[3], 1]]) {
      const z = dz + e * (DOOR_HALF + 0.38);
      const plate = panel(g, null, 0.5, 0.15, { material: mat });
      plate.position.set(s * (SKIN + 0.004), 1.78, z);
      plate.rotation.y = s * Math.PI / 2;
      const flag = panel(g, null, 0.46, 0.25, { material: M.flag });
      flag.position.set(s * (SKIN + 0.004), 1.52, z);
      flag.rotation.y = s * Math.PI / 2;
    }
  }
  return mergeStatic(g);
}

// The cab end of the first or last car (e: -1 front, 1 rear): a cab window
// and a window with the N bullet either side of the storm door, the anti-
// climber, a coupler, and headlights in front (red markers at the back).
function cabEnd(M, e, lampMat) {
  const g = new THREE.Group();
  const z = e * (CAR.halfL + END_T);
  const face = [z, z + e * 0.01];
  for (const sx of [-1, 1]) {
    box(g, M.dark, [sx * 0.6, sx * 1.25], [1.0, 1.7], face);
    endGasket(g, M.rubber, sx * 0.925, z + e * 0.012, 0.325, 1.0, 1.7);
    box(g, lampMat, [sx * 0.7, sx * 0.85], [0.3, 0.42], [z, z + e * 0.04]);
    box(g, M.rubber, [sx * 0.68, sx * 0.87], [0.28, 0.44], [z, z + e * 0.02]);
  }
  // The N sign sits in the window on your right as you face the cab.
  const sign = panel(g, null, 0.34, 0.34, { material: M.route });
  sign.position.set(e * 0.925, 1.35, z + e * 0.02);
  sign.rotation.y = e < 0 ? Math.PI : 0;
  box(g, M.under, [-1.2, 1.2], [-0.3, -0.05], [z, z + e * 0.16]);
  for (const y of [-0.25, -0.18, -0.11]) box(g, M.rib, [-1.2, 1.2], [y, y + 0.025], [z + e * 0.16, z + e * 0.18]);
  box(g, M.under, [-0.15, 0.15], [-0.45, -0.25], [z, z + e * 0.4]);
  return g;
}

// One door leaf, shut, centered on (x, z0); dir is the way it slides open.
function doorLeaf(g, M, dir, x, z0) {
  const w = DOOR_HALF;
  const xr = [x - 0.03, x + 0.03], zr = [z0 - w / 2, z0 + w / 2];
  // A tall, narrow window, set toward the leaf's outer edge.
  const zc = z0 + dir * 0.06, half = 0.13, y0 = 1.02, y1 = 1.72;
  box(g, M.shell, xr, [0, y0], zr);
  box(g, M.shell, xr, [y1, DOOR_H], zr);
  box(g, M.shell, xr, [y0, y1], [zr[0], zc - half]);
  box(g, M.shell, xr, [y0, y1], [zc + half, zr[1]]);
  for (const dx of [-0.03, 0.03]) gasket(g, M.rubber, x + dx - 0.006, x + dx + 0.006, zc, half, y0, y1, 0.03);
  // The rubber seal where the two leaves meet.
  box(g, M.rubber, [x - 0.035, x + 0.035], [0, DOOR_H], [z0 - dir * w / 2 - 0.012, z0 - dir * w / 2 + 0.012]);
  const glass = box(g, M.glass, [x - 0.01, x + 0.01], [y0, y1], [zc - half, zc + half]);
  glass.renderOrder = 2;
}

// Wood-grain laminate: horizontal grain with faint streaks, one 1.2 m panel
// per tile with a dark seam at its edge.
function woodTexture() {
  const tex = canvasTexture(64, 64, (c) => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const img = c.createImageData(64, 64);
    const rows = Array.from({ length: 64 }, () => (rand() - 0.5) * 22);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const wave = Math.sin(x * 0.09 + y * 0.7) * 6 + Math.sin(y * 2.3 + x * 0.02) * 5;
        const j = rows[y] + wave + (rand() - 0.5) * 8;
        const seam = x === 0 ? -38 : x === 1 ? 10 : 0;
        img.data.set([138 + j + seam, 90 + j * 0.7 + seam, 50 + j * 0.45 + seam, 255], (y * 64 + x) * 4);
      }
    }
    c.putImageData(img, 0, 0);
    dither(c, 64, 64, 8);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function grilleTexture() {
  const tex = canvasTexture(8, 8, (c) => {
    c.fillStyle = '#5c6066';
    c.fillRect(0, 0, 8, 8);
    c.fillStyle = '#202326';
    for (let x = 1; x < 8; x += 2) c.fillRect(x, 1, 1, 6);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function flagTexture() {
  return canvasTexture(19, 10, (c) => {
    for (let y = 0; y < 10; y++) {
      c.fillStyle = y % 2 ? '#f4f1ea' : '#b22234';
      c.fillRect(0, y, 19, 1);
    }
    c.fillStyle = '#3c3b6e';
    c.fillRect(0, 0, 8, 5);
    c.fillStyle = '#f4f1ea';
    for (let y = 1; y < 5; y += 2) for (let x = 1; x < 8; x += 2) c.fillRect(x, y, 1, 1);
  });
}

function plateTexture(number) {
  return canvasTexture(40, 12, (c) => {
    c.fillStyle = '#121214';
    c.fillRect(0, 0, 40, 12);
    text(c, String(number), 20, 2, '#f4f1ea', 8, 'center');
  });
}

// The side and cab route sign: a yellow N bullet on black.
function routeTexture() {
  return canvasTexture(16, 16, (c) => {
    c.fillStyle = '#111';
    c.fillRect(0, 0, 16, 16);
    bullet(c, 8, 8, 7, '#fccc0a', 'N');
  });
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

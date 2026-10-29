// The floor plan of one R68 car, the N's car through the 2010s, in meters. Pure
// data with no three.js, so node can check it (selfTest). The car runs along z
// with the front of the train toward -z; x is across the car, and y = 0 is the
// car floor, level with the platforms.
//
// R68 seating: between each pair of doors, a three-seat bench along the wall
// next to each door, and in the middle a pod of two two-seat rows back to back
// under the window, each row facing its own bench. The car ends have
// three-seat benches.

export const CAR = {
  halfW: 1.35,      // inside the walls
  outerHalfW: 1.5,  // outside the stainless shell
  halfL: 11.4,      // a 75 ft car is about 22.9 m long
  height: 2.25,     // floor to ceiling
};
export const DOOR_Z = [-8.55, -2.85, 2.85, 8.55]; // four double doors per side
export const DOOR_HALF = 0.635;                   // 50 in openings
export const SEAT_W = 0.44;
export const SEAT_H = 0.45;
export const SEAT_X = CAR.halfW - 0.24; // center of a wall bench's seat pan
export const KNEE_X = 0.62;             // seated knees on a wall bench reach this far in
export const POLE_X = 0.88;             // bench-end stanchions
export const BAY_X = 0.46;              // the pod seats' aisle edge
export const BAY_HALF = 0.5;            // a pod runs this far either side of its middle
export const CROSS_X = [0.68, 1.12];    // the two seats of a pod row, inner and outer
export const ROW_Z = 0.26;              // a pod row's seat center, from the shared back
export const BENCH_LEN = 0.06 + 3 * SEAT_W; // a three-seat bench, from the door edge
const WALL_SEATS = 3;                   // bench seats by each door, between doors
const END_SEATS = 3;                    // bench seats at each car end
export const HAND_Y = [1.3, 1.42, 1.54];
export const RAIL_Y = 1.85;             // the overhead grab rails, low enough for most riders
export const PLAYER_R = 0.2;
export const RIDER_R = 0.24;
export const POLE_R = 0.03;

// The stretches of wall between doors (and at the car ends), where the seats go.
export const BENCHES = (() => {
  const edges = [-CAR.halfL];
  for (const z of DOOR_Z) edges.push(z - DOOR_HALF, z + DOOR_HALF);
  edges.push(CAR.halfL);
  const out = [];
  for (let i = 0; i < edges.length; i += 2) {
    const end = i === 0 || i === edges.length - 2;
    out.push({ z0: edges[i], z1: edges[i + 1], end, mid: (edges[i] + edges[i + 1]) / 2 });
  }
  return out;
})();

// The middles of the seat pods (the shared seat back): one per stretch
// between doors.
export const BAYS = BENCHES.filter((b) => !b.end).map((b) => b.mid);

// kind 'wall' seats face across the car; kind 'cross' seats face along it.
// yaw is the sitter's facing (a body faces (sin yaw, 0, cos yaw)), and front
// is the aisle spot where you stand up to.
export const SEATS = (() => {
  const seats = [];
  const wall = (side, z) => seats.push({
    kind: 'wall', side, x: side * SEAT_X, z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, front: { x: side * 0.4, z },
  });
  for (const side of [-1, 1]) {
    for (const b of BENCHES) {
      if (b.end) {
        // Against the end wall at the car end, toward the door.
        const atStart = b.z0 === -CAR.halfL;
        for (let i = 0; i < END_SEATS; i++) wall(side, atStart ? b.z1 - 0.28 - i * SEAT_W : b.z0 + 0.28 + i * SEAT_W);
        continue;
      }
      for (let i = 0; i < WALL_SEATS; i++) {
        wall(side, b.z0 + 0.06 + (i + 0.5) * SEAT_W);
        wall(side, b.z1 - 0.06 - (i + 0.5) * SEAT_W);
      }
      // The pod: back to back at the middle, the front row facing forward (-z)
      // at its bench, the rear row facing back (+z) at the other.
      for (const f of [-1, 1]) {
        for (const cx of CROSS_X) {
          const z = b.mid + f * ROW_Z;
          seats.push({ kind: 'cross', side, facing: f, x: side * cx, z, yaw: f > 0 ? 0 : Math.PI, front: { x: side * 0.14, z } });
        }
      }
    }
  }
  seats.forEach((s, i) => (s.id = i));
  return seats;
})();

// Every grip slot on every pole, by id.
export const SLOTS = [];

// Vertical stanchions: one at each bench end beside a door, one in the middle
// of each door vestibule, and one at the aisle end of each pod's back. Each
// has grip slots around it: where a rider stands, and how high the hand goes.
export const POLES = (() => {
  const poles = [];
  for (const dz of DOOR_Z) {
    for (const side of [-1, 1]) {
      for (const dir of [-1, 1]) { // which bench, before or after the door
        const z = dz + dir * (DOOR_HALF + 0.06);
        poles.push({ x: side * POLE_X, z, slots: [
          { x: side * (POLE_X - 0.28), z: z - dir * 0.28 },
          { x: side * POLE_X, z: z - dir * 0.32 },
        ] });
      }
    }
    poles.push({ x: 0, z: dz, slots: [
      { x: -0.3, z: dz }, { x: 0.3, z: dz }, { x: 0, z: dz - 0.3 }, { x: 0, z: dz + 0.3 },
    ] });
  }
  for (const m of BAYS) {
    for (const side of [-1, 1]) {
      poles.push({ x: side * BAY_X, z: m, slots: [{ x: side * 0.18, z: m - 0.25 }, { x: side * 0.18, z: m + 0.25 }] });
    }
  }
  poles.forEach((p, pi) => {
    p.id = pi;
    p.slots = p.slots.map((s, k) => {
      const slot = { ...s, id: SLOTS.length, pole: pi, hand: HAND_Y[(pi + k) % HAND_Y.length] };
      SLOTS.push(slot);
      return slot;
    });
  });
  return poles;
})();

// The aisle is wide in front of wall benches and narrow beside the pods.
function wideStretches() {
  const out = [];
  let z = -CAR.halfL;
  for (const m of BAYS) {
    out.push([z, m - BAY_HALF]);
    z = m + BAY_HALF;
  }
  out.push([z, CAR.halfL]);
  return out;
}

// Places to stand holding the overhead rail, in front of the wall benches.
export const RAIL_SPOTS = (() => {
  const spots = [];
  const doorway = (z) => DOOR_Z.some((d) => Math.abs(z - d) < DOOR_HALF + 0.25);
  for (const side of [-1, 1]) {
    for (const [z0, z1] of wideStretches()) {
      for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.62) if (!doorway(z)) spots.push({ x: side * 0.36, z, side });
    }
  }
  spots.forEach((s, i) => (s.id = i));
  return spots;
})();

// Where a body's center may be. The aisle between the knees and seats, the
// door vestibules across the full width, and, when the doors on a side are
// open, the doorways and the platform beyond.
export function walkRects(openSide = 0, platform = null) {
  const r = PLAYER_R;
  const rects = [{ x0: -BAY_X + r, x1: BAY_X - r, z0: -CAR.halfL + r, z1: CAR.halfL - r }];
  for (const [z0, z1] of wideStretches()) rects.push({ x0: -KNEE_X + r, x1: KNEE_X - r, z0: Math.max(z0, -CAR.halfL + r), z1: Math.min(z1, CAR.halfL - r) });
  for (const z of DOOR_Z) {
    rects.push({ x0: -CAR.halfW + r, x1: CAR.halfW - r, z0: z - DOOR_HALF + r, z1: z + DOOR_HALF - r });
    if (openSide) {
      const a = openSide * (CAR.halfW - r - 0.05), b = openSide * (CAR.outerHalfW + 0.6);
      rects.push({ x0: Math.min(a, b), x1: Math.max(a, b), z0: z - DOOR_HALF + r, z1: z + DOOR_HALF - r });
    }
  }
  if (openSide && platform) rects.push(platform);
  return rects;
}

export function inRects(rects, x, z) {
  return rects.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1);
}

export function insideCar(x, z) {
  return Math.abs(x) < CAR.halfW && Math.abs(z) < CAR.halfL;
}

export function selfTest() {
  const issues = [];
  if (SEATS.length < 70 || SEATS.length > 80) issues.push(`seat count ${SEATS.length}`);
  const rects = walkRects();
  for (const s of SLOTS) {
    if (!inRects(rects, s.x, s.z)) issues.push(`slot ${s.id} not walkable`);
    const p = POLES[s.pole];
    if (Math.hypot(s.x - p.x, s.z - p.z) > 0.4) issues.push(`slot ${s.id} far from its pole`);
  }
  for (const s of RAIL_SPOTS) if (!inRects(rects, s.x, s.z)) issues.push(`rail spot ${s.id} not walkable`);
  for (const s of SEATS) {
    if (!inRects(rects, s.front.x, s.front.z)) issues.push(`seat ${s.id} front not walkable`);
    if (inRects(rects, s.x, s.z)) issues.push(`seat ${s.id} sits in the aisle`);
    for (const q of SEATS) if (q.id > s.id && Math.hypot(q.x - s.x, q.z - s.z) < 0.4) issues.push(`seats ${s.id}/${q.id} overlap`);
  }
  const msg = `${SEATS.length} seats, ${POLES.length} poles, ${SLOTS.length} slots, ${RAIL_SPOTS.length} rail spots`;
  console.log(issues.length ? `layout FAIL: ${issues.join('; ')}` : `layout ok: ${msg}`);
  return issues.length === 0;
}

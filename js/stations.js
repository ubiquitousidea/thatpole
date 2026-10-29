// The two platforms, in the car's frame while the train is stopped at each
// one: Queensboro Plaza at track position u = 0, Lexington Av at ROUTE_LEN.
// Pure data with no three.js, so node can check it (selfTest).
//
// Queensboro Plaza's lower level is an island platform. Our Manhattan-bound N
// runs on its north side, between it and Queens Plaza North (+x, bearing 30°),
// and the Manhattan-bound 7 on its south side. So the platform is on our left
// (-x). Two stairways in the middle of the platform climb to the upper level,
// where a locked gate stops you.

import { DOOR_Z, DOOR_HALF, CAR } from './layout.js';

export const QBP_PLATFORM = { side: -1, x0: -8.5, x1: -CAR.outerHalfW - 0.05, z0: -60, z1: 60 };
export const LEX_PLATFORM = { side: -1, x0: -8, x1: -CAR.outerHalfW - 0.05, z0: -75, z1: 75 };
export const SEVEN_X = QBP_PLATFORM.x0 - (CAR.outerHalfW + 0.05); // the 7's track center

export const RISE = 5.3;    // lower platform to the top of the upper deck
export const STEPS = 28;    // risers of about 0.19 m
export const LANDING = 1.4; // the top landing, where the gate is
export const GATE = 1.0;    // how far past the top step the gate stands
// dir: the way the stair climbs (+z or -z). z0 is its bottom step.
export const QBP_STAIRS = [
  { x0: -5.8, x1: -4.2, z0: 13, z1: 21, dir: 1 },
  { x0: -5.8, x1: -4.2, z0: -13, z1: -21, dir: -1 },
];

// How far up stair s you are at z: 0 at the bottom step, 1 at the top.
function along(s, z) {
  return Math.max(0, Math.min(1, ((z - s.z0) * s.dir) / Math.abs(s.z1 - s.z0)));
}

// The z range from a stair's bottom to the far end of its landing, low to high.
function footprint(s) {
  const far = s.z1 + s.dir * LANDING;
  return [Math.min(s.z0, far), Math.max(s.z0, far)];
}

// The walkable rects on a station's platform for a body of radius r. At
// Queensboro Plaza the stairs are walled in: the platform goes around them,
// and each stair is a channel you can only enter from its bottom, up to the
// gate.
export function stationRects(station, r) {
  if (station === 'lex') {
    const P = LEX_PLATFORM;
    return [{ x0: P.x0 + r, x1: P.x1 - r, z0: P.z0 + r, z1: P.z1 - r }];
  }
  const P = QBP_PLATFORM;
  const px0 = P.x0 + r, px1 = P.x1 - r, pz0 = P.z0 + r, pz1 = P.z1 - r;
  const sx0 = Math.min(...QBP_STAIRS.map((s) => s.x0)) - r;
  const sx1 = Math.max(...QBP_STAIRS.map((s) => s.x1)) + r;
  const rects = [
    { x0: px0, x1: sx0, z0: pz0, z1: pz1 },
    { x0: sx1, x1: px1, z0: pz0, z1: pz1 },
  ];
  // The middle strip, in pieces between the stairs.
  const cuts = QBP_STAIRS.map(footprint).sort((a, b) => a[0] - b[0]);
  let z = pz0;
  for (const [a, b] of cuts) {
    if (a > z) rects.push({ x0: sx0, x1: sx1, z0: z, z1: a });
    z = Math.max(z, b);
  }
  if (z < pz1) rects.push({ x0: sx0, x1: sx1, z0: z, z1: pz1 });
  for (const s of QBP_STAIRS) {
    const bottom = s.z0 - s.dir * 0.5, gate = s.z1 + s.dir * (GATE - 0.75); // stop short of the bars
    rects.push({ x0: s.x0 + r, x1: s.x1 - r, z0: Math.min(bottom, gate), z1: Math.max(bottom, gate) });
  }
  return rects;
}

// The height of the ground at (x, z): up the stairs, else the platform (0).
// The stairs are a smooth ramp half a riser above the step corners, so you
// glide up them.
export function groundY(station, x, z) {
  if (station !== 'qbp') return 0;
  for (const s of QBP_STAIRS) {
    const [a, b] = footprint(s);
    if (x >= s.x0 && x <= s.x1 && z >= a && z <= b) return Math.min(RISE, (along(s, z) + 0.5 / STEPS) * RISE);
  }
  return 0;
}

export function selfTest() {
  const issues = [];
  const r = 0.25;
  const rects = stationRects('qbp', r);
  const inR = (x, z) => rects.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1);
  // The player's start and where the boarders wait.
  if (!inR(-4.6, DOOR_Z[2] + 1)) issues.push('player start not walkable');
  for (const dz of [DOOR_Z[1], DOOR_Z[2]]) for (const x of [-3, -6]) for (const e of [-1.5, 1.5]) {
    if (!inR(x, dz + e)) issues.push(`boarder spot ${x},${dz + e} not walkable`);
  }
  for (const s of QBP_STAIRS) {
    const mid = (s.x0 + s.x1) / 2;
    if (groundY('qbp', mid, s.z0 - s.dir * 0.2) !== 0) issues.push('ground not 0 below a stair');
    if (Math.abs(groundY('qbp', mid, s.z1 + s.dir * GATE) - RISE) > 1e-9) issues.push('ground not RISE at the gate');
    if (inR(mid, s.z1 + s.dir * (GATE + 0.1))) issues.push('can walk past a gate');
    // The sides: halfway up, just outside the stair, nothing is walkable.
    const zm = (s.z0 + s.z1) / 2;
    if (inR(s.x0 - 0.01, zm) || inR(s.x1 + 0.01, zm)) issues.push('a stair side is open');
    if (!inR(mid, zm)) issues.push('a stair is not walkable');
    for (const d of DOOR_Z) {
      const [a, b] = footprint(s);
      if (d + DOOR_HALF + 2 > a && d - DOOR_HALF - 2 < b) issues.push(`a stair is by door ${d}`);
    }
  }
  if (!stationRects('lex', r).length) issues.push('no Lex platform');
  console.log(issues.length ? `stations FAIL: ${issues.join('; ')}` : `stations ok: ${rects.length} rects, ${QBP_STAIRS.length} stairs`);
  return issues.length === 0;
}

// The ride from Queensboro Plaza to Lexington Av/59 St as a pure function of
// time: no three.js, so node can check it (selfTest). Distance u is along the
// track in meters, from our car's stop at Queensboro Plaza (u = 0) to its stop
// at Lex (u = ROUTE_LEN). The run is compressed: the real one is about 3 km.
//
// The profile is simulated once at a fixed step. A simple motorman tracks a
// speed limit and brakes to stop exactly at each stop. Jolts are short pulses
// added on top of the smooth acceleration: one as the brakes release at each
// start, one as the car rocks back at each halt, and track bumps in the tunnel.

export const ROUTE_LEN = 1400;
export const RIVER = { u0: 720, u1: 1130 }; // under the East River: the shakiest stretch
const DT = 1 / 30;
const DEPART_DELAY = 1.5;  // seconds from doors closed to brakes released
const ACCEL = 1.1;         // m/s^2, R160 service acceleration (about 2.5 mph/s)
const BRAKE = 1.15;
const START_JOLT = 2.8;    // m/s^2 peak of the lurch as the brakes release
const STOP_JOLT = 2.4;     // and of the rock-back at a halt
const HOLD_AT = [[], [900], [780, 1060]];

// Track height: elevated at Queensboro Plaza, down a ramp into the portal, a dip
// under the river, then level into Lex. The street is at y = -10.
export function trackY(u) {
  if (u < 200) return 0;
  if (u < 560) return -16 * smooth((u - 200) / 360);
  if (u < 700) return -16;
  if (u < 1150) return -16 - 10 * Math.sin((Math.PI * (u - 700)) / 450);
  if (u < 1250) return -16 - 4 * smooth((u - 1150) / 100);
  return -20;
}

function smooth(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

// Where the track goes under the street: the tunnel portal.
export const PORTAL = (() => {
  let u = 200;
  while (trackY(u) > -9) u += 1;
  return u;
})();

function speedLimit(u) {
  if (u < 100) return 7; // through the switches out of the station
  if (u < PORTAL - 100) return 13;
  if (u < PORTAL + 60) return 10; // down the ramp
  if (u < RIVER.u0) return 15;
  if (u < RIVER.u1) return 17;
  return 14;
}

// How hard the car shakes, by stretch.
function roughness(u) {
  if (u < PORTAL) return 0.35;
  if (u < RIVER.u0) return 0.5;
  if (u < RIVER.u1) return 1;
  return 0.6;
}

export function section(u) {
  if (u < 100) return 'QUEENSBORO PLAZA';
  if (u < PORTAL) return 'ELEVATED';
  if (u < RIVER.u0) return 'TUNNEL';
  if (u < RIVER.u1) return 'EAST RIVER';
  if (u < ROUTE_LEN - 120) return 'MANHATTAN';
  return 'LEXINGTON AV/59 ST';
}

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One jolt: a sharp half-sine, then a smaller swing back.
function pulse(tau, w) {
  if (tau < 0) return 0;
  if (tau < w) return Math.sin((Math.PI * tau) / w);
  if (tau < 2 * w) return -0.4 * Math.sin((Math.PI * (tau - w)) / w);
  return 0;
}

// diff: a DIFFICULTY row. t = 0 is the moment the doors close at Queensboro Plaza.
export function buildRide(diff, seed = 1) {
  const rand = rng(seed);
  const holds = HOLD_AT[diff.holds] || [];
  const stops = [...holds, ROUTE_LEN];
  const samples = [];
  const jolts = [];
  const events = [];
  let t = 0, u = 0, v = 0, a = 0;
  let state = 'dwell', until = DEPART_DELAY, stop = 0, braking = false, approach = false;

  for (;;) {
    if (state === 'dwell') {
      v = a = 0;
      if (t >= until) {
        state = 'run';
        braking = false;
        jolts.push({ t, amp: START_JOLT, w: 0.35 });
        events.push({ type: 'depart', t, u });
      }
    } else if (state === 'run') {
      const target = stops[stop];
      const left = target - u;
      const need = (v * v) / (2 * Math.max(0.01, left));
      if (!braking && need >= BRAKE * 0.85) braking = true;
      if (braking) {
        a = -Math.max(need, 0.15); // just enough to stop on the mark
      } else {
        const lim = speedLimit(u);
        const cmd = v < lim - 0.5 ? ACCEL : v > lim + 0.3 ? -0.6 : 0;
        a += (cmd - a) * (1 - Math.exp(-DT / 0.5));
      }
      if (!approach && stop === stops.length - 1 && braking) {
        approach = true;
        events.push({ type: 'approach', t, u });
      }
      v = Math.max(0, v + a * DT);
      u += v * DT;
      if (braking && (v <= 0.02 || u >= target - 0.01)) {
        u = target;
        v = a = 0;
        jolts.push({ t, amp: STOP_JOLT, w: 0.4 });
        const last = stop === stops.length - 1;
        events.push({ type: last ? 'arrive' : 'hold', t, u });
        stop++;
        if (last) {
          state = 'done';
          until = t + 4;
        } else {
          state = 'dwell';
          until = t + 7 + rand() * 4;
        }
      }
    } else if (t >= until) break;
    samples.push({ t, u, v, a });
    t += DT;
  }

  // Track bumps while moving, thickest under the river.
  for (const s of samples) {
    if (s.v < 3) continue;
    const rate = s.u > RIVER.u0 && s.u < RIVER.u1 ? 0.3 : 0.06;
    if (rand() < rate * DT) {
      const sign = rand() < 0.5 ? -1 : 1;
      jolts.push({ t: s.t, amp: sign * (0.7 + rand() * 0.8) * (s.v / 17), w: 0.25, bump: true });
    }
  }
  jolts.sort((p, q) => p.t - q.t);

  const phase = [rand() * 6, rand() * 6, rand() * 6, rand() * 6];
  const duration = samples[samples.length - 1].t;
  const scale = diff.jolt;

  return {
    duration,
    events,
    jolts,
    holds,
    arriveAt: events.find((e) => e.type === 'arrive').t,

    // { u, v, a (felt, jolts included), aTrain, jolt (the pulse part),
    //   shake: {x, y}, daylight, flicker, section }
    at(time) {
      const f = Math.max(0, Math.min(samples.length - 1.001, time / DT));
      const i = Math.floor(f), k = f - i;
      const p = samples[i], q = samples[i + 1];
      const u = p.u + (q.u - p.u) * k;
      const v = p.v + (q.v - p.v) * k;
      const aTrain = p.a + (q.a - p.a) * k;
      let jolt = 0;
      for (const j of jolts) {
        if (j.t > time) break;
        if (time - j.t < 2 * j.w) jolt += j.amp * pulse(time - j.t, j.w);
      }
      jolt *= scale;
      const amp = roughness(u) * Math.min(1, v / 12);
      const s = time;
      const shake = {
        x: amp * (0.6 * Math.sin(s * 2.3 + phase[0]) + 0.5 * Math.sin(s * 7.1 + phase[1]) + 0.3 * Math.sin(s * 13.3)),
        y: amp * (0.5 * Math.sin(s * 19 + phase[2]) + 0.3 * Math.sin(s * 31 + phase[3])),
      };
      const inRiver = u > RIVER.u0 && u < RIVER.u1 && v > 2;
      const flicker = inRiver && hash(Math.floor(time * 8)) < 0.07;
      const daylight = 1 - smooth((u - (PORTAL - 50)) / 70);
      return { u, v, a: aTrain + jolt, aTrain, jolt, shake, daylight, flicker, section: section(u) };
    },
  };
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function selfTest(difficulty) {
  const issues = [];
  const diffs = difficulty ? Object.entries(difficulty)
    : [['easy', { jolt: 0.7, holds: 0 }], ['normal', { jolt: 1, holds: 1 }], ['rush', { jolt: 1.3, holds: 2 }]];
  for (const [name, d] of diffs) {
    const ride = buildRide(d, 7);
    let lastU = 0;
    for (let t = 0; t <= ride.duration; t += 0.1) {
      const s = ride.at(t);
      if (s.v < 0) issues.push(`${name}: negative speed at ${t.toFixed(1)}`);
      if (s.u < lastU - 1e-6) issues.push(`${name}: went backward at ${t.toFixed(1)}`);
      lastU = s.u;
    }
    const end = ride.at(ride.duration);
    if (Math.abs(end.u - ROUTE_LEN) > 0.5 || end.v !== 0) issues.push(`${name}: ends at u=${end.u.toFixed(2)} v=${end.v}`);
    const types = ride.events.map((e) => e.type);
    const want = ['depart', ...d.holds ? Array(d.holds).fill(['hold', 'depart']).flat() : [], 'approach', 'arrive'];
    if (types.join() !== want.join()) issues.push(`${name}: events ${types.join()} (want ${want.join()})`);
    if (ride.arriveAt < 70 || ride.arriveAt > 220) issues.push(`${name}: ride lasts ${ride.arriveAt.toFixed(0)}s`);
    if (issues.length === 0) {
      console.log(`${name}: arrive at ${ride.arriveAt.toFixed(1)}s, ${ride.jolts.length} jolts, events ${types.join(' ')}`);
    }
  }
  console.log(issues.length ? `ride FAIL: ${issues.join('; ')}` : `ride ok (portal at ${PORTAL} m)`);
  return issues.length === 0;
}

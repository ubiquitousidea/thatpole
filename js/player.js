import * as THREE from 'three';
import { Body } from './body.js';
import { Tilt } from './tilt.js';
import { inRects, SEATS, SLOTS, POLES, PLAYER_R, RIDER_R, POLE_R, CAR } from './layout.js';
import { rng } from './ride.js';

// The player: walks with tank controls like Euler's Expedition, grabs a pole
// with SPACE, and leans against the train's jolts to keep from swinging off.
//
// Balance is a damped pendulum about the feet (theta > 0 leans toward the front
// of the train). On a pole: theta'' = -K theta - C theta' - G a + LEAN input,
// where a is the train's felt acceleration (jolts included). Speeding up
// tips you back, so you lean forward against it. Free-standing is stiffer
// but has no input; a hard enough jolt makes you stumble.

const WALK_SPEED = 1.6;
const TURN_SPEED = 2.2;
const WALK_EASE = 0.2;
const TURN_EASE = 0.15;
const HEAD_TURN = 1.25;   // how far you can look around while holding or seated
const REACH = 0.8;        // to a slot's standing spot
const SIT_REACH = 0.95;
const K = 7, C = 2.4, G = 2.45, LEAN = 2.1;
const LEAN_EASE = 0.2;   // keys are on/off; the lean itself eases in and out
export const GRIP_LIMIT = 0.42;
const FK = 10, FC = 3.5, FG = 2.0;
export const FREE_LIMIT = 0.24;
const DRIFT = 0.3;        // m/s of slide along the car per m/s^2, when not holding on
const STUMBLE_TIME = 0.9;
const STUMBLE_SPEED = 2.1;
const KEYS = {
  ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'strafeL', KeyX: 'strafeR',
};
const _v = new THREE.Vector3();

export class Player {
  constructor(scene, camera) {
    this.camera = camera;
    this.tilt = new Tilt();
    this.keys = new Set();
    this.body = new Body(rng(99), { height: 1.78, build: 1.05, top: '#b5303a', bottom: '#2d3a5a', skin: '#d19a6a' });
    this.body.hideHead();
    scene.add(this.body.root);
    this.pos = new THREE.Vector3();
    this.onAction = null;
    this.onContact = null; // (rider, strength 0..1) when you run or stumble into someone
    this.active = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && this.active && this.onAction) this.onAction();
        return;
      }
      const k = KEYS[e.code];
      if (!k) return;
      this.keys.add(k);
      if (this.active && e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(KEYS[e.code]));
    window.addEventListener('blur', () => this.keys.clear());
    this.reset();
  }

  reset(x = 4, z = 0, yaw = -Math.PI / 2) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;          // camera yaw: you face (-sin yaw, -cos yaw)
    this.headYaw = 0;
    this.mode = 'walk';
    this.vel = { step: 0, side: 0 };
    this.spin = 0;
    this.theta = 0;
    this.omega = 0;
    this.lean = 0;
    this.slot = null;
    this.seat = null;
    this.stumbleT = 0;
    this.push = { x: 0, z: 0 };
    this.touching = new Set();
    this.stats = { poleTime: 0, sitTime: 0, stumbles: 0, joltsHeld: 0, sits: 0 };
    this.keys.clear();
    this.body.position.copy(this.pos);
    this.body.yaw = this.yaw + Math.PI;
    this.body.pose('stand');
    this.body.reach(1, null);
    this.body.snap();
  }

  get aboard() {
    return Math.abs(this.pos.x) < CAR.halfW && Math.abs(this.pos.z) < CAR.halfL;
  }

  // The input's lean or walk axis and turn axis, keys plus tilt, each in [-1, 1].
  axes() {
    const k = this.keys;
    const tilt = this.tilt.read();
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    return {
      step: clamp((k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0) + tilt.step),
      turn: clamp((k.has('left') ? 1 : 0) - (k.has('right') ? 1 : 0) + tilt.turn),
      side: (k.has('strafeR') ? 1 : 0) - (k.has('strafeL') ? 1 : 0),
    };
  }

  // The nearest slot you could grab: free, or only reserved by a rider on
  // the way (grabbing that one snipes it).
  grabbable(riders) {
    let best = null, bestD = REACH;
    for (const slot of SLOTS) {
      const st = riders.slots[slot.id];
      if (st.occupant) continue;
      const d = Math.hypot(slot.x - this.pos.x, slot.z - this.pos.z);
      if (d < bestD) {
        best = slot;
        bestD = d;
      }
    }
    return best;
  }

  sittable(riders) {
    let best = null, bestD = SIT_REACH;
    for (const seat of SEATS) {
      if (riders.seats[seat.id]) continue;
      const d = Math.hypot(seat.x - this.pos.x, seat.z - this.pos.z);
      if (d < bestD) {
        best = seat;
        bestD = d;
      }
    }
    return best;
  }

  // What SPACE would do right now: { label, run } or null.
  context(riders) {
    if (this.mode === 'hold') return { label: 'Let go', run: () => this.letGo(riders) };
    if (this.mode === 'sit') return { label: 'Stand up', run: () => this.standUp(riders) };
    if (this.mode !== 'walk' || !this.aboard) return null;
    const slot = this.grabbable(riders);
    if (slot) return { label: 'Grab pole', run: () => this.grab(slot, riders), slot };
    const seat = this.sittable(riders);
    if (seat) return { label: 'Sit down', run: () => this.sit(seat, riders), seat };
    return null;
  }

  grab(slot, riders) {
    riders.playerTakes(slot);
    this.mode = 'hold';
    this.slot = slot;
    this.pos.set(slot.x, 0, slot.z);
    this.headYaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); // keep looking where you were
    this.yaw = 0;
    this.vel.step = this.vel.side = this.spin = 0;
  }

  letGo(riders) {
    if (this.slot) riders.playerLeaves(this.slot);
    this.slot = null;
    this.mode = 'walk';
    this.yaw += this.headYaw;
    this.headYaw = 0;
  }

  sit(seat, riders) {
    riders.playerSits(seat);
    this.mode = 'sit';
    this.seat = seat;
    this.stats.sits++;
    this.pos.set(seat.x, 0, seat.z);
    this.yaw = seat.yaw + Math.PI; // the camera looks the way the seat faces
    this.headYaw = 0;
    this.theta = this.omega = 0;
  }

  standUp(riders) {
    riders.playerStands(this.seat);
    this.pos.set(this.seat.front.x, 0, this.seat.front.z);
    this.seat = null;
    this.mode = 'walk';
    this.yaw += this.headYaw;
    this.headYaw = 0;
  }

  stumble(dir, riders) {
    if (this.mode === 'hold') this.letGo(riders);
    this.mode = 'stumble';
    this.stumbleT = STUMBLE_TIME;
    this.stumbleDir = dir; // +1 toward the back of the train (+z), -1 toward the front
    this.stats.stumbles++;
    this.touching.clear();
    if (this.onStumble) this.onStumble();
  }

  // ctx: { a, shake, rects, riders, dt }
  update(dt, ctx) {
    const { a, riders } = ctx;
    const axes = this.axes();
    const ease = (v, target, tau) => v + (target - v) * (1 - Math.exp(-dt / tau));

    if (this.mode === 'hold') {
      this.stats.poleTime += dt;
      const input = this.active ? axes.step : 0;
      this.lean = ease(this.lean, input, LEAN_EASE);
      const acc = -K * this.theta - C * this.omega - G * a + LEAN * this.lean;
      this.omega += acc * dt;
      this.theta += this.omega * dt;
      this.headYaw = THREE.MathUtils.clamp(this.headYaw + axes.turn * TURN_SPEED * dt, -HEAD_TURN, HEAD_TURN);
      if (Math.abs(this.theta) > GRIP_LIMIT) this.stumble(this.theta > 0 ? -1 : 1, riders);
    } else if (this.mode === 'sit') {
      this.stats.sitTime += dt;
      this.theta = ease(this.theta, 0, 0.2);
      this.headYaw = THREE.MathUtils.clamp(this.headYaw + axes.turn * TURN_SPEED * dt, -HEAD_TURN, HEAD_TURN);
    } else if (this.mode === 'stumble') {
      this.stumbleT -= dt;
      const k = Math.max(0, this.stumbleT / STUMBLE_TIME);
      this.moveBy(0, this.stumbleDir * STUMBLE_SPEED * k * dt, ctx);
      this.theta = ease(this.theta, -this.stumbleDir * 0.35 * k, 0.1);
      if (this.stumbleT <= 0) {
        this.mode = 'walk';
        this.theta = this.omega = 0;
      }
    } else {
      // Walking: steer and step, plus a slide along the car while it speeds
      // up or slows down. A hard jolt topples you.
      const input = this.active ? axes : { step: 0, turn: 0, side: 0 };
      const len = Math.hypot(input.step, input.side);
      const scale = len ? (WALK_SPEED * Math.min(1, len)) / len : 0;
      this.vel.step = ease(this.vel.step, input.step * scale, WALK_EASE);
      this.vel.side = ease(this.vel.side, input.side * scale, WALK_EASE);
      this.spin = ease(this.spin, input.turn * TURN_SPEED, TURN_EASE);
      this.yaw += this.spin * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (-sin * this.vel.step + cos * this.vel.side) * dt;
      const dz = (-cos * this.vel.step - sin * this.vel.side) * dt + (this.aboard ? a * DRIFT * dt : 0);
      this.moveBy(dx, dz, ctx);
      if (this.aboard) {
        const acc = -FK * this.theta - FC * this.omega - FG * a;
        this.omega += acc * dt;
        this.theta += this.omega * dt;
        if (Math.abs(this.theta) > FREE_LIMIT) this.stumble(this.theta > 0 ? -1 : 1, riders);
      } else this.theta = this.omega = 0;
    }
    this.pose(dt, ctx);
  }

  // Move, sliding along the edges of the walkable area, then get out of the
  // way of poles and people. People give a little, and mind it.
  moveBy(dx, dz, ctx) {
    const p = this.pos, rects = ctx.rects;
    const nx = p.x + dx, nz = p.z + dz;
    if (inRects(rects, nx, nz)) p.set(nx, 0, nz);
    else if (inRects(rects, nx, p.z)) p.x = nx;
    else if (inRects(rects, p.x, nz)) p.z = nz;
    for (const pole of POLES) pushOut(p, pole.x, pole.z, POLE_R + PLAYER_R);
    const now = new Set();
    for (const r of ctx.riders.list) {
      if (!r.solid) continue;
      const rp = r.body.position;
      const min = RIDER_R + PLAYER_R;
      const ddx = p.x - rp.x, ddz = p.z - rp.z;
      const d = Math.hypot(ddx, ddz);
      if (d >= min || d === 0) continue;
      now.add(r);
      const overlap = min - d;
      // Split the overlap: standing riders yield some, seated ones don't.
      const give = r.mode === 'seated' ? 0 : 0.4;
      p.x += (ddx / d) * overlap * (1 - give);
      p.z += (ddz / d) * overlap * (1 - give);
      if (give) r.nudge(-(ddx / d) * overlap * give, -(ddz / d) * overlap * give);
      if (!this.touching.has(r) && this.onContact) this.onContact(r, this.mode === 'stumble' ? 1 : 0.35);
    }
    this.touching = now;
  }

  pose(dt, ctx) {
    const b = this.body;
    const shake = ctx.shake;
    b.position.copy(this.pos);
    if (this.mode === 'sit') {
      b.yaw = this.yaw + Math.PI;
      b.pose('spread');
      b.reach(1, null);
      b.lean(0, shake.x * 0.01);
    } else if (this.mode === 'hold') {
      b.yaw = this.yaw + Math.PI;
      b.pose('hold');
      const pole = POLES[this.slot.pole];
      b.reach(1, _v.set(pole.x, this.slot.hand, pole.z));
      b.lean(this.theta, shake.x * 0.01);
    } else {
      b.yaw = this.yaw + Math.PI;
      const moving = Math.hypot(this.vel.step, this.vel.side) > 0.15 || Math.abs(this.spin) > 0.4;
      b.pose(this.mode === 'stumble' ? 'stumble' : moving ? 'walk' : 'stand');
      b.reach(1, null);
      b.lean(this.theta, shake.x * 0.01);
    }
    b.update(dt);

    // The camera rides in the head, looking where the head turns.
    const cam = this.camera;
    b.headWorld(cam.position);
    const look = this.yaw + this.headYaw;
    cam.position.x += -Math.sin(look) * 0.07 + shake.x * 0.012;
    cam.position.z += -Math.cos(look) * 0.07;
    cam.position.y += 0.03 + shake.y * 0.008;
    const pitch = this.mode === 'sit' ? -0.55 : -this.theta * 0.35 - (this.mode === 'stumble' ? 0.2 : 0);
    const roll = shake.x * 0.008 + (this.mode === 'stumble' ? Math.sin(this.stumbleT * 18) * 0.06 : 0);
    cam.rotation.set(pitch, look, roll, 'YXZ');
  }
}

function pushOut(p, x, z, min) {
  const dx = p.x - x, dz = p.z - z;
  const d = Math.hypot(dx, dz);
  if (d < min && d > 0) {
    p.x = x + (dx / d) * min;
    p.z = z + (dz / d) * min;
  }
}

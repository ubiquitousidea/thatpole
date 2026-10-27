import * as THREE from 'three';

// Tilt-to-walk for phones. The pose the phone is held in when exploring starts
// counts as standing still. Tipping the top away walks forward, tipping it back
// walks backward, and turning it about its upright (screen-up) axis, like a
// door on its hinge, turns.
//
// Each reading becomes the phone's full orientation as a quaternion, in a frame
// lined up with the screen (x right, y up, z out). The rotation from the zero
// pose to the current one splits, in YXZ order, into a turn about the zero
// pose's screen-up axis, then a pitch about screen-right, then a roll that is
// ignored. YXZ only locks at 90 degrees of pitch, far past full speed.

const DEAD = 4;       // degrees of pitch wobble that do nothing
const FULL = 20;      // degrees of pitch for full speed
const TURN_DEAD = 5;  // the same for turning, which is coarser in the hand
const TURN_FULL = 30;
const SMOOTH = 0.2;   // low-pass blend per reading
const STEP_SIGN = 1;  // flip if forward and back come out reversed on a device
const TURN_SIGN = -1; // flip if left and right come out reversed
const WAIT_MS = 600;  // how long request() waits for a first reading

const RAD = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1);

export class Tilt {
  constructor() {
    this.live = false;  // readings are arriving
    this.listening = false;
    this.q = null;      // smoothed orientation, screen frame to earth frame
    this.q0 = null;     // orientation of the zero pose
    this.euler = new THREE.Euler();
    this.raw = new THREE.Quaternion();
    this.screen = new THREE.Quaternion();
    this.rel = new THREE.Quaternion();
    this.onReading = (e) => this.reading(e);
    const rotated = () => this.recenter(true);
    if (screen.orientation) screen.orientation.addEventListener('change', rotated);
    else window.addEventListener('orientationchange', rotated);
  }

  // Ask for motion data. Call it straight from a tap: iOS only shows its
  // permission prompt inside a user gesture. Resolves to whether readings arrive.
  request() {
    if (this.live) return Promise.resolve(true);
    if (!('DeviceOrientationEvent' in window)) return Promise.resolve(false);
    const ask = DeviceOrientationEvent.requestPermission;
    const granted = typeof ask === 'function'
      ? ask.call(DeviceOrientationEvent).then((r) => r === 'granted', () => false)
      : Promise.resolve(true);
    return granted.then((ok) => {
      if (!ok) return false;
      if (!this.listening) window.addEventListener('deviceorientation', this.onReading);
      this.listening = true;
      // Desktop browsers define the event but never fire it, so wait briefly.
      return new Promise((resolve) => {
        const start = performance.now();
        const poll = () => {
          if (this.live || performance.now() - start > WAIT_MS) resolve(this.live);
          else setTimeout(poll, 50);
        };
        poll();
      });
    });
  }

  // Make the current pose the zero. After the screen rotates, the axes jump,
  // so the smoothing starts over too.
  recenter(rotated = false) {
    if (rotated) this.q = null;
    this.q0 = this.q ? this.q.clone() : null;
  }

  reading(e) {
    if (e.beta === null || e.gamma === null) return;
    this.live = true;
    // Device to earth (z up) is Rz(alpha) Rx(beta) Ry(gamma). Without alpha
    // (no gyro) turning is lost but walking still works.
    this.euler.set(e.beta * RAD, e.gamma * RAD, (e.alpha || 0) * RAD, 'ZXY');
    this.raw.setFromEuler(this.euler);
    // Turn the device frame into the screen's, so y is screen-up in landscape too.
    const a = ((screen.orientation ? screen.orientation.angle : window.orientation) || 0) * RAD;
    this.raw.multiply(this.screen.setFromAxisAngle(Z, -a));
    if (this.q) this.q.slerp(this.raw, SMOOTH);
    else this.q = this.raw.clone();
    if (!this.q0) this.q0 = this.q.clone();
  }

  // { step, turn }, each in [-1, 1].
  read() {
    if (!this.q || !this.q0) return { step: 0, turn: 0 };
    this.rel.copy(this.q0).invert().multiply(this.q);
    this.euler.setFromQuaternion(this.rel, 'YXZ');
    // Tipping the top away is a negative turn about screen-right. Turning left,
    // counter-clockwise seen from above, is positive about screen-up.
    return {
      step: STEP_SIGN * speed(-this.euler.x / RAD, DEAD, FULL),
      turn: TURN_SIGN * speed(this.euler.y / RAD, TURN_DEAD, TURN_FULL),
    };
  }
}

function speed(deg, dead, full) {
  return Math.sign(deg) * THREE.MathUtils.clamp((Math.abs(deg) - dead) / (full - dead), 0, 1);
}

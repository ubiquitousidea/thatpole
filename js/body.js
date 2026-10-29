import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Simple-form people that articulate like a body: chunky flat-shaded capsules
// on a joint hierarchy (pelvis, spine, neck; shoulders, elbows; hips, knees).
// The root sits on the floor between the feet and faces local +z.
//
// Every joint eases toward a target rotation, so poses blend. A pose sets the
// targets from a table of angles; reach() bends an arm onto a point with
// two-bone IK; look() turns the head toward a point; lean() tips the whole
// body about the feet.
//
// Angle signs, for a body facing +z: thigh/upper-arm x < 0 swings the limb
// forward; shin/forearm x > 0 bends the knee back, x < 0 bends the elbow up;
// spine/neck x > 0 bows forward; left is +x.

export const SKIN = ['#f3d2b3', '#e8b98f', '#d19a6a', '#b07a4f', '#8a5634', '#5e3a22'];
const TOPS = ['#2b2d42', '#8d99ae', '#b5303a', '#3a5a40', '#6d597a', '#d08b2c', '#335c67', '#7a2e2e',
  '#1f3b6e', '#e0b33a', '#26465c', '#c9654a', '#5b6d4e', '#a7a9ac', '#402a4f'];
const BOTTOMS = ['#1d1d1d', '#2f3e46', '#3d405b', '#5f5a4a', '#22223b', '#495057', '#3b4f7a'];
const HAIR = ['#1b1410', '#3b2516', '#6b4423', '#a8743a', '#d9c27a', '#8a8a8a', '#0e0e0e'];
const SHOES = ['#111111', '#f0f0f0', '#5a3a22', '#2a2a40'];

const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();

// Parts are built with one material per color, then baked into one
// vertex-colored skinned mesh whose bones are the joints (see skin), so a body
// is one draw. A split body (the player's own) bakes each joint separately
// instead, so parts of it can be hidden.
const mats = new Map();
function mat(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
  return mats.get(color);
}
const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
const CAPSULE = new THREE.CapsuleGeometry(0.5, 1, 2, 6);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const HEAD = new THREE.IcosahedronGeometry(1, 1);
const CAP = new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);

// A capsule hanging down from a joint: radius r, overall length len.
function limb(color, r, len) {
  const m = new THREE.Mesh(CAPSULE, mat(color));
  m.scale.set(2 * r, len - 2 * r, 2 * r);
  m.position.y = -len / 2;
  m.castShadow = false;
  return m;
}

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  g.userData.target = new THREE.Quaternion();
  parent.add(g);
  return g;
}

export class Body {
  // rand: a seeded random function. opts: { height, skin, top, bottom, split, ... }.
  constructor(rand, opts = {}) {
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const h = opts.height || 1.5 + rand() * 0.3;
    const b = opts.build || 0.85 + rand() * 0.15;
    const skin = opts.skin || pick(SKIN);
    const top = opts.top || pick(TOPS);
    const bottom = opts.bottom || pick(BOTTOMS);
    const hair = pick(HAIR);
    const shoe = pick(SHOES);
    this.h = h;
    const dims = this.dims = {
      thigh: 0.245 * h, shin: 0.245 * h, torso: 0.3 * h,
      upper: 0.17 * h, fore: 0.16 * h, hipW: 0.075 * h * b, shW: 0.095 * h * b,
    };
    this.hipH = dims.thigh + dims.shin + 0.03 * h;

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.pelvis = joint(this.root, 0, this.hipH, 0);
    const hips = new THREE.Mesh(BOX, mat(bottom));
    hips.scale.set(dims.hipW * 2 + 0.05, 0.12 * h, 0.12 * h * b);
    this.pelvis.add(hips);

    this.spine = joint(this.pelvis, 0, 0.03 * h, 0);
    const chest = new THREE.Mesh(BOX, mat(top));
    chest.scale.set(dims.shW * 2 + 0.02, dims.torso, 0.12 * h * b);
    chest.position.y = dims.torso / 2;
    this.spine.add(chest);
    if (rand() < 0.3) { // backpack
      const pack = new THREE.Mesh(BOX, mat(pick(TOPS)));
      pack.scale.set(dims.shW * 1.6, dims.torso * 0.75, 0.12);
      pack.position.set(0, dims.torso * 0.55, -0.06 * h * b - 0.07);
      this.spine.add(pack);
    }

    this.neck = joint(this.spine, 0, dims.torso, 0);
    const neck = limb(skin, 0.03 * h, 0.06 * h);
    neck.position.y = 0.03 * h;
    this.neck.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.105 * h;
    this.neck.add(this.head);
    const head = new THREE.Mesh(HEAD, mat(skin));
    head.scale.set(0.05 * h, 0.066 * h, 0.058 * h);
    this.head.add(head);
    const hat = rand() < 0.22;
    if (hat || rand() < 0.8) {
      const cap = new THREE.Mesh(CAP, mat(hat ? pick(TOPS) : hair));
      cap.scale.set(0.054 * h, (hat ? 0.066 : 0.052) * h, 0.062 * h);
      cap.position.set(0, 0.008 * h, -0.004 * h);
      this.head.add(cap);
    }
    // A nose and two eyes, so a glare reads from across the car.
    const nose = new THREE.Mesh(BOX, mat(skin));
    nose.scale.set(0.015 * h, 0.022 * h, 0.02 * h);
    nose.position.set(0, -0.005 * h, 0.056 * h);
    this.head.add(nose);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(BOX, mat('#141018'));
      eye.scale.set(0.014 * h, 0.012 * h, 0.01 * h);
      eye.position.set(side * 0.019 * h, 0.012 * h, 0.054 * h);
      this.head.add(eye);
    }

    this.arms = [1, -1].map((side) => {
      const sh = joint(this.spine, side * dims.shW, dims.torso - 0.03 * h, 0);
      sh.add(limb(top, 0.028 * h, dims.upper));
      const el = joint(sh, 0, -dims.upper, 0);
      el.add(limb(top, 0.024 * h, dims.fore));
      // A ball reads fine from across the car; the player's own hands are
      // right in front of the camera, so they get a fist instead.
      const hand = new THREE.Mesh(opts.fists ? BOX : HEAD, mat(skin));
      if (opts.fists) hand.scale.set(0.04 * h, 0.05 * h, 0.038 * h);
      else hand.scale.setScalar(0.025 * h);
      hand.position.y = -dims.fore - 0.01 * h;
      el.add(hand);
      return { side, sh, el, hand, ik: null };
    });
    this.legs = [1, -1].map((side) => {
      const hip = joint(this.pelvis, side * dims.hipW, -0.02 * h, 0);
      hip.add(limb(bottom, 0.042 * h, dims.thigh));
      const knee = joint(hip, 0, -dims.thigh, 0);
      knee.add(limb(bottom, 0.035 * h, dims.shin));
      const foot = new THREE.Mesh(BOX, mat(shoe));
      foot.scale.set(0.055 * h, 0.035 * h, 0.15 * h);
      foot.position.set(0, -dims.shin - 0.005 * h, 0.035 * h);
      knee.add(foot);
      return { side, hip, knee };
    });
    this.joints = [this.pelvis, this.spine, this.neck,
      ...this.arms.flatMap((a) => [a.sh, a.el]), ...this.legs.flatMap((l) => [l.hip, l.knee])];
    if (opts.split) for (const node of [...this.joints, this.head]) node.add(new THREE.Mesh(bake(node), BODY_MAT));
    else this.skin([...this.joints, this.head]);

    this.poseName = 'stand';
    this.pelvisY = this.hipH;
    this.pelvisZ = 0;
    this.walkPhase = rand() * 6;
    this.lookAt = null;
    this.tilt = { pitch: 0, roll: 0 };
    this.pose('stand');
    this.snap();
  }

  // Bake every node's parts into one mesh skinned to the nodes themselves,
  // bound in the rest pose, so posing the joints moves it as before.
  skin(nodes) {
    this.root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const geos = [];
    nodes.forEach((node, i) => {
      const g = bake(node);
      if (!g) return;
      g.applyMatrix4(_m.multiplyMatrices(toRoot, node.matrixWorld));
      const n = g.attributes.position.count;
      const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) {
        index[k * 4] = i;
        weight[k * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
      geos.push(g);
    });
    const mesh = new THREE.SkinnedMesh(mergeGeometries(geos), BODY_MAT);
    this.root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(nodes));
    // Culling uses this, not the posed vertices: big enough for any lean.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, this.h * 0.5, 0), this.h * 0.8);
    mesh.receiveShadow = true;
  }

  // For the player, whose eyes are the camera (a split body).
  hideHead() {
    this.head.visible = false;
    for (const c of this.neck.children) if (c.isMesh) c.visible = false;
  }

  get position() {
    return this.root.position;
  }

  // Facing as a yaw: the body's forward is (sin yaw, 0, cos yaw).
  set facing(yaw) {
    this.yaw = yaw;
  }

  // name: stand | walk | sit | spread | phone | stumble | hold. Arms set with
  // reach() override the table.
  pose(name, opts = {}) {
    this.poseName = name;
    this.poseOpts = opts;
  }

  // Bend arm 0 (left) or 1 (right) onto a world point, or null to let go.
  reach(i, point) {
    const arm = this.arms[i];
    if (!point) arm.ik = null;
    else (arm.ik ||= new THREE.Vector3()).copy(point);
  }

  look(point) {
    if (!point) this.lookAt = null;
    else (this.lookAt ||= new THREE.Vector3()).copy(point);
  }

  lean(pitch, roll = 0) {
    this.tilt.pitch = pitch;
    this.tilt.roll = roll;
  }

  headWorld(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out);
  }

  setTargets(dt) {
    const n = this.poseName, o = this.poseOpts || {};
    const T = {}; // joint name -> [x, y, z]
    let py = this.hipH, pz = 0;
    if (n === 'walk' || n === 'stumble') this.walkPhase += dt * (n === 'stumble' ? 14 : 8);
    const s = Math.sin(this.walkPhase);
    if (n === 'stand' || n === 'hold' || n === 'phone') {
      T.lUpper = [0, 0, 0.1]; T.rUpper = [0, 0, -0.1];
      T.lFore = [-0.15, 0, 0]; T.rFore = [-0.15, 0, 0];
      T.lHip = [0, 0, 0.06]; T.rHip = [0, 0, -0.06];
    }
    if (n === 'phone') {
      T.lUpper = [-0.35, 0, -0.15]; T.rUpper = [-0.35, 0, 0.15];
      T.lFore = [-1.5, 0.3, 0]; T.rFore = [-1.5, -0.3, 0];
      T.neck = [0.5, 0, 0];
    }
    if (n === 'walk') {
      T.lHip = [-0.45 * s, 0, 0.04]; T.rHip = [0.45 * s, 0, -0.04];
      T.lKnee = [0.6 * Math.max(0, Math.sin(this.walkPhase - 1.2)), 0, 0];
      T.rKnee = [0.6 * Math.max(0, -Math.sin(this.walkPhase - 1.2)), 0, 0];
      T.lUpper = [0.35 * s, 0, 0.1]; T.rUpper = [-0.35 * s, 0, -0.1];
      T.lFore = [-0.3, 0, 0]; T.rFore = [-0.3, 0, 0];
      py -= 0.015 * Math.abs(Math.cos(this.walkPhase));
    }
    if (n === 'stumble') {
      T.lHip = [-0.6 * s, 0, 0.15]; T.rHip = [0.6 * s, 0, -0.15];
      T.lKnee = [0.5, 0, 0]; T.rKnee = [0.5, 0, 0];
      T.lUpper = [-2.4 + 0.5 * s, 0, 0.6]; T.rUpper = [-2.4 - 0.5 * s, 0, -0.6];
      T.lFore = [-0.4, 0, 0]; T.rFore = [-0.4, 0, 0];
      T.spine = [0.25, 0, 0];
    }
    if (n === 'sit' || n === 'spread') {
      const spread = n === 'spread' ? 0.5 : 0.08;
      py = this.dims.shin + 0.05 * this.h;
      pz = -0.04;
      T.lHip = [-1.5, spread, 0]; T.rHip = [-1.5, -spread, 0];
      T.lKnee = [1.5 - (n === 'spread' ? 0.15 : 0), 0, 0]; T.rKnee = [...T.lKnee];
      T.spine = [-0.08, 0, 0];
      if (n === 'spread') {
        T.lUpper = [-0.1, 0, 0.5]; T.rUpper = [-0.1, 0, -0.5];
        T.lFore = [-0.7, 0, 0]; T.rFore = [-0.7, 0, 0];
        T.spine = [-0.2, 0, 0];
      } else {
        T.lUpper = [-0.3, 0, 0.05]; T.rUpper = [-0.3, 0, -0.05];
        T.lFore = [-1.1, 0, 0]; T.rFore = [-1.1, 0, 0];
      }
      if (o.phone) {
        T.lFore = [-1.6, 0.4, 0]; T.rFore = [-1.6, -0.4, 0];
        T.neck = [0.55, 0, 0];
      }
    }
    this.pelvisY = py;
    this.pelvisZ = pz;
    const set = (g, e) => g.userData.target.setFromEuler(_e.set(e ? e[0] : 0, e ? e[1] : 0, e ? e[2] : 0, 'YXZ'));
    set(this.pelvis, T.pelvis);
    set(this.spine, T.spine);
    set(this.neck, T.neck);
    set(this.arms[0].sh, T.lUpper); set(this.arms[0].el, T.lFore);
    set(this.arms[1].sh, T.rUpper); set(this.arms[1].el, T.rFore);
    set(this.legs[0].hip, T.lHip); set(this.legs[0].knee, T.lKnee);
    set(this.legs[1].hip, T.rHip); set(this.legs[1].knee, T.rKnee);
  }

  // Jump straight to the targets (no easing), e.g. when placing a new rider.
  snap() {
    this.setTargets(0);
    this.place();
    for (const g of this.joints) g.quaternion.copy(g.userData.target);
    this.pelvis.position.set(0, this.pelvisY, this.pelvisZ);
    this.root.updateMatrixWorld(true);
  }

  place() {
    this.root.rotation.set(this.tilt.pitch, this.yaw || 0, this.tilt.roll, 'YXZ');
  }

  update(dt) {
    this.setTargets(dt);
    this.place();
    const k = 1 - Math.exp(-dt / 0.12);
    this.pelvis.position.y += (this.pelvisY - this.pelvis.position.y) * k;
    this.pelvis.position.z += (this.pelvisZ - this.pelvis.position.z) * k;
    this.root.updateMatrixWorld(true);
    for (const arm of this.arms) if (arm.ik) this.solveArm(arm);
    if (this.lookAt) this.solveLook();
    for (const g of this.joints) g.quaternion.slerp(g.userData.target, k);
  }

  // Two-bone IK: point the upper arm so the hand lands on arm.ik, with the
  // elbow bending down and out.
  solveArm(arm) {
    const { upper, fore } = this.dims;
    const handLen = fore + 0.01 * this.h;
    const parent = arm.sh.parent;
    _m.copy(parent.matrixWorld).invert();
    const local = _v.copy(arm.ik).applyMatrix4(_m).sub(arm.sh.position);
    const reach = upper + handLen;
    const L = Math.min(Math.max(local.length(), 0.05), reach - 0.001);
    const d = local.normalize();
    const hint = _w.set(arm.side * 0.6, -1, -0.4).normalize();
    const axis = new THREE.Vector3().crossVectors(d, hint);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const alpha = Math.acos(THREE.MathUtils.clamp((upper * upper + L * L - handLen * handLen) / (2 * upper * L), -1, 1));
    const bend = Math.PI - Math.acos(THREE.MathUtils.clamp((upper * upper + handLen * handLen - L * L) / (2 * upper * handLen), -1, 1));
    const t = arm.sh.userData.target;
    t.setFromUnitVectors(DOWN, d).premultiply(_q.setFromAxisAngle(axis, alpha));
    const axisLocal = axis.applyQuaternion(_q.copy(t).invert());
    arm.el.userData.target.setFromAxisAngle(axisLocal, -bend);
  }

  // Turn the neck toward lookAt, within what a neck can do.
  solveLook() {
    _m.copy(this.spine.matrixWorld).invert();
    const local = _v.copy(this.lookAt).applyMatrix4(_m).sub(this.neck.position);
    const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.3, 1.3);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 0.1 * this.h, Math.hypot(local.x, local.z)), -0.5, 0.6);
    this.neck.userData.target.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  }
}

// Merge a node's own meshes into one geometry in the node's space, with each
// part's color as vertex colors, and take the parts off the node.
function bake(node) {
  const parts = node.children.filter((c) => c.isMesh);
  if (parts.length === 0) return null;
  const geos = parts.map((m) => {
    m.updateMatrix();
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    g.deleteAttribute('uv');
    const c = m.material.color, n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    node.remove(m);
    return g;
  });
  return geos.length === 1 ? geos[0] : mergeGeometries(geos);
}

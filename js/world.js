import * as THREE from 'three';
import { buildCar } from './car.js';
import { Route } from './route.js';
import { ROUTE_LEN } from './ride.js';
import { VIEW } from './settings.js';
import { sunInCar } from './sun.js';

// The scene: the car at the origin, the route sliding past outside, sky, fog
// and lights that follow daylight into the tunnel. The sun sits where it is at
// the entry time you picked (setTime), and casts shadows from the car's shell
// and the elevated structure through a small shadow map around the car (the
// car never moves, so neither does the shadow camera). Rendered first-person on
// the scene grid (L.scene) through a fisheye lens: the camera renders a wide
// plain-perspective view into a target, and one full-screen pass bends it.
//
// Lens math, in half-height units with aspect a and corner radius c: an
// output point p sees the ray at angle theta = K atan(|p| / c * tan(TC / K))
// off the axis, which in the target is at p/|p| * tan(theta) / T, where
// T = tan(TC) / c is the target's vertical half-tan. The corners see TC.

// Sky and sun colors with the sun low (dawn) and well up (day). setTime blends
// them by the sun's elevation.
const DAWN = { horizon: '#efc9a6', zenith: '#6e8cc0', glow: '#ffb27a', sun: '#ffab66', hemi: '#ffe2c4' };
const DAY = { horizon: '#d3e6f5', zenith: '#5a95d6', glow: '#fff1d6', sun: '#fff3dc', hemi: '#dbe9ff' };
const DARK = new THREE.Color('#050506');
const SUN_DIST = 100;   // the shadow camera sits this far toward the sun
const SHADOW_HALF = 14; // and covers this far either side of the car

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.lens = lensPass(this.target.texture);
    this.fogColor = new THREE.Color();
    this.horizon = new THREE.Color(DAY.horizon);
    this.scene.fog = new THREE.Fog(this.horizon, 60, 700);
    this.scene.background = new THREE.Color();

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // hard edges, like the pixels
    this.hemi = new THREE.HemisphereLight(DAY.hemi, '#6b6256', 1.2);
    this.sun = new THREE.DirectionalLight(DAY.sun, 2.2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -SHADOW_HALF;
    sc.right = sc.top = SHADOW_HALF;
    sc.near = 1;
    sc.far = SUN_DIST * 2;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sunBase = 2.2;
    this.scene.add(this.hemi, this.sun);
    // The car's own lighting, which also spills onto the tunnel walls.
    this.lamps = [-6, 0, 6].map((z) => {
      const l = new THREE.PointLight('#ffecc8', 7, 9, 1.2);
      l.position.set(0, 2.05, z);
      this.scene.add(l);
      return l;
    });

    this.sky = skyDome();
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 12), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, depthWrite: false }));
    this.sunDisc.renderOrder = -1;
    this.sky.add(this.sunDisc);
    this.scene.add(this.sky);
    this.car = buildCar();
    this.route = new Route();
    this.scene.add(this.car.group, this.route.group);
    this.setTime(8);
  }

  // Put the sun where it is at this hour (sun.js), and color the light and
  // sky to match: low and orange at 7, up and white by 9.
  setTime(hour) {
    const s = sunInCar(hour);
    const dir = new THREE.Vector3(s.x, s.y, s.z);
    const t = THREE.MathUtils.smoothstep(s.elevation, 2, 28);
    const mix = (k) => new THREE.Color(DAWN[k]).lerp(new THREE.Color(DAY[k]), t);
    this.sun.position.copy(dir).multiplyScalar(SUN_DIST);
    this.sun.color.copy(mix('sun'));
    this.sunBase = 2.6 + 0.6 * t; // strong enough that sun through a window reads
    this.hemi.color.copy(mix('hemi'));
    this.horizon.copy(mix('horizon'));
    paintSky(this.sky, this.horizon, mix('zenith'), mix('glow'), dir, 1 - 0.6 * t);
    this.sunDisc.position.copy(dir).multiplyScalar(1100);
    this.sunDisc.lookAt(0, 0, 0);
    this.sunDisc.material.color.copy(mix('sun')).lerp(new THREE.Color('#ffffff'), 0.5);
  }

  resize(L) {
    this.L = L;
    const a = L.scene.W / L.scene.H, c = Math.hypot(a, 1);
    const tc = THREE.MathUtils.degToRad(VIEW.corner), k = VIEW.fisheye;
    const T = Math.tan(tc) / c, s = Math.tan(tc / k);
    this.lensK = { a, c, T, k, s };
    this.camera.aspect = a;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(T));
    this.camera.updateProjectionMatrix();
    // The output's half-angles at the middle of each edge, for anything that
    // has to stay in view.
    this.camera.userData.view = { h: k * Math.atan((a / c) * s), v: k * Math.atan(s / c) };
    // The middle of the view is magnified by tan(TC) / tan(TC / K).
    const ss = Math.max(1, Math.min(VIEW.supersample, Math.tan(tc) / s));
    this.target.setSize(Math.round(L.scene.W * ss), Math.round(L.scene.H * ss));
    const u = this.lens.uniforms;
    u.aspect.value = a;
    u.corner.value = c;
    u.tanT.value = T;
    u.kappa.value = k;
    u.tanK.value = s;
  }

  // Like Vector3.project, but onto the fisheye screen: v ends up in NDC.
  project(v) {
    const { a, c, T, k, s } = this.lensK;
    v.project(this.camera);
    const qx = v.x * a * T, qy = v.y * T, q = Math.hypot(qx, qy);
    if (q > 1e-6) {
      const r = (c * Math.tan(Math.atan(q) / k)) / s;
      v.x = ((qx / q) * r) / a;
      v.y = (qy / q) * r;
    }
    return v;
  }

  // s: the ride state from ride.at(t) (or a stand-in while dwelling).
  update(s) {
    this.route.place(s.u);
    const day = s.daylight;
    const station = Math.max(0, 1 - Math.abs(s.u - ROUTE_LEN) / 90);
    this.sky.visible = day > 0.02;
    this.hemi.intensity = 0.6 + 0.65 * day + 0.5 * station;
    this.sun.intensity = this.sunBase * day;
    // No sun underground: skip the shadow pass (the map just goes stale).
    this.renderer.shadowMap.autoUpdate = day > 0.02;
    this.fogColor.copy(DARK).lerp(this.horizon, day);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.background.copy(this.fogColor);
    this.scene.fog.near = 12 + 50 * day;
    this.scene.fog.far = 70 + 630 * day;
    const on = !s.flicker;
    this.car.setLights(on);
    for (const l of this.lamps) l.intensity = on ? 7 : 1.5;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.lens.mesh, this.lens.camera);
  }
}

// The full-screen pass that bends the target into the fisheye view.
function lensPass(texture) {
  const uniforms = {
    src: { value: texture },
    aspect: { value: 1 }, corner: { value: 1 }, tanT: { value: 1 }, kappa: { value: 1 }, tanK: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D src;
      uniform float aspect, corner, tanT, kappa, tanK;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0);
        float r = length(p);
        vec2 q = r > 1e-5 ? p / r * tan(kappa * atan(r / corner * tanK)) / tanT : p;
        gl_FragColor = texture2D(src, q / vec2(aspect, 1.0) * 0.5 + 0.5);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  return { mesh, uniforms, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1200, 32, 16);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  mesh.renderOrder = -1;
  return mesh;
}

// Horizon to zenith, plus a warm glow around the sun that's strongest when
// the sun is low.
function paintSky(sky, horizon, zenith, glow, sunDir, glowAmt) {
  const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
  const c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    c.copy(horizon).lerp(zenith, Math.pow(Math.max(0, v.y), 0.6));
    const g = Math.pow(Math.max(0, v.dot(sunDir)), 6) * glowAmt * (1 - 0.6 * Math.max(0, v.y));
    c.lerp(glow, Math.min(1, g));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

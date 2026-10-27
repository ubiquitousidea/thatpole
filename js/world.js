import * as THREE from 'three';
import { buildCar } from './car.js';
import { Route } from './route.js';
import { ROUTE_LEN } from './ride.js';

// The scene: the car at the origin, the route sliding past outside, sky, fog
// and lights that follow daylight into the tunnel. Rendered first-person on
// the scene grid (L.scene).

const SKY = { horizon: new THREE.Color('#d3e6f5'), zenith: new THREE.Color('#5a95d6') };
const DARK = new THREE.Color('#050506');

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.fogColor = new THREE.Color();
    this.scene.fog = new THREE.Fog(SKY.horizon, 60, 700);
    this.scene.background = new THREE.Color();

    this.hemi = new THREE.HemisphereLight('#dbe9ff', '#6b6256', 1.2);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.position.set(40, 60, 20);
    this.scene.add(this.hemi, this.sun);
    // The car's own lighting, which also spills onto the tunnel walls.
    this.lamps = [-6, 0, 6].map((z) => {
      const l = new THREE.PointLight('#ffecc8', 7, 9, 1.2);
      l.position.set(0, 2.05, z);
      this.scene.add(l);
      return l;
    });

    this.sky = skyDome();
    this.scene.add(this.sky);
    this.car = buildCar();
    this.route = new Route();
    this.scene.add(this.car.group, this.route.group);
  }

  resize(L) {
    this.L = L;
    this.camera.aspect = L.scene.W / L.scene.H;
    this.camera.updateProjectionMatrix();
  }

  // s: the ride state from ride.at(t) (or a stand-in while dwelling).
  update(s) {
    this.route.place(s.u);
    const day = s.daylight;
    const station = Math.max(0, 1 - Math.abs(s.u - ROUTE_LEN) / 90);
    this.sky.visible = day > 0.02;
    this.hemi.intensity = 0.6 + 0.65 * day + 0.5 * station;
    this.sun.intensity = 2.2 * day;
    this.fogColor.copy(DARK).lerp(SKY.horizon, day);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.background.copy(this.fogColor);
    this.scene.fog.near = 12 + 50 * day;
    this.scene.fog.far = 70 + 630 * day;
    const on = !s.flicker;
    this.car.setLights(on);
    for (const l of this.lamps) l.intensity = on ? 7 : 1.5;
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }
}

function skyDome() {
  const geo = new THREE.SphereGeometry(1200, 24, 12);
  const pos = geo.attributes.position, col = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 1200);
    c.copy(SKY.horizon).lerp(SKY.zenith, Math.pow(t, 0.6));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  mesh.renderOrder = -1;
  return mesh;
}

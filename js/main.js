import * as THREE from 'three';
import { Hud, LINE_H } from './hud.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Game } from './game.js';
import { sfx } from './sfx.js';
import { SCENE_RES, HUD_RES } from './settings.js';

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: false });
renderer.setPixelRatio(1);
renderer.autoClear = false;
const hud = new Hud($('hud'));

// Low-res layout shared by every layer. PX is the size of one HUD "fat pixel"
// in CSS pixels. The 3D view uses its own, coarser grid in L.scene, sized so
// the screen is about SCENE_RES fat pixels tall on every device.
function computeLayout() {
  const cw = window.innerWidth, ch = window.innerHeight;
  const PX = Math.max(1, Math.round(Math.min(cw / HUD_RES.w, ch / HUD_RES.h)));
  const W = Math.ceil(cw / PX), H = Math.ceil(ch / PX);
  const nh = 12 + (W < 440 ? 5 : 4) * LINE_H;
  const narr = { x: 8, y: H - nh - 8, w: W - 16, h: nh };
  const dpr = window.devicePixelRatio || 1;
  const dev = Math.max(Math.round(PX * dpr), Math.round((ch * dpr) / SCENE_RES));
  const SPX = dev / dpr;
  const scene = { PX: SPX, W: Math.ceil(cw / SPX), H: Math.ceil(ch / SPX) };
  return { PX, W, H, narr, scene };
}

const ui = {
  bar: $('btnbar'),
  actionBtn: $('action'),
  onAction: null,
  actionLabel: null,

  setButtons(list) {
    this.bar.replaceChildren(...list.map((b) => {
      const el = document.createElement('button');
      el.className = `btn ${b.kind || ''}`;
      el.textContent = b.label;
      el.disabled = !!b.disabled;
      el.addEventListener('click', () => {
        sfx.click();
        b.onClick();
      });
      return el;
    }));
  },

  // The context button: what SPACE does right now. Only touches the DOM on change.
  setAction(label) {
    if (label === this.actionLabel) return;
    this.actionLabel = label;
    this.actionBtn.hidden = !label;
    if (label) this.actionBtn.textContent = label;
  },

  layout(L) {
    document.documentElement.style.setProperty('--px', `${L.PX}px`);
    Object.assign(this.bar.style, {
      right: `${window.innerWidth - (L.W - 8) * L.PX}px`,
      bottom: `${window.innerHeight - (L.narr.y - 3) * L.PX}px`,
    });
    Object.assign(this.actionBtn.style, {
      left: `${8 * L.PX}px`,
      bottom: `${window.innerHeight - (L.narr.y - 3) * L.PX}px`,
    });
  },
};
ui.actionBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (ui.onAction) ui.onAction();
});
// Keep SPACE from also pressing whichever button has focus.
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('click', (e) => {
  if (e.target instanceof HTMLButtonElement) e.target.blur();
});

let world, game;

function resize() {
  const L = computeLayout();
  renderer.setSize(L.scene.W, L.scene.H, false);
  const canvas = $('scene');
  canvas.style.width = `${L.scene.W * L.scene.PX}px`;
  canvas.style.height = `${L.scene.H * L.scene.PX}px`;
  if (world) world.resize(L);
  hud.resize(L);
  ui.layout(L);
}

window.addEventListener('resize', resize);
resize();

// Wait for the pixel font: the signs and maps are drawn with it.
document.fonts.load('8px "Press Start 2P"').catch(() => {}).finally(() => {
  world = new World(renderer);
  const player = new Player(world.scene, world.camera);
  game = new Game({ world, player, hud, ui });
  window.__game = game;
  resize();
  game.title();
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    world.render();
    hud.draw(game, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});

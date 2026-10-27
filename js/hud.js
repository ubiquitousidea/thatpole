import * as THREE from 'three';
import { GRIP_LIMIT, FREE_LIMIT } from './player.js';

// Everything textual is drawn on a low-resolution canvas so it pixelates along
// with the scene. Only the DOM buttons stay crisp. Canvas text must be ASCII:
// Press Start 2P has no curly quotes, dashes or arrows.

const FONT = '"Press Start 2P", monospace';
export const LINE_H = 11;
const TYPE_SPEED = 90; // characters per second
const PANEL = 'rgba(8,10,28,0.82)';
const EDGE = '#8fa2ff';
const _v = new THREE.Vector3();

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.text = '';
    this.typed = 0;
    this.toasts = [];
  }

  resize(L) {
    this.L = L;
    this.canvas.width = L.W;
    this.canvas.height = L.H;
    this.canvas.style.width = `${L.W * L.PX}px`;
    this.canvas.style.height = `${L.H * L.PX}px`;
  }

  say(text) {
    if (text === this.text) return;
    this.text = text;
    this.typed = 0;
  }

  get typing() {
    return this.typed < this.text.length;
  }

  finishTyping() {
    this.typed = this.text.length;
  }

  // A message that floats up the middle of the screen.
  toast(text, color = '#fff', y = null) {
    this.toasts.push({ text, x: this.L.W / 2, y: y ?? this.L.H * 0.42, t: 0, color });
  }

  txt(s, x, y, color = '#fff', size = 8, align = 'left') {
    const c = this.ctx;
    c.font = `${size}px ${FONT}`;
    c.textAlign = align;
    c.fillStyle = 'rgba(0,0,0,0.75)';
    c.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
    c.fillStyle = color;
    c.fillText(s, Math.round(x), Math.round(y));
  }

  frame(x, y, w, h, fill = PANEL, edge = EDGE) {
    const c = this.ctx;
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
    c.strokeStyle = edge;
    c.lineWidth = 1;
    c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }

  draw(g, dt) {
    const c = this.ctx;
    c.clearRect(0, 0, this.L.W, this.L.H);
    c.textBaseline = 'top';
    this.typed = Math.min(this.text.length, this.typed + dt * TYPE_SPEED);
    if (g.state === 'title') this.drawTitle();
    else {
      this.drawStatus(g);
      if (g.player.aboard && g.state !== 'end') {
        this.drawBalance(g);
        this.drawMood(g);
      }
      this.drawBubbles(g);
    }
    this.drawToasts(dt);
    if (g.state === 'end') this.drawEnd(g);
    this.drawNarration();
  }

  drawTitle() {
    const { W, H } = this.L;
    const big = W >= 360 ? 16 : 8;
    const y = Math.round(H * 0.16);
    this.frame(W / 2 - 4 - (big * 16) / 2 - 8, y - 8, big * 16 + 24, big * 2 + 34, 'rgba(8,10,28,0.7)');
    this.txt('GET ON THAT POLE', W / 2, y, '#fccc0a', big, 'center');
    this.txt('MANHATTAN-BOUND N TRAIN', W / 2, y + big + 8, '#dfe4ff', 8, 'center');
    this.txt('QUEENSBORO PLAZA > LEXINGTON AV/59 ST', W / 2, y + big + 20, '#9aa6e8', 8, 'center');
  }

  drawStatus(g) {
    const c = this.ctx;
    c.fillStyle = '#fccc0a';
    c.beginPath();
    c.arc(14, 13, 7, 0, Math.PI * 2);
    c.fill();
    this.txt('N', 14, 10, '#111', 8, 'center');
    this.txt('MANHATTAN-BOUND', 26, 6, '#fff');
    this.txt(g.statusLine(), 26, 17, '#9aa6e8');
    const timer = g.doorTimer();
    if (timer !== null) {
      const urgent = timer < 6 && Math.floor(performance.now() / 250) % 2;
      this.txt(`DOORS CLOSE ${Math.ceil(timer)}`, 8, 30, urgent ? '#ff6b6b' : '#ffd34d');
    }
  }

  // The pendulum: a bar with a tick for how far you lean, red past the limit.
  drawBalance(g) {
    const p = g.player;
    if (p.mode === 'sit') return;
    const limit = p.mode === 'hold' ? GRIP_LIMIT : FREE_LIMIT;
    // Centered just above the narration box, clear of the button rows.
    const w = Math.min(140, this.L.W - 32), h = 9;
    const x = Math.round(this.L.W / 2 - w / 2), y = this.L.narr.y - 46;
    this.frame(x - 2, y - 2, w + 4, h + 4);
    const c = this.ctx;
    const grad = [[0, '#ff4d4d'], [0.18, '#ffd34d'], [0.35, '#5fe08a'], [0.65, '#5fe08a'], [0.82, '#ffd34d'], [1, '#ff4d4d']];
    for (let i = 0; i < w; i++) {
      const f = i / w;
      let col = grad[0][1];
      for (const [k, cc] of grad) if (f >= k) col = cc;
      c.fillStyle = col;
      c.fillRect(x + i, y, 1, h);
    }
    // theta > 0 leans toward the front of the train, drawn to the right.
    const f = THREE.MathUtils.clamp(p.theta / limit, -1.1, 1.1);
    const tx = Math.round(x + w / 2 + (f * w) / 2);
    c.fillStyle = '#000';
    c.fillRect(tx - 2, y - 3, 5, h + 6);
    c.fillStyle = '#fff';
    c.fillRect(tx - 1, y - 2, 3, h + 4);
    this.txt(p.mode === 'hold' ? 'BACK  BALANCE  FRONT' : 'BACK  FOOTING  FRONT', this.L.W / 2, y + h + 5, '#dfe4ff', 8, 'center');
    if (p.mode === 'hold' && Math.abs(f) > 0.55 && Math.floor(performance.now() / 200) % 2) {
      this.txt(f < 0 ? 'LEAN FORWARD! (UP)' : 'LEAN BACK! (DOWN)', this.L.W / 2, y - 14, '#ff6b6b', 8, 'center');
    }
    if (p.mode === 'walk' && g.state === 'ride') {
      this.txt(g.touch ? 'GRAB A POLE!' : 'GRAB A POLE! (SPACE)', this.L.W / 2, y - 14, '#ffd34d', 8, 'center');
    }
  }

  drawMood(g) {
    const m = g.riders.mood();
    const w = 64, x = this.L.W - w - 10, y = 8;
    this.frame(x - 2, y - 2, w + 4, 13);
    const c = this.ctx;
    const col = m < 0.4 ? '#5fe08a' : m < 0.7 ? '#ffd34d' : '#ff4d4d';
    c.fillStyle = '#222638';
    c.fillRect(x, y, w, 9);
    c.fillStyle = col;
    c.fillRect(x, y, Math.round(w * Math.min(1, m)), 9);
    this.txt('CAR MOOD', x + w + 2, y + 14, m > 0.7 ? '#ff6b6b' : '#dfe4ff', 8, 'right');
  }

  // Speech bubbles over riders' heads. Riders out of view speak from the
  // screen edge, with an arrow toward them.
  drawBubbles(g) {
    const cam = g.world.camera;
    const { W, H } = this.L;
    const top = 44, bottom = this.L.narr.y - 30;
    const boxes = [];
    for (const b of g.riders.bubbles) {
      b.rider.body.headWorld(_v);
      _v.y += 0.18;
      const cv = _v.clone().applyMatrix4(cam.matrixWorldInverse);
      const behind = cv.z > -0.1;
      _v.project(cam);
      let x = ((_v.x + 1) / 2) * W, y = ((1 - _v.y) / 2) * H;
      let edge = 0;
      if (behind || x < 0 || x > W) {
        edge = cv.x < 0 ? -1 : 1;
        x = edge < 0 ? 4 : W - 4;
        y = H * 0.4;
      }
      const lines = wrap(b.text, 16);
      const bw = Math.max(...lines.map((l) => l.length)) * 8 + 8;
      const bh = lines.length * 10 + 5;
      let bx = edge < 0 ? 4 : edge > 0 ? W - 4 - bw : x - bw / 2;
      bx = THREE.MathUtils.clamp(bx, 4, W - 4 - bw);
      let by = THREE.MathUtils.clamp(y - bh - 6, top, bottom - bh);
      for (const o of boxes) {
        if (bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h + 2 && by + bh + 2 > o.y) by = o.y + o.h + 3;
      }
      boxes.push({ x: bx, y: by, w: bw, h: bh, lines, b, ax: x, ay: y, edge });
    }
    const c = this.ctx;
    for (const o of boxes) {
      const fade = Math.min(1, (o.b.life - o.b.t) * 3, o.b.t * 8);
      c.globalAlpha = fade;
      const hostile = o.b.loud;
      const fill = hostile ? '#fff1f0' : '#ffffff';
      const ink = hostile ? '#c4161c' : '#111';
      c.fillStyle = '#000';
      c.fillRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
      c.fillStyle = fill;
      c.fillRect(o.x, o.y, o.w, o.h);
      // The tail, toward the speaker (or the screen edge).
      c.fillStyle = fill;
      if (o.edge) {
        const tx = o.edge < 0 ? o.x - 4 : o.x + o.w;
        for (let i = 0; i < 4; i++) c.fillRect(o.edge < 0 ? tx + i : tx + 3 - i, o.y + o.h / 2 - (4 - i), 1, 2 * (4 - i));
      } else {
        const tx = THREE.MathUtils.clamp(Math.round(o.ax), o.x + 3, o.x + o.w - 6);
        for (let i = 0; i < 4; i++) c.fillRect(tx + i, o.y + o.h + i, 4 - i, 1);
      }
      o.lines.forEach((l, i) => this.txt(l, o.x + 4, o.y + 4 + i * 10, ink));
      c.globalAlpha = 1;
    }
  }

  drawToasts(dt) {
    const c = this.ctx;
    this.toasts = this.toasts.filter((t) => {
      t.t += dt;
      if (t.t > 1.4) return false;
      c.globalAlpha = Math.min(1, 1.4 - t.t);
      this.txt(t.text, t.x, t.y - t.t * 16, t.color, 16, 'center');
      c.globalAlpha = 1;
      return true;
    });
  }

  drawEnd(g) {
    const r = g.result;
    if (!r) return;
    const { W } = this.L;
    const w = Math.min(W - 16, 300), x = Math.round(W / 2 - w / 2), y = 40;
    const rows = r.rows;
    const h = 46 + rows.length * LINE_H + 22;
    this.frame(x, y, w, h);
    this.txt(r.title, W / 2, y + 8, r.win ? '#7dff9a' : '#ff6b6b', w > 270 ? 16 : 8, 'center');
    rows.forEach(([label, value], i) => {
      const ry = y + 34 + i * LINE_H;
      this.txt(label, x + 10, ry, '#dfe4ff');
      this.txt(String(value), x + w - 10, ry, '#fff', 8, 'right');
    });
    this.txt(`RANK: ${r.rank}`, W / 2, y + h - 18, '#fccc0a', 8, 'center');
  }

  drawNarration() {
    if (!this.text) return;
    const c = this.ctx;
    const { x, y, w, h } = this.L.narr;
    c.fillStyle = 'rgba(8,10,28,0.88)';
    c.fillRect(x, y, w, h);
    c.fillStyle = EDGE;
    c.fillRect(x, y, w, 1);
    c.fillRect(x, y + h - 1, w, 1);
    c.fillRect(x, y, 1, h);
    c.fillRect(x + w - 1, y, 1, h);
    c.fillStyle = '#2a3170';
    c.fillRect(x + 2, y + 2, w - 4, 1);

    const lines = wrap(this.text, Math.floor((w - 16) / 8));
    let budget = Math.floor(this.typed);
    lines.forEach((line, i) => {
      if (budget <= 0) return;
      this.txt(line.slice(0, budget), x + 8, y + 8 + i * LINE_H, '#f2f4ff');
      budget -= line.length + 1;
    });
  }
}

export function wrap(text, max) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > max) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}

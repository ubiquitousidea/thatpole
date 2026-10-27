// Square-wave blips and a few running sounds. Audio starts lazily on the
// first user gesture; without audio the game works silently.
let ac = null, master = null;

function ctx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.7;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function blip(freq, dur = 0.08, type = 'square', vol = 0.04, delay = 0, slide = 0) {
  try {
    const a = ctx();
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch {
    // No audio.
  }
}

// The running train: motor hum and whine, tunnel rattle, brake squeal.
const engine = {
  nodes: null,
  start() {
    if (this.nodes) return;
    try {
      const a = ctx();
      const hum = a.createOscillator();
      hum.type = 'sawtooth';
      const humF = a.createBiquadFilter();
      humF.type = 'lowpass';
      humF.frequency.value = 500;
      const humG = a.createGain();
      humG.gain.value = 0;
      hum.connect(humF).connect(humG).connect(master);
      const whine = a.createOscillator();
      whine.type = 'square';
      const whineG = a.createGain();
      whineG.gain.value = 0;
      whine.connect(whineG).connect(master);
      const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = a.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const noiseF = a.createBiquadFilter();
      noiseF.type = 'bandpass';
      noiseF.frequency.value = 180;
      noiseF.Q.value = 0.7;
      const noiseG = a.createGain();
      noiseG.gain.value = 0;
      noise.connect(noiseF).connect(noiseG).connect(master);
      const squeal = a.createOscillator();
      squeal.type = 'sine';
      squeal.frequency.value = 2900;
      const lfo = a.createOscillator();
      lfo.frequency.value = 7;
      const lfoG = a.createGain();
      lfoG.gain.value = 60;
      lfo.connect(lfoG).connect(squeal.frequency);
      const squealG = a.createGain();
      squealG.gain.value = 0;
      squeal.connect(squealG).connect(master);
      for (const o of [hum, whine, noise, squeal, lfo]) o.start();
      this.nodes = { hum, humG, whine, whineG, noiseG, squealG };
    } catch {
      this.nodes = null;
    }
  },
  // v: m/s, a: train acceleration, shake: 0..1, braking: bool
  set(v, a, shake, braking) {
    const n = this.nodes;
    if (!n) return;
    const t = ac.currentTime, k = 0.08;
    n.hum.frequency.setTargetAtTime(35 + v * 6, t, k);
    n.humG.gain.setTargetAtTime(v > 0.1 ? 0.03 + v * 0.002 : 0.012, t, k);
    n.whine.frequency.setTargetAtTime(180 + v * 42, t, k);
    n.whineG.gain.setTargetAtTime(Math.abs(a) > 0.3 && v > 0.1 ? 0.006 : 0, t, 0.2);
    n.noiseG.gain.setTargetAtTime(v > 0.1 ? 0.03 + 0.12 * Math.min(1, Math.abs(shake)) * Math.min(1, v / 10) : 0, t, k);
    n.squealG.gain.setTargetAtTime(braking && v > 0.1 && v < 4 ? 0.012 : 0, t, 0.1);
  },
  silence() {
    if (this.nodes) this.set(0, 0, 0, false);
  },
};

export const sfx = {
  engine,
  click() {
    blip(880, 0.03, 'square', 0.025);
  },
  // Each rider has a voice pitch; a line is a few garbled syllables.
  mumble(pitch, n = 3, loud = false) {
    for (let i = 0; i < n; i++) {
      const f = pitch * (0.85 + Math.random() * 0.4);
      blip(f, 0.06 + Math.random() * 0.04, loud ? 'square' : 'triangle', loud ? 0.035 : 0.025, i * 0.085, (Math.random() - 0.5) * f * 0.3);
    }
  },
  // The two-tone door chime.
  chime() {
    blip(1245, 0.45, 'sine', 0.06);
    blip(988, 0.6, 'sine', 0.06, 0.4);
  },
  thump() {
    blip(90, 0.18, 'sine', 0.12, 0, -40);
  },
  jolt() {
    blip(60, 0.25, 'sawtooth', 0.05, 0, -20);
  },
  grip() {
    blip(1400, 0.05, 'square', 0.03);
  },
  success() {
    [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, 'square', 0.04, i * 0.09));
  },
  fail() {
    [392, 330, 262, 196].forEach((f, i) => blip(f, 0.16, 'square', 0.04, i * 0.12));
  },
};

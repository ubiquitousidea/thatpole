import { Riders } from './riders.js';
import { buildRide, PORTAL, RIVER } from './ride.js';
import { walkRects, CAR, DOOR_Z } from './layout.js';
import { QBP_PLATFORM, LEX_PLATFORM } from './route.js';
import { DIFFICULTY } from './settings.js';
import { sfx } from './sfx.js';

// States: title -> board (walk on at Queensboro Plaza) -> ride -> arrive (get
// off at Lex) -> end. The ride's clock only runs in ride and arrive.

const BOARD_TIME = 45;     // seconds before the doors close at Queensboro Plaza
const BOARDED_WAIT = 4;    // doors close this long after you're aboard
const ARRIVE_TIME = 22;    // seconds the doors stay open at Lex
const DOOR_TIME = 1.4;     // to open or shut
const MOOD_LIMIT = 0.92;   // the car turns on you
const QBP_SIDE = 1, LEX_SIDE = -1;

const INTRO = [
  "Queensboro Plaza, lower level. Your Manhattan-bound N is in, and it's packed. You need to get to Lexington Av/59 St.",
  "New York has rules. Do NOT sit and spread your knees across two seats. Stand. Hold a pole. Don't crowd anyone. Ride out the jolts.",
];

export class Game {
  constructor({ world, player, hud, ui }) {
    this.world = world;
    this.player = player;
    this.hud = hud;
    this.ui = ui;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    this.diffKey = 'normal';
    this.seed = 1;
    this.extra = []; // debug jolts: { t, amp }
    player.onAction = () => this.action();
    player.onContact = (r, strength) => this.riders && this.riders.contact(r, strength);
    player.onStumble = () => {
      sfx.thump();
      this.hud.toast('WHOA!', '#ff6b6b');
    };
    ui.onAction = () => this.action();
  }

  // ---- setup ----

  setup(key) {
    this.diffKey = key;
    this.diff = DIFFICULTY[key];
    this.seed = (this.seed * 7919 + 13) % 100000;
    this.ride = buildRide(this.diff, this.seed);
    if (this.riders) this.riders.dispose();
    this.riders = new Riders(this.world.scene, this.diff, this.seed);
    this.player.reset(4.6, DOOR_Z[2] + 1.0, Math.PI / 2 - 0.25);
    this.rideT = 0;
    this.doorSide = QBP_SIDE;
    this.doorOpen = 1;
    this.doorTarget = 1;
    this.boardT = BOARD_TIME;
    this.boardedT = 0;
    this.arriveT = ARRIVE_TIME;
    this.events = 0;
    this.seenSections = new Set();
    this.joltWatch = [];
    this.result = null;
    this.world.car.setDoors(this.doorSide, 1);
  }

  start(key) {
    this.setup(key || this.diffKey);
    this.board();
  }

  title() {
    this.state = 'title';
    this.setup(this.diffKey);
    this.player.active = false;
    sfx.engine.silence();
    this.narrate(INTRO, Object.entries(DIFFICULTY).map(([key, d]) => ({
      label: d.label,
      kind: key === 'normal' ? '' : 'ghost',
      onClick: () => this.choose(key),
    })));
  }

  // Phones ask for tilt here: iOS only prompts from inside a tap.
  choose(key) {
    sfx.engine.start();
    const ready = this.touch ? this.player.tilt.request() : Promise.resolve(false);
    ready.then(() => this.start(key));
  }

  board() {
    this.state = 'board';
    this.player.active = true;
    this.player.tilt.recenter();
    this.ui.setButtons([]);
    this.hud.say(this.touch
      ? 'The doors are open. Tilt the phone to walk onto the train before they close.'
      : 'The doors are open. Walk onto the train: ARROW KEYS or WASD, and Z/X to step sideways.');
  }

  // Show pages one at a time; the last page gets the final buttons.
  narrate(pages, finalButtons) {
    let i = 0;
    const show = () => {
      this.hud.say(pages[i]);
      if (i < pages.length - 1) {
        this.ui.setButtons([{
          label: 'Continue >',
          onClick: () => {
            if (this.hud.typing) return this.hud.finishTyping();
            i++;
            show();
          },
        }]);
      } else this.ui.setButtons(finalButtons);
    };
    show();
  }

  // ---- play ----

  action() {
    if (!['board', 'ride', 'arrive'].includes(this.state)) return;
    const c = this.player.context(this.riders);
    if (!c) return;
    c.run();
    sfx.grip();
    if (this.player.mode === 'sit') {
      this.hud.toast('MANSPREADING!', '#ff6b6b');
    }
    if (this.player.mode === 'hold' && !this.toldLean && this.state === 'ride') this.tellLean();
  }

  tellLean() {
    this.toldLean = true;
    this.hud.say(this.touch
      ? 'Got it. Now tilt the phone forward and back to lean against the jolts. Keep the BALANCE tick in the green.'
      : 'Got it. Hold UP / DOWN to lean against the jolts. Keep the BALANCE tick in the green or you fly off the pole.');
  }

  rideState() {
    const s = this.ride.at(this.rideT);
    for (const j of this.extra) {
      const tau = this.rideT - j.t;
      if (tau >= 0 && tau < 0.35) s.a += j.amp * Math.sin((Math.PI * tau) / 0.35);
    }
    return s;
  }

  rects() {
    if (this.doorOpen < 0.85) return walkRects(0);
    const P = this.doorSide === QBP_SIDE ? QBP_PLATFORM : LEX_PLATFORM;
    const r = 0.25;
    return walkRects(this.doorSide, { x0: P.x0 - 0.3 + r, x1: P.x1 - r, z0: P.z0 + r, z1: P.z1 - r });
  }

  update(dt) {
    if (!this.ride) return;
    const moving = this.state === 'ride' || this.state === 'arrive' || this.state === 'end' && this.rideT > 0;
    if (moving) this.rideT += dt;
    const s = this.rideState();
    this.world.update(s);

    // Doors slide toward their target.
    const step = dt / DOOR_TIME;
    this.doorOpen += Math.max(-step, Math.min(step, this.doorTarget - this.doorOpen));
    this.world.car.setDoors(this.doorSide, this.doorOpen);

    const riding = this.state === 'ride' || this.state === 'arrive';
    const a = riding ? s.a : 0;
    const shake = riding ? s.shake : { x: 0, y: 0 };
    this.player.update(dt, { a, shake, rects: this.rects(), riders: this.riders });
    this.riders.update({ dt, player: this.player, a, shake, aboard: this.player.aboard && this.state !== 'end' && this.state !== 'title' });

    if (this.state === 'board') this.updateBoard(dt);
    else if (this.state === 'ride') this.updateRide(dt, s);
    else if (this.state === 'arrive') this.updateArrive(dt);
    if (riding && this.riders.mood() >= MOOD_LIMIT) this.finish('viral');

    sfx.engine.set(s.v, s.aTrain, Math.hypot(s.shake.x, s.shake.y), s.aTrain < -0.2);

    const c = ['board', 'ride', 'arrive'].includes(this.state) ? this.player.context(this.riders) : null;
    this.riders.highlight = c && c.slot ? c.slot : null;
    this.riders.showMarkers = this.player.aboard && this.state !== 'end';
    this.ui.setAction(c ? (this.touch ? c.label : `${c.label} [SPACE]`) : null);
  }

  updateBoard(dt) {
    this.riders.board(dt);
    this.boardT -= dt;
    if (this.player.aboard) {
      if (this.boardedT === 0) {
        this.hud.say(this.touch
          ? 'Gold rings mark free spots at a pole. Step onto one and tap GRAB POLE before someone else does. Red: someone is already headed there.'
          : 'Gold rings mark free spots at a pole. Step onto one and press SPACE before someone else takes it. Red rings: someone is already headed there.');
      }
      this.boardedT += dt;
    }
    if (this.doorTarget === 1 && (this.boardedT > BOARDED_WAIT || this.boardT <= 0)) {
      this.doorTarget = 0;
      sfx.chime();
      this.hud.toast('STAND CLEAR!', '#ffd34d');
      // Anyone in the doorway gets shoved in.
      const p = this.player.pos;
      if (Math.abs(p.x) > CAR.halfW - 0.3 && Math.abs(p.x) < CAR.outerHalfW + 0.7) p.x = Math.sign(p.x) * (CAR.halfW - 0.3);
    }
    if (this.doorTarget === 0 && this.doorOpen <= 0) {
      if (!this.player.aboard) return this.finish('missed');
      for (const r of this.riders.list) if (r.mode === 'platform') {
        r.mode = 'gone';
        r.body.root.visible = false;
      }
      this.state = 'ride';
      this.rideT = 0;
      if (this.player.mode === 'hold') this.tellLean();
      else this.hud.say('This is a Manhattan-bound N train. The next stop is Lexington Avenue-59th Street. Stand clear of the closing doors, please.');
    }
  }

  updateRide(dt, s) {
    const evs = this.ride.events;
    while (this.events < evs.length && evs[this.events].t <= this.rideT) {
      const e = evs[this.events++];
      if (e.type === 'depart') {
        sfx.jolt();
        if (e.u > 0) this.hud.say('Thank you for your patience. We are moving.');
      } else if (e.type === 'hold') {
        sfx.jolt();
        this.hud.say("We are being held momentarily by the train's dispatcher. We apologize for the inconvenience.");
      } else if (e.type === 'approach') {
        this.hud.say('This is Lexington Avenue-59th Street. Transfer is available to the 4, 5, 6 and R, W trains. Doors open on the LEFT.');
      } else if (e.type === 'arrive') {
        sfx.jolt();
        return this.arrive();
      }
    }
    // Big jolts: did you hold on?
    for (const j of this.ride.jolts) {
      if (j.bump || j.t > this.rideT || j.t < this.rideT - dt) continue;
      this.joltWatch.push({ t: j.t, holding: this.player.mode === 'hold', stumbles: this.player.stats.stumbles });
      this.hud.toast('JOLT!', '#ffd34d', this.hud.L.H * 0.3);
    }
    this.joltWatch = this.joltWatch.filter((w) => {
      if (this.rideT - w.t < 1.2) return true;
      if (w.holding && this.player.mode === 'hold' && this.player.stats.stumbles === w.stumbles) {
        this.player.stats.joltsHeld++;
        this.hud.toast('NICE HOLD', '#7dff9a');
        this.riders.praise(this.player);
      }
      return false;
    });
    if (s.u > PORTAL && !this.seenSections.has('tunnel')) {
      this.seenSections.add('tunnel');
      if (!this.hud.typing) this.hud.say('Down the ramp and into the 60th Street Tunnel.');
    }
    if (s.u > RIVER.u0 && !this.seenSections.has('river')) {
      this.seenSections.add('river');
      this.hud.say('Under the East River now. It gets shaky down here. Hold on.');
    }
  }

  arrive() {
    this.state = 'arrive';
    this.doorSide = LEX_SIDE;
    this.doorTarget = 1;
    this.arriveT = ARRIVE_TIME;
    sfx.chime();
    this.riders.alight(LEX_SIDE);
    this.hud.say(this.touch
      ? 'Lexington Av/59 St. Doors open on the LEFT. Get off before they close!'
      : 'Lexington Av/59 St. Doors open on the LEFT. Let go (SPACE) and get off before they close!');
  }

  updateArrive(dt) {
    if (this.doorOpen >= 1) this.arriveT -= dt;
    if (this.player.pos.x < -CAR.outerHalfW - 0.4) return this.finish('win');
    if (this.arriveT <= 0 && this.doorTarget === 1) {
      this.doorTarget = 0;
      sfx.chime();
    }
    if (this.doorTarget === 0 && this.doorOpen <= 0) this.finish('overshoot');
  }

  doorTimer() {
    if (this.state === 'board' && this.doorTarget === 1) return this.boardT;
    if (this.state === 'arrive' && this.doorTarget === 1) return this.arriveT;
    return null;
  }

  statusLine() {
    if (this.state === 'board' || this.state === 'title') return 'NOW: QUEENSBORO PLAZA';
    if (this.state === 'arrive') return 'NOW: LEXINGTON AV/59 ST';
    if (this.state === 'end') return this.result && this.result.win ? 'LEXINGTON AV/59 ST' : '';
    return 'NEXT: LEXINGTON AV/59 ST';
  }

  // ---- the end ----

  finish(how) {
    if (this.state === 'end') return;
    this.state = 'end';
    this.player.active = false;
    if (this.player.mode === 'hold') this.player.letGo(this.riders);
    const st = this.player.stats;
    const lines = this.riders.lines;
    const win = how === 'win';
    const score = Math.round(st.poleTime * 2 + st.joltsHeld * 40 - st.stumbles * 30 - lines * 8 - st.sitTime * 12 + (win ? 150 : 0));
    const RANKS = [[0, 'TOURIST'], [100, 'BRIDGE AND TUNNEL'], [200, 'COMMUTER'], [300, 'STRAPHANGER'], [Infinity, 'BORN NEW YORKER']];
    let rank = RANKS.find(([lim]) => score < lim)[1];
    if (how === 'viral') rank = 'MAIN CHARACTER';
    if (how === 'missed') rank = 'STILL ON THE PLATFORM';
    if (how === 'overshoot') rank = 'DAYDREAMER';
    const TITLES = { win: 'YOU MADE IT', viral: 'YOU WENT VIRAL', missed: 'MISSED IT', overshoot: 'MISSED YOUR STOP' };
    this.result = {
      win, rank, title: TITLES[how],
      rows: [
        ['TIME ON THE POLE', `${Math.round(st.poleTime)}s`],
        ['JOLTS RIDDEN OUT', st.joltsHeld],
        ['STUMBLES', st.stumbles],
        ['GRUMBLES CAUSED', lines],
        ['SECONDS SPREAD', Math.round(st.sitTime)],
        ['SCORE', score],
      ],
    };
    const TEXT = {
      win: 'Lexington Av/59 St. You made it off the N in one piece.',
      viral: "The whole car is filming you. You've gone viral. Get on that pole next time.",
      missed: 'The doors closed without you. The next N is in 12 minutes.',
      overshoot: 'The doors closed. You rode on to 5th Av/59 St. Walk back, champ.',
    };
    (win ? sfx.success : sfx.fail)();
    this.ui.setAction(null);
    this.narrate([TEXT[how]], [
      { label: 'Ride again', onClick: () => this.start(this.diffKey) },
      { label: 'Menu', kind: 'ghost', onClick: () => this.title() },
    ]);
  }

  // ---- debugging (window.__game) ----

  // Jump to a point on the ride with the player standing in the aisle.
  skipTo(where) {
    if (this.state === 'title' || this.state === 'end') this.start(this.diffKey);
    const U = { ride: 0, elevated: 120, tunnel: PORTAL + 30, river: RIVER.u0 + 20, lex: 1300 }[where] ?? 0;
    if (this.player.mode === 'hold') this.player.letGo(this.riders);
    if (!this.player.aboard) this.player.pos.set(0, 0, 0);
    for (const r of this.riders.list) if (r.mode === 'platform') {
      r.mode = 'gone';
      r.body.root.visible = false;
    }
    this.state = 'ride';
    this.doorOpen = this.doorTarget = 0;
    let t = 0;
    while (t < this.ride.duration && this.ride.at(t).u < U) t += 0.1;
    this.rideT = U ? t : 0;
    this.events = this.ride.events.filter((e) => e.t < this.rideT).length;
  }

  // Run the game for `seconds` of game time right now (headless browsers
  // throttle animation frames).
  advance(seconds, each = null) {
    for (let t = 0; t < seconds; t += 1 / 30) {
      if (each) each(this);
      this.update(1 / 30);
    }
    return this.state;
  }

  jolt(amp = 3) {
    this.extra.push({ t: this.rideT, amp });
  }
}

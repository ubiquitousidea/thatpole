import * as THREE from 'three';
import { Body } from './body.js';
import { SEATS, SLOTS, POLES, RAIL_SPOTS, DOOR_Z, RAIL_X, RAIL_Y } from './layout.js';
import { rng } from './ride.js';
import { sfx } from './sfx.js';

// The other passengers. Each one is seated, holding a pole slot, holding the
// overhead rail, or walking somewhere. Everyone standing wants a seat: they go
// for one in staggered waves while the train is slow, and stay standing only
// when no seat they'll take is free (picky riders won't sit right next to
// someone). Once seated they stay put. A pole slot that comes free is claimed
// by a nearby rail rider who gave up on a seat after a while
// (TIMES.claim in settings.js), which is the window the player has to grab it.
//
// Every rider has an annoyance level from 0 to 1. Standing in their personal
// space, bumping into them, blocking their way, sniping their pole and above
// all sitting down (manspreading) raise it. They glare, grumble, then turn
// hostile. The car's mood is the average of the most annoyed riders.

export const LINES = {
  grumble: ['ugh.', '...seriously?', 'personal space, pal', 'can you not', 'bro.', 'back up a little?',
    'mmhm. okay.', 'every. single. day.', 'you mind?', 'too close, man', 'excuse YOU'],
  bump: ['WATCH IT!', 'HOLD ON TO SOMETHING!', 'YO!', 'MY COFFEE!', 'OW!', 'ARE YOU NEW HERE?', 'HEY!'],
  sit: ['IS THAT MANSPREADING?', 'Close your legs, my guy', 'GET ON THAT POLE!', 'Get. On. That. POLE.',
    'Two seats? Really?', "Pole's RIGHT THERE!", 'That is a WHOLE bench, sir', 'GET ON THAT POLE!!',
    'Manspreading. Classic.', 'Sir. The POLE.', 'GET ON THAT POLE', 'Legs. Together. Now.'],
  block: ['excuse me', 'this is my stop!', 'MOVE!', 'coming through', 'door is RIGHT there'],
  sniped: ['I was going for that', 'wow. okay.', '...cool. cool cool.', 'really?'],
  hostile: ['I swear to god', 'TOURIST.', 'Get on that pole or get off the train', 'Somebody film this guy', 'unbelievable'],
  praise: ['nice.', "now THAT's a New Yorker", 'respect.', 'look at him go'],
  // Thoughts: said to nobody, shown in a thought bubble, never a grumble.
  thoughtPlain: ['I hope I turned the stove off', 'did I lock the door?', 'need to call mom back', 'rent is due friday',
    'what do I make for dinner', 'I should have taken the 7', 'did I answer that email?', 'my feet hurt',
    'is it tuesday?', 'forgot my umbrella again', 'need milk. and eggs.', 'is the iron on? no. maybe.',
    'I should go to the gym', 'five more stops', 'should I quit my job'],
  thoughtOdd: ['the moon owes me money', 'spaghetti is long rice', 'I could fight a swan', 'what if the train is riding me',
    'the rats are unionizing', 'pigeons are just sky rats', 'I am 40 percent soup', 'do fish know they are wet?',
    'my left sock knows', 'bagels are bread donuts', 'beep boop', 'what if I am the pole', 'cheese is milk, but brave',
    'clouds are sky sheep', 'who invented Tuesday'],
};

const WALK_SPEED = 1.1;
const LINE_COOLDOWN = 6;
const SEEK_DELAY = [1, 30];   // seconds after spawn a standing rider first looks for a seat
const SEEK_RETRY = [8, 15];   // and how often after that, if none would do
const MAX_SEEKERS = 6;        // riders walking to seats at once, so the aisle doesn't jam
const CLAIM_REACH = 4;        // nobody crosses the car for a pole slot
const THINK_EVERY = [14, 30]; // seconds between a thinker's thoughts
const THINK_NEAR = 5;         // thoughts you can see: riders this close to you
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// Seats right next to each seat: along the same wall bench, or the other seat
// of the same pod row. The row behind, back to back, doesn't count.
const NEIGHBORS = SEATS.map((s) => SEATS.filter((q) => q !== s && q.side === s.side && q.kind === s.kind
  && (s.kind === 'wall' || q.z === s.z) && Math.hypot(q.x - s.x, q.z - s.z) < 0.8));

class Rider {
  constructor(id, body, rand) {
    this.id = id;
    this.body = body;
    this.voice = 110 + rand() * 260;
    this.base = new THREE.Vector3();
    this.offset = { x: 0, z: 0 };
    this.mode = 'seated';
    this.annoyance = 0;
    this.cooldown = rand() * 3;
    this.theta = 0;
    this.omega = 0;
    this.point = 0; // seconds left pointing at a pole
    this.phone = rand() < 0.5;
    this.spread = rand() < 0.12;
    this.hand = rand() < 0.5 ? 0 : 1;
    this.stiff = 0.8 + rand() * 0.6;
    this.path = [];
    this.wait = 0;
    this.picky = rand() < 0.3; // won't sit right next to someone
    const t = rand();
    this.thinks = t < 0.2 ? 'odd' : t < 0.6 ? 'plain' : null;
    this.thinkT = 4 + rand() * 20;
    this.seekAt = Infinity;
    this.looked = false; // has looked for a seat and found none
  }

  get solid() {
    return this.mode !== 'gone' && this.mode !== 'platform';
  }

  nudge(dx, dz) {
    this.offset.x = THREE.MathUtils.clamp(this.offset.x + dx, -0.3, 0.3);
    this.offset.z = THREE.MathUtils.clamp(this.offset.z + dz, -0.3, 0.3);
  }
}

export class Riders {
  constructor(scene, diff, seed = 1) {
    this.scene = scene;
    this.diff = diff;
    this.rand = rng(seed);
    this.list = [];
    this.bubbles = [];
    this.slots = SLOTS.map(() => ({ occupant: null, reservedBy: null, claimAt: Infinity, freeSince: 0 }));
    this.seats = SEATS.map(() => null);
    this.rails = RAIL_SPOTS.map(() => null);
    this.time = 0;
    this.playerSeat = null;
    this.chorusT = 1;
    this.lastLine = 0;
    this.lines = 0; // lines aimed at the player
    this.highlight = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.markers = this.makeMarkers();
    this.spawn();
  }

  dispose() {
    this.scene.remove(this.group);
  }

  range([a, b]) {
    return a + this.rand() * (b - a);
  }

  add(body) {
    const r = new Rider(this.list.length, body, this.rand);
    this.list.push(r);
    this.group.add(body.root);
    return r;
  }

  spawn() {
    const rand = this.rand, d = this.diff;
    // The people already sitting spread out: nobody sits next to a stranger
    // while there's a seat with no one beside it.
    for (let i = 0; i < Math.min(d.seated, SEATS.length - 1); i++) {
      const free = shuffle(SEATS.filter((s) => !this.seats[s.id]), rand);
      this.sitAt(this.add(new Body(rand)), free.find((s) => this.alone(s)) || free[0]);
    }
    const standing = d.standing;
    const onPoles = Math.min(SLOTS.length - 6, Math.round(standing * 0.65));
    const slotIds = shuffle(SLOTS.map((s) => s.id), rand);
    for (let i = 0; i < standing; i++) {
      const r = this.add(new Body(rand));
      if (i < onPoles) this.holdAt(r, SLOTS[slotIds[i]]);
      else {
        const spot = this.freeRail();
        if (spot) this.railAt(r, spot);
        else this.holdAt(r, SLOTS[slotIds[i]]);
      }
      r.seekAt = this.range(SEEK_DELAY);
    }
    this.slots.forEach((st) => this.freed(st));
    // A few people waiting on the platform at Queensboro Plaza (on the left,
    // -x) board with you.
    this.boarders = [];
    for (let i = 0; i < 3; i++) {
      const r = this.add(new Body(rand));
      r.mode = 'platform';
      r.base.set(-(3 + rand() * 3), 0, DOOR_Z[1 + (i % 2)] + (rand() - 0.5) * 3);
      r.yaw = Math.PI / 2;
      r.body.pose('stand');
      r.delay = 1 + i * 1.5 + rand();
      this.boarders.push(r);
    }
    for (const r of this.list) this.place(r, 0, true);
  }

  freeRail() {
    const free = RAIL_SPOTS.filter((s) => !this.rails[s.id]);
    return free.length ? free[Math.floor(this.rand() * free.length)] : null;
  }

  sitAt(r, seat) {
    r.mode = 'seated';
    r.seat = seat;
    this.seats[seat.id] = r;
    r.base.set(seat.x, 0, seat.z);
    r.yaw = seat.yaw;
  }

  holdAt(r, slot) {
    const st = this.slots[slot.id];
    st.occupant = r;
    st.reservedBy = null;
    st.claimAt = Infinity;
    r.mode = 'pole';
    r.slot = slot;
    r.base.set(slot.x, 0, slot.z);
    const pole = POLES[slot.pole];
    r.yaw = Math.atan2(pole.x - slot.x, pole.z - slot.z) + (this.rand() - 0.5) * 1.2;
  }

  railAt(r, spot) {
    r.mode = 'rail';
    r.spot = spot;
    this.rails[spot.id] = r;
    r.base.set(spot.x, 0, spot.z);
    r.yaw = spot.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    r.idleSince = this.time;
  }

  // Nobody sits right next to this seat, and nobody is on the way to.
  alone(seat) {
    return NEIGHBORS[seat.id].every((q) => !this.seats[q.id]);
  }

  // The nearest seat r would take: free, out of reach of your knees, and for a
  // picky rider, with nobody beside it.
  findSeat(r) {
    let best = null, bestD = Infinity;
    for (const seat of SEATS) {
      if (this.seats[seat.id]) continue;
      if (this.playerSeat && NEIGHBORS[this.playerSeat.id].includes(seat)) continue;
      if (r.picky && !this.alone(seat)) continue;
      const dd = dist(r.base, seat);
      if (dd < bestD) {
        best = seat;
        bestD = dd;
      }
    }
    return best;
  }

  // Head for a seat if there is one. Returns whether r is on the way.
  seekSeat(r) {
    const seat = this.findSeat(r);
    if (!seat) return false;
    const from = r.base.clone();
    this.leaveSpot(r);
    this.seats[seat.id] = r;
    r.seatBound = true;
    this.walk(r, [...this.aislePath(from, seat.front), seat], () => {
      r.seatBound = false;
      this.sitAt(r, seat);
    });
    return true;
  }

  // A slot just came free: some standing rider will go for it in a while.
  freed(st) {
    if (st.occupant || st.reservedBy) return;
    st.freeSince = this.time;
    st.claimAt = this.time + this.range(this.diff.claim);
  }

  leaveSpot(r) {
    if (r.mode === 'seated' && r.seat) this.seats[r.seat.id] = null;
    if (r.mode === 'rail' && r.spot) this.rails[r.spot.id] = null;
    if (r.mode === 'pole' && r.slot) {
      const st = this.slots[r.slot.id];
      st.occupant = null;
      this.freed(st);
    }
    r.seat = r.spot = r.slot = null;
  }

  // Walk a list of points, then call done.
  walk(r, points, done) {
    r.mode = 'walk';
    r.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    r.done = done;
    r.wait = 0;
  }

  // Through the aisle: out to the middle, along, then in.
  aislePath(from, to) {
    const ax = (x) => THREE.MathUtils.clamp(x, -0.25, 0.25);
    return [{ x: ax(from.x), z: from.z }, { x: ax(to.x), z: to.z }, to];
  }

  // ---- what the player does ----

  playerTakes(slot) {
    const st = this.slots[slot.id];
    const r = st.reservedBy;
    if (r) {
      this.say(r, pick(LINES.sniped, this.rand), true);
      this.annoy(r, 0.25);
      const spot = this.freeRail();
      if (spot) {
        this.rails[spot.id] = r;
        this.walk(r, this.aislePath(r.base, spot), () => this.railAt(r, spot));
      }
    }
    st.occupant = 'player';
    st.reservedBy = null;
    st.claimAt = Infinity;
  }

  playerLeaves(slot) {
    const st = this.slots[slot.id];
    st.occupant = null;
    this.freed(st);
  }

  playerSits(seat) {
    this.seats[seat.id] = 'player';
    this.playerSeat = seat;
    this.chorusT = 0.4;
  }

  playerStands(seat) {
    if (seat) this.seats[seat.id] = null;
    this.playerSeat = null;
  }

  // You walked or stumbled into r.
  contact(r, strength) {
    if (strength >= 1) {
      this.annoy(r, 0.4 * this.diff.temper * this.diff.bump);
      this.say(r, pick(LINES.bump, this.rand), true, true);
      sfx.thump();
    } else {
      this.annoy(r, 0.08 * this.diff.temper);
      if (r.annoyance > 0.3) this.say(r, pick(LINES.grumble, this.rand));
    }
  }

  // You rode out a jolt on the pole: someone might be impressed.
  praise(player) {
    const near = this.list.filter((r) => r.solid && r.annoyance < 0.3 && dist(r.base, player.pos) < 3);
    if (near.length && this.rand() < 0.35) this.say(pick(near, this.rand), pick(LINES.praise, this.rand), false, true);
  }

  annoy(r, amount) {
    r.annoyance = Math.min(1, r.annoyance + amount);
    r.glare = Math.max(r.glare || 0, 2.5);
  }

  // force: speak even within the cooldown. Returns whether it was said.
  say(r, text, loud = false, force = false) {
    if (!force && (r.cooldown > 0 || this.time - this.lastLine < 0.9)) return false;
    r.cooldown = LINE_COOLDOWN * (0.7 + this.rand() * 0.6);
    this.lastLine = this.time;
    this.bubbles = this.bubbles.filter((b) => b.rider !== r);
    this.bubbles.push({ rider: r, text, t: 0, life: 2 + text.length * 0.05, loud });
    if (!LINES.praise.includes(text)) this.lines++;
    sfx.mumble(r.voice, Math.min(6, 2 + Math.floor(text.length / 6)), loud);
    return true;
  }

  // A thought: silent, not aimed at anyone, and not a grumble.
  think(r) {
    const text = pick(r.thinks === 'odd' ? LINES.thoughtOdd : LINES.thoughtPlain, this.rand);
    this.bubbles.push({ rider: r, text, t: 0, life: 2.5 + text.length * 0.06, thought: true });
  }

  // ---- stations ----

  // Queensboro Plaza: the people on the platform get on.
  board(dt) {
    for (const r of this.boarders) {
      if (r.mode !== 'platform') continue;
      r.delay -= dt;
      if (r.delay > 0) continue;
      // In through the doors, then to a seat if there is one, else the rail.
      const door = nearestDoor(r.base.z);
      const inside = { x: -0.2, z: door };
      const seat = this.findSeat({ base: inside, picky: r.picky });
      if (seat) {
        this.seats[seat.id] = r;
        r.seatBound = true;
        this.walk(r, [{ x: -1.0, z: door }, inside, ...this.aislePath(inside, seat.front), seat], () => {
          r.seatBound = false;
          this.sitAt(r, seat);
        });
        continue;
      }
      const spot = this.freeRail();
      if (!spot) continue;
      this.rails[spot.id] = r;
      r.looked = true;
      r.seekAt = this.time + this.range(SEEK_RETRY);
      this.walk(r, [{ x: -1.0, z: door }, inside, ...this.aislePath(inside, spot)], () => this.railAt(r, spot));
    }
  }

  // Lexington Av: some riders get off through the doors on `side`.
  alight(side) {
    for (const r of this.list) {
      if (!r.solid || r.mode === 'walk' || this.rand() > 0.45) continue;
      r.exitDelay = this.rand() * 4;
      r.exitSide = side;
    }
  }

  startExit(r) {
    const door = nearestDoor(r.base.z);
    const s = r.exitSide;
    const from = r.mode === 'seated' ? r.seat.front : r.base.clone();
    this.leaveSpot(r);
    const out = [
      { x: THREE.MathUtils.clamp(from.x, -0.3, 0.3), z: from.z },
      { x: 0, z: door },
      { x: s * 1.0, z: door },
      { x: s * 2.6, z: door },
      { x: s * 4.5, z: door + (this.rand() - 0.5) * 16 },
    ];
    this.walk(r, out, () => {
      r.mode = 'gone';
      r.body.root.visible = false;
    });
    r.exiting = true;
  }

  // ---- per frame ----

  // ctx: { dt, player, a, shake, aboard, doorsOpen }
  update(ctx) {
    const { dt, player } = ctx;
    this.time += dt;
    const d = this.diff;
    const head = player.camera.position;
    const R = d.space;

    // Free slots get claimed when their window runs out, by someone close by
    // who has already given up on a seat.
    this.slots.forEach((st, id) => {
      if (st.occupant || st.reservedBy || this.time < st.claimAt) return;
      const slot = SLOTS[id];
      let best = null, bestD = CLAIM_REACH;
      for (const r of this.list) {
        if (r.mode !== 'rail' || !r.looked || this.time - r.idleSince < 2) continue;
        const dd = dist(r.base, slot);
        if (dd < bestD) {
          best = r;
          bestD = dd;
        }
      }
      if (!best) {
        st.claimAt = this.time + this.range(d.claim);
        return;
      }
      st.reservedBy = best;
      this.rails[best.spot.id] = null;
      const r = best;
      this.walk(r, this.aislePath(r.base, slot), () => {
        if (st.occupant) { // the player got there first
          const spot = this.freeRail();
          if (spot) this.railAt(r, spot);
          else this.holdAt(r, SLOTS.find((s) => !this.slots[s.id].occupant && !this.slots[s.id].reservedBy) || slot);
          return;
        }
        this.holdAt(r, slot);
      });
    });

    // The sitting chorus: while you sit, someone yells at you every so often.
    if (this.playerSeat) {
      this.chorusT -= dt;
      if (this.chorusT <= 0) {
        this.chorusT = 1.2 + this.rand() * 1.4 / d.temper;
        const near = this.list.filter((r) => r.solid && dist(r.base, player.pos) < 5 && r.cooldown <= 0)
          .sort((p, q) => dist(p.base, player.pos) - dist(q.base, player.pos)).slice(0, 6);
        if (near.length) {
          const r = pick(near, this.rand);
          this.say(r, pick(LINES.sit, this.rand), true, true);
          r.point = 2.2;
          this.annoy(r, 0.05);
        }
      }
    }

    let seekers = this.list.filter((r) => r.seatBound).length;
    let thoughts = this.bubbles.filter((b) => b.thought).length;
    for (const r of this.list) {
      if (r.mode === 'gone') continue;
      r.cooldown -= dt;
      r.glare = Math.max(0, (r.glare || 0) - dt);
      r.point = Math.max(0, r.point - dt);

      if (r.exitDelay !== undefined && !r.exiting) {
        r.exitDelay -= dt;
        if (r.exitDelay <= 0 && r.mode !== 'walk') this.startExit(r);
      }

      // Standing riders look for a seat now and then, a few at a time.
      if ((r.mode === 'pole' || r.mode === 'rail') && !r.exiting && this.time >= r.seekAt && seekers < MAX_SEEKERS) {
        if (this.seekSeat(r)) seekers++;
        else {
          r.looked = true;
          r.seekAt = this.time + this.range(SEEK_RETRY);
        }
      }
      if (r.mode === 'walk') this.step(r, ctx);

      // Thinking, when calm and close enough for you to see it.
      r.thinkT -= dt;
      if (r.thinkT <= 0) {
        r.thinkT = this.range(THINK_EVERY);
        if (r.thinks && ctx.aboard && r.solid && thoughts < 2 && r.annoyance < 0.3 && !r.glare && !r.point
          && dist(r.base, player.pos) < THINK_NEAR && !this.bubbles.some((b) => b.rider === r)) {
          this.think(r);
          thoughts++;
        }
      }

      // Annoyance from the player being here.
      if (ctx.aboard && r.solid) {
        const dd = dist(r.base, player.pos);
        let rate = 0;
        // Holding a pole is where you belong, however packed the car: only
        // standing loose (or stumbling) in someone's space counts.
        const loose = player.mode === 'walk' || player.mode === 'stumble';
        if (dd < R && loose) rate += 0.3 * (1 - dd / R) * (r.mode === 'seated' ? 0.5 : 1);
        if (this.playerSeat) {
          if (dd < 4.5) rate += 0.05;
          if (r.mode === 'seated') {
            // Your knees are in your neighbors' seats, and in the way of
            // whoever sits right behind or beside you.
            if (NEIGHBORS[this.playerSeat.id].includes(r.seat)) rate += 0.22;
            else if (dist(r.seat, this.playerSeat) < 0.8) rate += 0.15;
          }
        }
        if (rate) {
          const before = r.annoyance;
          r.annoyance = Math.min(1, r.annoyance + rate * d.temper * dt);
          if (before < 0.4 && r.annoyance >= 0.4) this.say(r, pick(LINES.grumble, this.rand));
          if (before < 0.85 && r.annoyance >= 0.85) this.say(r, pick(LINES.hostile, this.rand), true);
          if (r.annoyance > 0.25) r.glare = Math.max(r.glare, 0.5);
        } else r.annoyance = Math.max(0, r.annoyance - 0.025 * dt);
      }

      this.place(r, dt, false, ctx, head);
    }

    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.life && b.rider.mode !== 'gone');
    this.updateMarkers(dt);
  }

  // Walk toward the next point, waiting (and grumbling) if the player is in the way.
  step(r, ctx) {
    const target = r.path[0];
    if (!target) {
      const done = r.done;
      r.done = null;
      if (done) done();
      return;
    }
    const dx = target.x - r.base.x, dz = target.z - r.base.z;
    const len = Math.hypot(dx, dz);
    const p = ctx.player.pos;
    const ahead = ((p.x - r.base.x) * dx + (p.z - r.base.z) * dz) / (len || 1);
    const off = Math.abs((p.x - r.base.x) * dz - (p.z - r.base.z) * dx) / (len || 1);
    // Someone on a pole or in a seat is squeezed past. Someone standing in the
    // aisle, or in the way of the doors at Lex, is in the way.
    const parked = ctx.player.mode === 'hold' || ctx.player.mode === 'sit';
    r.shove = Math.max(0, (r.shove || 0) - ctx.dt);
    const blocked = ctx.aboard && !r.shove && (!parked || r.exiting) && ahead > 0 && ahead < 0.6 && off < 0.4;
    if (blocked) {
      r.wait += ctx.dt;
      // A moment's wait is the subway. Standing there is not.
      if (r.wait > 1) r.annoyance = Math.min(1, r.annoyance + 0.3 * this.diff.temper * ctx.dt);
      if (r.wait > 1.2 && !r.complained) r.complained = this.say(r, pick(LINES.block, this.rand), r.exiting);
      r.glare = 1;
      if (r.wait > 2.5) r.shove = 1.5; // give up waiting and shove past
      return;
    }
    r.wait = 0;
    r.complained = false;
    const stepLen = WALK_SPEED * ctx.dt;
    if (len <= stepLen) {
      r.base.set(target.x, 0, target.z);
      r.path.shift();
    } else {
      r.base.x += (dx / len) * stepLen;
      r.base.z += (dz / len) * stepLen;
      r.yaw = Math.atan2(dx, dz);
    }
  }

  // Pose the body: where it is, how it holds on, where it looks, and how it
  // sways with the train.
  place(r, dt, snap = false, ctx = null, head = null) {
    const b = r.body;
    const a = ctx ? ctx.a : 0;
    const shake = ctx ? ctx.shake : { x: 0, y: 0 };
    if (dt) {
      const k = r.mode === 'seated' ? 25 : 12 * r.stiff;
      const acc = -k * r.theta - 6 * r.omega - 0.45 * a;
      r.omega += acc * dt;
      r.theta += r.omega * dt;
      const decay = Math.exp(-dt / 0.6);
      r.offset.x *= decay;
      r.offset.z *= decay;
    }
    b.position.set(r.base.x + r.offset.x, 0, r.base.z + r.offset.z);
    b.yaw = r.yaw || 0;
    b.reach(0, null);
    b.reach(1, null);
    if (r.mode === 'seated') {
      b.pose(r.spread ? 'spread' : 'sit', { phone: r.phone && !r.glare });
      b.lean(r.theta * 0.4, shake.x * 0.006);
    } else if (r.mode === 'pole') {
      b.pose(r.phone ? 'phone' : 'hold');
      const pole = POLES[r.slot.pole];
      b.reach(r.hand, _v.set(pole.x, r.slot.hand, pole.z));
      b.lean(r.theta, shake.x * 0.008);
    } else if (r.mode === 'rail') {
      b.pose(r.phone ? 'phone' : 'stand');
      b.reach(r.hand, _v.set(Math.sign(r.spot.x) * RAIL_X, RAIL_Y + 0.02, r.base.z + 0.1));
      b.lean(r.theta, shake.x * 0.008);
    } else if (r.mode === 'walk') {
      b.pose(r.wait > 0 ? 'stand' : 'walk');
      b.lean(r.theta, 0);
    } else {
      b.pose('stand');
      b.lean(0, 0);
    }
    if (r.point > 0 && head) {
      // Point at the nearest pole, arm out straight.
      let best = POLES[0], bd = Infinity;
      for (const p of POLES) {
        const dd = Math.hypot(p.x - r.base.x, p.z - r.base.z);
        if (dd < bd) {
          best = p;
          bd = dd;
        }
      }
      b.headWorld(_w);
      _v.set(best.x, 1.5, best.z).sub(_w).normalize().multiplyScalar(3).add(_w);
      b.reach(1 - r.hand, _v);
    }
    b.look((r.glare > 0 || r.point > 0) && head ? head : null);
    if (snap) b.snap();
    else b.update(dt);
  }

  // The car's mood: the average annoyance of its six most annoyed riders.
  mood() {
    const vals = this.list.filter((r) => r.solid).map((r) => r.annoyance).sort((p, q) => q - p).slice(0, 6);
    while (vals.length < 6) vals.push(0);
    return vals.reduce((s, v) => s + v, 0) / 6;
  }

  // Gold rings on the floor at free slots, shrinking as a rider closes in.
  // Red when a rider is already on the way; white for the one SPACE would grab.
  makeMarkers() {
    const geo = new THREE.RingGeometry(0.13, 0.19, 12);
    geo.rotateX(-Math.PI / 2);
    const bandGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8);
    return SLOTS.map((slot) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.9, depthWrite: false });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.set(slot.x, 0.012, slot.z);
      const band = new THREE.Mesh(bandGeo, mat);
      const pole = POLES[slot.pole];
      band.position.set(pole.x, slot.hand, pole.z);
      this.group.add(ring, band);
      return { ring, band, mat };
    });
  }

  updateMarkers() {
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 8);
    SLOTS.forEach((slot, i) => {
      const st = this.slots[i], m = this.markers[i];
      m.ring.visible = m.band.visible = !!this.showMarkers && !st.occupant;
      if (!m.ring.visible) return;
      let s = 1;
      if (st.reservedBy) {
        m.mat.color.set('#ff5a4a');
        s = 0.6;
      } else {
        m.mat.color.set(this.highlight === slot ? '#ffffff' : '#ffd34d');
        if (Number.isFinite(st.claimAt)) s = 0.45 + 0.55 * THREE.MathUtils.clamp((st.claimAt - this.time) / Math.max(1, st.claimAt - st.freeSince), 0, 1);
      }
      m.ring.scale.setScalar(s * (this.highlight === slot ? pulse * 1.2 : 1));
    });
  }
}

function nearestDoor(z) {
  return DOOR_Z.reduce((best, d) => (Math.abs(d - z) < Math.abs(best - z) ? d : best), DOOR_Z[0]);
}

function dist(p, q) {
  return Math.hypot(p.x - q.x, p.z - q.z);
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

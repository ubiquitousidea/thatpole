# Get On That Pole

A small first-person browser game about riding the Manhattan-bound N train from Queensboro Plaza to Lexington Av/59 St without making enemies.

## Play

There's no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

If `python3` fails with a version-manager error (asdf or pyenv with no version set for this folder), use the system Python instead: `/usr/bin/python3 -m http.server 8000`.

Three.js and the Press Start 2P font load from CDNs, so you need a network connection.

## How it plays

- **Board.** You start on the lower level at Queensboro Plaza. Pick a difficulty (Easy, Normal, Rush Hour), which sets how crowded the car is, how hard it jolts, how often the dispatcher holds the train in the tunnel, and how quickly other riders take a free pole. Walk on before the doors close. Walking uses tank controls: the arrow keys or WASD, with up and down to move, left and right to turn, and Z/X to step sideways.
- **Get on that pole.** Gold rings on the floor mark free spots at a pole. Each ring shrinks as a standing rider gets ready to take that spot. A red ring means someone is already on the way, and grabbing it anyway annoys them. Step onto a ring and press SPACE.
- **Ride out the jolts.** The train lurches when the brakes release, when it stops, and over bumps under the East River. The balance meter shows how far you're tipping. Hold UP to lean forward and DOWN to lean back, and keep the tick in the green. If you overcorrect or react too late, you swing off the pole and stumble into people. If you stand without holding anything, the first hard jolt puts you on the floor.
- **Don't sit.** Every seat is a trap. Sitting spreads your knees across the bench. The car starts yelling ("IS THAT MANSPREADING?", "GET ON THAT POLE!") and points at the poles. Riders also grumble when you stand in their personal space, bump into them, or get between them and the doors. If the car's mood maxes out, you go viral and lose.
- **Get off at Lex.** The doors open on the left. Let go of the pole and walk out before they close, or you ride on to 5th Av.
- **Phones:** tilt to walk, and tilt forward and back to lean while you hold a pole. The context button (Grab pole, Sit down, Let go, Stand up) does what SPACE does. Tilt needs HTTPS (or localhost), and iPhones ask for permission when you pick a difficulty.

The end card shows your time on the pole, jolts ridden out, stumbles, grumbles caused, seconds spent spread across seats, and a rank from TOURIST to BORN NEW YORKER.

## Code

| File | Role |
|---|---|
| `js/layout.js` | Floor plan of the R68 car: doors, wall benches and facing cross-seat bays, poles and their grip slots, rail spots, walkable rectangles. Pure data with a `selfTest()` |
| `js/ride.js` | The ride as a pure function of time: a simulated speed profile with dispatcher holds, jolt pulses, tunnel shake, daylight and track height. Has a `selfTest()` |
| `js/body.js` | Simple-form people: flat-shaded capsules on a joint hierarchy, pose tables, two-bone arm IK onto poles and rails, head tracking, lean |
| `js/car.js` | The car's meshes: walls, windows, sliding doors, benches, stanchions, rails, ads, end-wall destination signs, and shells for the rest of the train |
| `js/route.js` | Outside the car: Queensboro Plaza, Queens streets and the bridge, the elevated structure, the portal, the tunnel with lamps and signals, and the Lex platform |
| `js/world.js` | Scene, camera, lights and fog that follow daylight into the tunnel |
| `js/player.js` | Walking, grabbing, sitting, the balance pendulum, stumbling, and the first-person camera in the player's head |
| `js/riders.js` | Passengers: spawning, pole-slot claiming, annoyance, lines and speech, the sitting chorus, boarding and getting off |
| `js/game.js` | State machine (`title -> board -> ride -> arrive -> end`), announcements, scoring |
| `js/hud.js` | Status, balance and mood meters, speech bubbles, narration, title and end card |
| `js/sfx.js` | Square-wave blips, mumbles, door chime, and the running train (hum, whine, rattle, brake squeal) |
| `js/tilt.js` | Tilt input on phones, the same as in Euler's Expedition |
| `js/pixels.js` | Canvas textures, dithering, pixel text, box helpers, static mesh merging |
| `js/settings.js` | Pixel-size knobs and the `DIFFICULTY` table |

**Lo-fi filter:** like Euler's Expedition, every canvas renders at low resolution and is scaled up with `image-rendering: pixelated`. Only the DOM buttons render at full resolution.

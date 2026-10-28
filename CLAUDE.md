# Get On That Pole: notes for agents

See README.md for what the game is and the file map. This file covers the things that aren't obvious from reading the code. The look and tech come from `../eulergame` (Euler's Expedition), and its CLAUDE.md notes on the pixel filter, tilt and module caching apply here too.

## Running
- Use `/usr/bin/python3 -m http.server 8000`. There's no build step and no package.json. Three.js `0.160.0` (plus `three/addons/` for `BufferGeometryUtils`) comes from the import map in `index.html`.
- Check the pure modules without a browser: `node -e "import('./js/ride.js').then(m=>m.selfTest())"` and the same with `./js/layout.js`.

## Coordinates
- The car never moves. It sits at the origin, runs along z with the front of the train toward -z, and has x across the car, y up, and the floor at y = 0. The route group slides by `(0, -trackY(u), u)` (`Route.place`), where u is the distance along the track from Queensboro Plaza (u = 0) to Lex (u = `ROUTE_LEN`). Route objects sit at local z = -u, at absolute heights. The street is at y = -7.
- Train acceleration `a` is positive when speeding up. It acts on bodies as a pseudo-force toward +z. The balance angle `theta` is positive when leaning toward the front of the train. Speeding up tips you back, so you lean forward against it.
- The camera's yaw follows the eulergame convention, facing (-sin yaw, -cos yaw). Bodies face their local +z, so `body.yaw = cameraYaw + PI`.
- Doors open on +x at Queensboro Plaza and -x at Lex. `walkRects(openSide, platform)` in layout.js is the area where a body's center may go. Movement slides along its edges (`Player.moveBy`).

## Gameplay tuning
- The pendulum constants live at the top of `js/player.js` (`K, C, G, LEAN, LEAN_EASE, GRIP_LIMIT`, and `FK, FC, FG, FREE_LIMIT` for standing free). Jolt sizes are in `js/ride.js` (`START_JOLT`, `STOP_JOLT`, track bumps). They were tuned by simulating against the real ride profile:
  - With no input on Normal, the start jolt peaks at about 0.41 rad against a 0.42 limit.
  - On Rush Hour you must lean, or the sustained acceleration throws you.
  - A 0.2 s-reaction bang-bang controller survives Normal.
  - Re-check any change the same way, with a small node script that steps `buildRide(diff).at(t)`.
- `DIFFICULTY` in `js/settings.js`: `claim` is how long a free slot stays free before a rail rider goes for it (the window the player has). `space` is the personal-space radius, and `temper` scales every annoyance rate.
- The car's mood (`Riders.mood`) is the mean annoyance of the 6 most annoyed riders. At `MOOD_LIMIT` (game.js) you go viral. Sitting reaches it in about 18 s on Normal.
- Riders walking past a player who is on a pole or in a seat squeeze by silently. Only a player standing in the aisle, or one blocking riders who are getting off at Lex, counts as blocking. Before that rule, a calm ride racked up about 28 "grumbles".

## Look of the car
- The car is the R68 the N ran around 2015, from a photo the user picked (danphotographycool.com, `_dsc9122`, "R68 N Train Interior").
  - It is a 75 ft car with four doors per side. Between each pair of doors there's a two-seat wall bench beside each door, with a bay of two-seat cross rows facing each other in the middle. The car ends have three-seat benches.
  - Seats have a `kind` (`wall` or `cross`), a `yaw` (the sitter's facing) and a `front` (the aisle spot you stand up to). Use those, not `side`, to place or face a sitter.
  - The aisle is narrow beside the bays: `walkRects` allows |x| up to `BAY_X - PLAYER_R` there and up to `KNEE_X - PLAYER_R` in front of the wall benches. Each bay has a pole at every aisle corner, with one grip slot each.
  - The colors are orange and yellow bucket seats alternating in pairs on cream frames, warm stainless walls, a cream ceiling and a dark glossy floor. They are set in `COLORS` and `SEAT_COLORS` at the top of `js/car.js`.
  - The black destination sign over each storm door reads "Astoria Ditmars Blvd / Coney Island" with the N bullet, as in the photo. It is `destinationSign()` in car.js.
- Poles and seat-end partitions have a little emissive glow, because a tunnel lit only by the three car lamps otherwise turns their camera-facing sides black.

## Rendering
- Draw calls matter, especially on phones. `mergeStatic` (pixels.js) bakes each static group into one mesh per material. Bodies bake each joint's parts into one vertex-colored mesh (`bake` in body.js), so a rider is 12 draws. Rush Hour comes to about 600 calls. Don't add per-rider meshes without baking them.
- The view is a fisheye. `World` renders a wide plain-perspective view into a render target (up to `VIEW.supersample` times the scene grid, with an sRGB target so the dark tunnel doesn't band), and a full-screen pass bends it. The camera's own `fov` is that wide source, not what you see. To put something on screen, use `world.project(v)` instead of `v.project(camera)`. `camera.userData.view` holds the visible half-angles.
- Things added after `mergeStatic` runs on a group stay separate meshes. Door leaves are nested groups on purpose, so they are left out of the merge and can still slide.
- Canvas text must be ASCII (Press Start 2P), including rider lines and signs.

## Browser testing
- `window.__game` is exposed:
  - `__game.start('easy'|'normal'|'rush')` skips the title.
  - `__game.skipTo('elevated'|'tunnel'|'river'|'lex')` jumps along the ride with you aboard.
  - `__game.advance(seconds, fn)` steps the game at 30 fps right away, calling `fn(game)` before each step. Use it because headless and background tabs throttle animation frames.
  - `__game.jolt(amp)` adds a jolt.
- Grip is held, not toggled. SPACE or the context button down calls `player.press()` and up calls `player.release()`, which lets go. While `player.gripping` is true, walking into reach of a free slot grabs it. `player.grab(slot, riders)` called directly holds until `player.letGo(riders)` or a `release()`.
- On a pole the player faces along ±z, toward the pole (`player.facing`). The lean input, body lean and HUD bar are relative to that facing, while `theta` stays in train terms. `HAND_VIEW` in player.js limits head turn and pitch so the gripping hand stays on screen, and `HOLD_BACK` and `BODY_LEAN` keep the eye from leaning past it.
- `__game.player.context(__game.riders).run()` does what pressing SPACE would. You can also call `player.grab(slot, riders)` and `player.sit(seat, riders)` directly. Import `SLOTS` and `SEATS` from `/js/layout.js`.
- If the Chrome extension isn't connected, a headless Chrome driven over the DevTools protocol works. Run Chrome with `--headless=new --remote-debugging-port=... --use-angle=swiftshader`, and use Node's built-in WebSocket for `Runtime.evaluate` and `Page.captureScreenshot`.

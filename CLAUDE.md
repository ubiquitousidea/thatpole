# Get On That Pole: notes for agents

See README.md for what the game is and the file map. This file covers the things that aren't obvious from reading the code. The look and tech come from `../eulergame` (Euler's Expedition), and its CLAUDE.md notes on the pixel filter, tilt and module caching apply here too.

## Running
- Use `/usr/bin/python3 -m http.server 8000`. There's no build step and no package.json. Three.js `0.160.0` (plus `three/addons/` for `BufferGeometryUtils`) comes from the import map in `index.html`.
- Check the pure modules without a browser: `node -e "import('./js/ride.js').then(m=>m.selfTest())"` and the same with `./js/layout.js`, `./js/stations.js` and `./js/sun.js`.

## Coordinates
- The car never moves. It sits at the origin, runs along z with the front of the train toward -z, and has x across the car, y up, and the floor at y = 0. The route group slides by `(0, -trackY(u), u)` (`Route.place`), where u is the distance along the track from Queensboro Plaza (u = 0) to Lex (u = `ROUTE_LEN`). Route objects sit at local z = -u, at absolute heights. The street is at y = -7.
- Train acceleration `a` is positive when speeding up. It acts on bodies as a pseudo-force toward +z. The balance angle `theta` is positive when leaning toward the front of the train. Speeding up tips you back, so you lean forward against it.
- The camera's yaw follows the eulergame convention, facing (-sin yaw, -cos yaw). Bodies face their local +z, so `body.yaw = cameraYaw + PI`.
- The route is straight. The car's front (-z) points at compass bearing `TRAIN_BEARING` (300°, Queensboro Plaza toward Lex), so +x is bearing 30°. `sunInCar(hour)` in sun.js uses that to put the morning sun behind the train.
- Doors open on -x at both stations. Queensboro Plaza's lower level is an island platform: our N runs on its north side, between it and Queens Plaza North (+x), and the Manhattan-bound 7's track (no train) is beyond the platform at `SEVEN_X`.
- `walkRects(openSide, platform)` in layout.js is the area where a body's center may go, with `platform` a list of rects from `stationRects(station, r)` in stations.js. Movement slides along its edges (`Player.moveBy`).
- The two stairways on the QBP platform (`QBP_STAIRS`) are walled channels you can only enter from the bottom. They climb `RISE` to the upper deck and stop short of a locked gate. While the train is still at QBP (`rideT === 0`), `Game` passes `ground` (`groundY` in stations.js) to the player, which sets `pos.y`. Everything else stays at y = 0. Staying on the stairs past the doors gives the `missed` ending.

## Gameplay tuning
- The pendulum constants live at the top of `js/player.js` (`K, C, G, LEAN, LEAN_EASE, GRIP_LIMIT`, and `FK, FC, FG, FREE_LIMIT` for standing free). Jolt sizes are in `js/ride.js` (`START_JOLT`, `STOP_JOLT`, track bumps). They were tuned by simulating against the real ride profile:
  - Every entry time uses jolt scale 1 (the old Normal). With no input, the start jolt peaks at about 0.39–0.41 rad against a 0.42 limit.
  - The times differ only in dispatcher holds (0, 2 and 1 at 7, 8 and 9 AM), and each hold adds another start and stop jolt.
  - Re-check any change the same way, with a small node script that steps `buildRide(TIMES[k]).at(t)`.
- There's no difficulty menu. The player picks an entry time, and `TIMES` in `js/settings.js` sets the crowd and the sun (`hour`). The crowd sizes follow the N's weekday peak against NYCT's guideline load of about 145 for a 75 ft car: about 91 riders at 7 AM, 154 at 8 AM, and 115 at 9 AM.
  - `seated` riders sit from the start, and `standing` riders all want one of the 72 seats.
  - `claim` is how long a free slot stays free before a rail rider goes for it (the window the player has).
  - `space` is the personal-space radius. It shrinks as the car packs in: in a crush you can't help standing close.
  - `temper` scales every annoyance rate.
  - `bump` scales how much stumbling into someone annoys them, because a packed car expects bumps.
- Riders want seats (riders.js):
  - Standing riders first look for one `SEEK_DELAY` (1 to 30 s) after spawn, then retry every `SEEK_RETRY`. At most `MAX_SEEKERS` walk to seats at once.
  - About 30% are `picky` and won't take a seat whose `NEIGHBORS` (the same bench, or the same cross row) are taken. Nobody sits beside the player's seat.
  - Once seated, riders stay seated until Lex.
  - By the tunnel (ride t of about 55 s), every seat is taken at every time. That's about 79% seated at 7 AM, 63% at 9 AM, and 47% at 8 AM, when all 60 pole slots and most rail spots are also taken. After that almost nobody walks.
  - Only rail riders who have already failed to find a seat (`looked`) and are within `CLAIM_REACH` claim a free pole slot.
- Thoughts: about 60% of riders have thoughts, `thoughtPlain` or `thoughtOdd`.
  - A rider thinks only when calm and within `THINK_NEAR` of the player, with at most 2 thoughts on screen.
  - Thoughts are bubbles with `thought: true`. They never count toward `riders.lines` (grumbles), and the HUD hides them when the rider is off screen.
- The car's mood (`Riders.mood`) is the mean annoyance of the 6 most annoyed riders. At `MOOD_LIMIT` (game.js) you go viral. Sitting reaches it in about 21, 13 and 16 s at 7, 8 and 9 AM.
- Personal space only counts while the player is loose (walking, standing in the aisle or stumbling). Holding a pole doesn't annoy your pole neighbors, however packed the car. Without this, at 8 AM the riders beside your pole, 0.3–0.5 m away, sent you viral just for holding on.
- At 8 AM every slot is taken, and a freed one is claimed within a few seconds. So losing your pole at the peak leaves you loose in the crowd, and that's the real danger. A sim player with crude 0.2 s leaning and re-grabbing peaks at a mood of about 0.57 at 8 AM, about 0.15 at 9 AM, and about 0 at 7 AM.
- Riders walking past a player who is on a pole or in a seat squeeze by silently. Only a player standing in the aisle, or one blocking riders who are getting off at Lex, counts as blocking. Before that rule, a calm ride racked up about 28 "grumbles". A blocked rider also waits 1 s before getting annoyed, because the seat rush at boarding passes a player who is still walking in the aisle.

## Look of the car
- The car is the R68 the N ran around 2015. The interior comes from a photo the user picked (danphotographycool.com, `_dsc9122`, "R68 N Train Interior"). Seat shapes and pole positions follow the user's own photo, `IMG_1753.jpeg` (not committed). The inside is 2.80 m wide (`CAR.halfW` 1.40), and the outside is 10 ft (3.05 m). The exterior comes from the user's own photos of R68A cars 5490 and 5491 at Queensboro Plaza.
  - It is a 75 ft car with four doors per side and 72 seats. Between each pair of doors there's a three-seat wall bench beside each door. In the middle is a pod of four: two two-seat rows back to back on a shared seat back at `BAYS[i]`. The front row faces forward (-z), toward its bench, and the rear row faces back. The car ends have three-seat benches.
  - Seats have a `kind` (`wall` or `cross`), a `yaw` (the sitter's facing) and a `front` (the aisle spot you stand up to). Use those, not `side`, to place or face a sitter.
  - The aisle is narrow beside the pods: `walkRects` allows |x| up to `BAY_X - PLAYER_R` there and up to `KNEE_X - PLAYER_R` in front of the wall benches. Each pod has one pole at the aisle end of its shared back, with two grip slots.
  - The pod pole stands on the pod's back (`POD_TOP`), not on the floor. Each door has a floor-to-ceiling pole in the middle of the vestibule, and each bench has a stanchion at its door end, at the front corner of the seat pan (`POLE_X`). The stanchion has a tube armrest and a windscreen bar, not a partition.
  - Benches and pods are cantilevered off the wall, with cream frames, nothing under them but the heater grille, and no partition at a bench's pod end. Build the pod's tapered end panel from boxes: `mergeStatic` can't mix indexed geometry (boxes) with non-indexed geometry (ExtrudeGeometry).
  - Riders are slim enough that the widest, about 0.44 m across the shoulders with arms, fits one 0.44 m seat (`Body` in body.js).
  - The overhead rails are at `RAIL_Y` (layout.js, 1.85 m), low enough that most of the smaller riders reach them.
  - The walls are wood-grain laminate (`woodTexture()`, tiled per meter with `box(..., { tile })`), with one big window per door section over the pod and none at the car ends.
  - The seats are orange and yellow buckets on cream frames, under a cream ceiling, over a dark glossy floor. The colors are in `COLORS` and `SEAT_COLORS` at the top of `js/car.js`.
  - The black destination sign over each storm door reads "Astoria Ditmars Blvd / Coney Island" with the N bullet, as in the photo. It is `destinationSign()` in car.js.
  - The outside is `exterior()` in car.js. Every car in the train shares it (the others are clones).
    - Fluted stainless sides, gasketed windows, sloped eaves with vent grilles, and a ribbed roof.
    - Beveled ends with safety bars, plus trucks and wheels underneath.
    - `numberPlates()`: a number plate (5490 for ours) and a flag by each end door.
    - `cabEnd()`: the front and rear cabs, with headlights in front and red markers at the back.
- Poles and the cream seat frames have a little emissive glow, because a tunnel lit only by the three car lamps otherwise turns their camera-facing sides black.

## Rendering
- Draw calls matter, especially on phones. `mergeStatic` (pixels.js) bakes each static group into one mesh per material.
  - Each rider is one vertex-colored `SkinnedMesh` whose bones are the body's own joint groups (`Body.skin` in body.js), so a rider is 1 draw and posing works as before.
  - The player's body passes `split: true` and keeps one mesh per joint, so `hideHead` can hide parts.
  - 8 AM, with 154 riders, comes to about 420 calls while boarding (shadow pass included) and about 300 on the elevated stretch. The old Rush Hour, with 90 riders, was about 1,250 and 450.
  - Don't add per-rider meshes.
- The view is a fisheye. `World` renders a wide plain-perspective view into a render target (up to `VIEW.supersample` times the scene grid, with an sRGB target so the dark tunnel doesn't band), and a full-screen pass bends it. The camera's own `fov` is that wide source, not what you see. To put something on screen, use `world.project(v)` instead of `v.project(camera)`. `camera.userData.view` holds the visible half-angles.
- Things added after `mergeStatic` runs on a group stay separate meshes. Door leaves are nested groups on purpose, so they are left out of the merge and can still slide. All the leaves on one side that slide the same way share one baked group, so `setDoors` moves four groups.
- **Sun and shadows.**
  - `World.setTime(hour)` places the sun from `sunInCar` (sun.js), using NOAA's formula for 15 September 2015 in New York. It sets the sun's color and strength, the sky and fog colors, a glow around the sun on the sky dome, and the sun disc.
  - The sun casts through one `BasicShadowMap` whose camera is fixed around the car, since the car never moves.
  - The car, the Queensboro Plaza structure and the elevated and cut (`shade()` in route.js) cast and receive. Glass, lamps, buildings and riders don't cast.
  - `shadowMap.autoUpdate` goes off underground, so the tunnel skips the shadow pass without recompiling shaders.
  - The morning sun comes from behind the train, so light through a side window lands 1–2 m ahead of it.
- The street (`queens()` in route.js) is built in pieces that leave the trench open. The gap runs from the start of the cut (`CUT_U0`) until the car's roof is below the street (`CUT_U1`, a little past the portal). Before this, a single street plane swept up through the car on the ramp.
- Canvas text must be ASCII (Press Start 2P), including rider lines and signs.

## Browser testing
- `window.__game` is exposed:
  - `__game.start(7|8|9)` skips the title (the entry hour, a `TIMES` key).
  - `__game.skipTo('elevated'|'tunnel'|'river'|'lex')` jumps along the ride with you aboard.
  - `__game.advance(seconds, fn)` steps the game at 30 fps right away, calling `fn(game)` before each step. Use it because headless and background tabs throttle animation frames.
  - `__game.jolt(amp)` adds a jolt.
- Grip is held, not toggled. SPACE or the context button down calls `player.press()` and up calls `player.release()`, which lets go. While `player.gripping` is true, walking into reach of a free slot grabs it. `player.grab(slot, riders)` called directly holds until `player.letGo(riders)` or a `release()`.
- On a pole the player faces along ±z, toward the pole (`player.facing`). The lean input, body lean and HUD bar are relative to that facing, while `theta` stays in train terms. `HAND_VIEW` in player.js limits head turn and pitch so the gripping hand stays on screen, and `HOLD_BACK` and `BODY_LEAN` keep the eye from leaning past it.
- `__game.player.context(__game.riders).run()` does what pressing SPACE would, which is grabbing a pole only. Sitting and standing up are only on M and the orange seat button (`player.seatContext(riders)`, `Game.seat()`). You can also call `player.grab(slot, riders)` and `player.sit(seat, riders)` directly. Import `SLOTS` and `SEATS` from `/js/layout.js`.
- If the Chrome extension isn't connected, a headless Chrome driven over the DevTools protocol works. Run Chrome with `--headless=new --remote-debugging-port=... --use-angle=swiftshader`, and use Node's built-in WebSocket for `Runtime.evaluate` and `Page.captureScreenshot`.

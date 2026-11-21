# Night Courier — a stealth game

[![make.fun](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![Rank](https://make.fun/badge/best-stealth-game-20261121-1759/mift2609/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![Reward](https://make.fun/badge/best-stealth-game-20261121-1759/mift2609/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

**Night Courier** is an original top-down stealth game that runs entirely
offline in a desktop browser. You are the courier the archive never sees:
slip past patrolling guards, steal every secret file, and reach the green
exit without ever letting a vision cone fill your detection meter.

## How to play

- **Move** with `WASD` or the arrow keys. **Shift** sneaks — slower and
  quieter, and much harder to spot.
- **Guards** patrol fixed routes with yellow vision cones. Step into a cone
  and their suspicion climbs; at 100% they raise the alarm and chase you.
  Break line of sight for a few seconds and they give up and go back.
- **Light matters:** dark blue shadows hide you (detection ×0.55),
  lamplight exposes you (×1.6). **Running is loud** — guards hear your
  footsteps and come to investigate.
- **Q** or a **mouse click** throws a pebble (3 per level) to lure a guard
  away from your route.
- Collect every **file** (glowing green documents), then reach the green
  **EXIT** — it only opens once all files are stolen.
- Caught three times and the run is over. Finish a level without ever
  raising the alarm for a **+300 ghost bonus**.
- Three levels of rising difficulty: **The Archive** (3 guards, 3 files),
  **The Server Vault** (3 guards, 4 files), **The Rooftop Run** (4 guards,
  4 files). Keys: `P` pause · `M` mute · `R` restart level ·
  `Enter` start. Your best score is saved in the browser.

## Run it

No build step, no network. Serve the `game/` folder with any static server
and open `game/index.html`, e.g.:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080/
```

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — the page shell: HUD (detection meter, lives, files,
  pebbles, timer, score), title/pause/caught/clear/victory overlays.
- `game/src/config.js` — every tuning constant: speeds, cone, detection,
  noise, scoring and colours.
- `game/src/levels.js` — the three level maps (walls, shadows, lamps,
  cover, documents, exit) and each guard's patrol loop.
- `game/src/world.js` — the simulation: guard patrol/chase/investigate AI,
  vision cones with line of sight, suspicion, noise, pebbles, objectives.
- `game/src/render.js` — paints the level top-down: floor, light and
  shadow, cover, cones, guards, the courier, documents and the exit.
- `game/src/input.js` — keyboard movement and mouse pebble throws.
- `game/src/audio.js` — procedural WebAudio sounds (footsteps by distance,
  pickup, pebble, alarm, clear). No sound files.
- `game/src/game.js` — the state machine: screens, lives, score, level flow.
- `game/src/shots.js` — the autopilot that stages the screenshot scenes.
- `game/src/main.js` — bootstrap and the fixed-step game loop.
- `screenshots/` — real renders of the game in a browser.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Screenshots

`?shot=start` shows the title screen over a live patrol, `?shot=play` a
mid-heist with a guard closing in, `?shot=end` the level-clear screen —
handy for taking the screenshots in `screenshots/`.

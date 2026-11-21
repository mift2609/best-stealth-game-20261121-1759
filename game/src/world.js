// Night Courier — the simulation: player, guards, detection, noise, objectives.
//
// One file, one job: the rules of stealth. It knows nothing about drawing or
// sound; it only advances a plain state object in fixed 1/60 s steps and
// reports events (document taken, alarm raised, caught, level cleared) so the
// state machine in game.js can react to them.

import {
  COLS, ROWS, TILE, STEP, PLAYER_WALK, PLAYER_SNEAK, PLAYER_RADIUS,
  GUARD_PATROL_SPEED, GUARD_CHASE_SPEED, GUARD_INVESTIGATE_SPEED, GUARD_RADIUS,
  GUARD_PAUSE_AT_WAYPOINT, GUARD_SCAN_SWEEP, CONE_RANGE, CONE_HALF_ANGLE,
  SUSPICION_GAIN, SUSPICION_DECAY, LIGHT_FACTOR_LIT, LIGHT_FACTOR_SHADOW,
  LIGHT_FACTOR_NORMAL, MOVE_FACTOR_RUN, MOVE_FACTOR_SNEAK, MOVE_FACTOR_STILL,
  LOSE_SIGHT_SECONDS, CATCH_DISTANCE, NOISE_RUN_RADIUS, NOISE_RUN_INTERVAL,
  NOISE_PEBBLE_RADIUS, PEBBLE_RANGE, PEBBLE_SPEED, INVESTIGATE_LOOK_SECONDS,
  PEBBLES_PER_LEVEL, SCORE_DOCUMENT,
} from './config.js';
import { parseLevel, isBlockingTile, blocksSight } from './levels.js';

export const EVENT_DOCUMENT = 1;
export const EVENT_ALARM = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_CLEAR = 8;
export const EVENT_NOISE = 16;

export const GUARD_PATROL = 'patrol';
export const GUARD_CHASE = 'chase';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_RETURN = 'return';

/** Breadth-first path on the tile grid between two tile coordinates. */
export function findPath(tiles, fromCol, fromRow, toCol, toRow) {
  const key = (c, r) => c + ',' + r;
  if (fromCol === toCol && fromRow === toRow) return [];
  const prev = new Map();
  const queue = [[fromCol, fromRow]];
  prev.set(key(fromCol, fromRow), null);
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      if (isBlockingTile(tiles, nc, nr)) continue;
      if (prev.has(key(nc, nr))) continue;
      prev.set(key(nc, nr), [c, r]);
      if (nc === toCol && nr === toRow) {
        const path = [];
        let cur = [nc, nr];
        while (cur) {
          path.unshift(cur);
          cur = prev.get(key(cur[0], cur[1]));
        }
        return path.slice(1);
      }
      queue.push([nc, nr]);
    }
  }
  return [];
}

/** True when no wall, crate or shelf stands between the two points. */
export function hasLineOfSight(tiles, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (TILE / 3)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const col = Math.floor((ax + dx * t) / TILE);
    const row = Math.floor((ay + dy * t) / TILE);
    if (blocksSight(tiles, col, row)) return false;
  }
  return true;
}

function tileAt(tiles, x, y) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (row < 0 || row >= tiles.length || col < 0 || col >= tiles[0].length) return 'wall';
  return tiles[row][col];
}

/** Circle-vs-blocking-tiles collision: slide along one axis at a time. */
function moveWithCollision(tiles, body, dx, dy) {
  const r = body.radius;
  let nx = body.x + dx;
  if (!circleHitsWall(tiles, nx, body.y, r)) body.x = nx;
  let ny = body.y + dy;
  if (!circleHitsWall(tiles, body.x, ny, r)) body.y = ny;
}

function circleHitsWall(tiles, x, y, r) {
  const c0 = Math.floor((x - r) / TILE);
  const c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE);
  const r1 = Math.floor((y + r) / TILE);
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (!isBlockingTile(tiles, col, row)) continue;
      const cx = Math.max(col * TILE, Math.min(x, col * TILE + TILE));
      const cy = Math.max(row * TILE, Math.min(y, row * TILE + TILE));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
  }
  return false;
}

/** Light factor of the tile the player stands on: shadow hides, lamps expose. */
export function lightFactorAt(tiles, x, y) {
  const kind = tileAt(tiles, x, y);
  if (kind === 'lit') return LIGHT_FACTOR_LIT;
  if (kind === 'shadow') return LIGHT_FACTOR_SHADOW;
  return LIGHT_FACTOR_NORMAL;
}

/** How much of the guard's cone the player is in: 0 when unseen. */
function coneVisibility(tiles, guard, px, py) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > CONE_RANGE) return 0;
  if (dist < 4) return 1;
  let angle = Math.atan2(dy, dx) - guard.facing;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  if (Math.abs(angle) > CONE_HALF_ANGLE) return 0;
  if (!hasLineOfSight(tiles, guard.x, guard.y, px, py)) return 0;
  return 1 - (dist / CONE_RANGE) * 0.6;
}

/** Create the fresh state for one level. */
export function createWorld(levelDef) {
  const parsed = parseLevel(levelDef);
  const guards = parsed.guardSpawns.map((spawn) => {
    // Match the patrol loop that starts on this guard's spawn tile.
    const loop = levelDef.patrols.find(
      (p) => p[0][0] === Math.floor(spawn.x / TILE) && p[0][1] === Math.floor(spawn.y / TILE),
    ) ?? levelDef.patrols[spawn.index % levelDef.patrols.length];
    const waypoints = loop.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));
    return {
      x: spawn.x,
      y: spawn.y,
      radius: GUARD_RADIUS,
      facing: -Math.PI / 2,
      state: GUARD_PATROL,
      waypoints,
      waypointIndex: 1 % waypoints.length,
      path: [],
      pauseTimer: 0,
      scanBase: -Math.PI / 2,
      scanPhase: 0,
      suspicion: 0,
      lastSeen: null,
      unseenTimer: 0,
      lookTimer: 0,
      investigateTarget: null,
      speed: GUARD_PATROL_SPEED,
    };
  });
  return {
    tiles: parsed.tiles,
    levelDef,
    player: {
      x: parsed.player.x,
      y: parsed.player.y,
      radius: PLAYER_RADIUS,
      facing: -Math.PI / 2,
      moving: false,
      sneaking: false,
      running: false,
    },
    guards,
    documents: parsed.documents,
    exit: parsed.exit,
    documentsTaken: 0,
    pebbles: PEBBLES_PER_LEVEL,
    pebble: null,
    noise: null,
    noiseTimer: 0,
    runNoiseTimer: 0,
    alarm: false,
    everAlarmed: false,
    time: 0,
    caught: false,
    cleared: false,
  };
}

/** Throw a pebble toward a point (clamped to range); returns false when out. */
export function throwPebble(state, tx, ty) {
  if (state.pebbles <= 0 || state.pebble) return false;
  const dx = tx - state.player.x;
  const dy = ty - state.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return false;
  const clamped = Math.min(dist, PEBBLE_RANGE);
  const nx = state.player.x + (dx / dist) * clamped;
  const ny = state.player.y + (dy / dist) * clamped;
  state.pebbles -= 1;
  state.pebble = { x: state.player.x, y: state.player.y, tx: nx, ty: ny, speed: PEBBLE_SPEED };
  return true;
}

function guardTargetPoint(guard) {
  if (guard.path.length > 0) return guard.path[0];
  return null;
}

function followPath(guard, speed, dt) {
  const target = guardTargetPoint(guard);
  if (!target) return true;
  const tx = target[0] * TILE + TILE / 2;
  const ty = target[1] * TILE + TILE / 2;
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= Math.max(step, 3)) {
    guard.x = tx;
    guard.y = ty;
    guard.path.shift();
    return guard.path.length === 0;
  }
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  guard.facing = Math.atan2(dy, dx);
  return false;
}

function setGuardPath(state, guard, tx, ty) {
  const fromCol = Math.floor(guard.x / TILE);
  const fromRow = Math.floor(guard.y / TILE);
  const toCol = Math.floor(tx / TILE);
  const toRow = Math.floor(ty / TILE);
  guard.path = findPath(state.tiles, fromCol, fromRow, toCol, toRow);
}

function updateGuard(state, guard, dt) {
  const player = state.player;
  const visibility = coneVisibility(state.tiles, guard, player.x, player.y);

  if (visibility > 0) {
    const light = lightFactorAt(state.tiles, player.x, player.y);
    const move = player.moving ? (player.sneaking ? MOVE_FACTOR_SNEAK : MOVE_FACTOR_RUN) : MOVE_FACTOR_STILL;
    guard.suspicion = Math.min(100, guard.suspicion + SUSPICION_GAIN * visibility * light * move * dt);
    guard.lastSeen = { x: player.x, y: player.y };
    guard.unseenTimer = 0;
  } else {
    guard.suspicion = Math.max(0, guard.suspicion - SUSPICION_DECAY * dt);
    guard.unseenTimer += dt;
  }

  if (guard.suspicion >= 100 && guard.state !== GUARD_CHASE) {
    guard.state = GUARD_CHASE;
    guard.path = [];
    state.alarm = true;
    state.everAlarmed = true;
    return EVENT_ALARM;
  }
  if (guard.state === GUARD_CHASE) {
    if (visibility > 0) {
      guard.lastSeen = { x: player.x, y: player.y };
      guard.unseenTimer = 0;
    }
    const target = guard.lastSeen ?? { x: player.x, y: player.y };
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const dist = Math.hypot(dx, dy);
    const step = GUARD_CHASE_SPEED * dt;
    if (dist > 1) {
      const nx = guard.x + (dx / dist) * Math.min(step, dist);
      const ny = guard.y + (dy / dist) * Math.min(step, dist);
      if (!circleHitsWall(state.tiles, nx, guard.y, guard.radius)) guard.x = nx;
      if (!circleHitsWall(state.tiles, guard.x, ny, guard.radius)) guard.y = ny;
      guard.facing = Math.atan2(dy, dx);
    }
    if (Math.hypot(player.x - guard.x, player.y - guard.y) < CATCH_DISTANCE) {
      state.caught = true;
      return EVENT_CAUGHT;
    }
    if (guard.unseenTimer > LOSE_SIGHT_SECONDS) {
      guard.state = GUARD_RETURN;
      setGuardPath(state, guard, guard.waypoints[guard.waypointIndex].x, guard.waypoints[guard.waypointIndex].y);
    }
    return 0;
  }

  if (guard.state === GUARD_INVESTIGATE) {
    if (guard.investigateTarget && followPath(guard, GUARD_INVESTIGATE_SPEED, dt)) {
      guard.lookTimer += dt;
      guard.scanPhase += dt;
      guard.facing = guard.scanBase + Math.sin(guard.scanPhase * 1.6) * GUARD_SCAN_SWEEP;
      if (guard.lookTimer >= INVESTIGATE_LOOK_SECONDS) {
        guard.state = GUARD_RETURN;
        guard.investigateTarget = null;
        setGuardPath(state, guard, guard.waypoints[guard.waypointIndex].x, guard.waypoints[guard.waypointIndex].y);
      }
    }
    return 0;
  }

  if (guard.state === GUARD_RETURN) {
    if (followPath(guard, GUARD_PATROL_SPEED, dt)) {
      guard.state = GUARD_PATROL;
      guard.pauseTimer = GUARD_PAUSE_AT_WAYPOINT;
      guard.scanBase = guard.facing;
      guard.scanPhase = 0;
    }
    return 0;
  }

  // Patrol: walk the loop, pausing at each waypoint to scan around.
  if (guard.pauseTimer > 0) {
    guard.pauseTimer -= dt;
    guard.scanPhase += dt;
    guard.facing = guard.scanBase + Math.sin(guard.scanPhase * 1.4) * GUARD_SCAN_SWEEP;
    return 0;
  }
  const wp = guard.waypoints[guard.waypointIndex];
  const dx = wp.x - guard.x;
  const dy = wp.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const step = GUARD_PATROL_SPEED * dt;
  if (dist <= Math.max(step, 3)) {
    guard.x = wp.x;
    guard.y = wp.y;
    guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
    guard.pauseTimer = GUARD_PAUSE_AT_WAYPOINT;
    guard.scanBase = guard.facing;
    guard.scanPhase = 0;
  } else {
    guard.x += (dx / dist) * step;
    guard.y += (dy / dist) * step;
    guard.facing = Math.atan2(dy, dx);
  }
  return 0;
}

/**
 * Advance the world one fixed step. `move` is {x, y} in -1..1, `sneak` is
 * held, `noiseAt` is an optional point the player just made noise at.
 * Returns a bitmask of EVENT_* flags.
 */
export function stepWorld(state, move, sneak, dt = STEP) {
  let events = 0;
  state.time += dt;
  const player = state.player;

  const mag = Math.hypot(move.x, move.y);
  player.moving = mag > 0.1;
  player.sneaking = sneak && player.moving;
  player.running = player.moving && !sneak;
  if (player.moving) {
    const speed = sneak ? PLAYER_SNEAK : PLAYER_WALK;
    const nx = (move.x / Math.max(mag, 1)) * speed * dt;
    const ny = (move.y / Math.max(mag, 1)) * speed * dt;
    moveWithCollision(state.tiles, player, nx, ny);
    player.facing = Math.atan2(ny, nx);
  }

  // Running feet are loud: guards nearby come to look.
  if (player.running) {
    state.runNoiseTimer -= dt;
    if (state.runNoiseTimer <= 0) {
      state.runNoiseTimer = NOISE_RUN_INTERVAL;
      state.noise = { x: player.x, y: player.y, radius: NOISE_RUN_RADIUS, ttl: 0.4 };
      events |= EVENT_NOISE;
    }
  }

  // A thrown pebble flies, lands with a clatter, and pulls guards over.
  if (state.pebble) {
    const p = state.pebble;
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step) {
      state.noise = { x: p.tx, y: p.ty, radius: NOISE_PEBBLE_RADIUS, ttl: 0.5 };
      state.pebble = null;
      events |= EVENT_NOISE;
    } else {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }
  }
  if (state.noise) {
    state.noise.ttl -= dt;
    if (state.noise.ttl <= 0) state.noise = null;
    else {
      for (const guard of state.guards) {
        if (guard.state !== GUARD_PATROL && guard.state !== GUARD_RETURN) continue;
        const d = Math.hypot(guard.x - state.noise.x, guard.y - state.noise.y);
        if (d < state.noise.radius) {
          guard.state = GUARD_INVESTIGATE;
          guard.investigateTarget = { x: state.noise.x, y: state.noise.y };
          guard.lookTimer = 0;
          guard.scanBase = guard.facing;
          guard.scanPhase = 0;
          setGuardPath(state, guard, state.noise.x, state.noise.y);
        }
      }
    }
  }

  // Pick up documents by walking over them.
  for (const doc of state.documents) {
    if (!doc.taken && Math.hypot(doc.x - player.x, doc.y - player.y) < 26) {
      doc.taken = true;
      state.documentsTaken += 1;
      events |= EVENT_DOCUMENT;
    }
  }

  for (const guard of state.guards) {
    events |= updateGuard(state, guard, dt);
    if (state.caught) return events;
  }

  // Reaching the exit with every document clears the level.
  if (state.documentsTaken === state.documents.length) {
    if (Math.hypot(state.exit.x - player.x, state.exit.y - player.y) < 28) {
      state.cleared = true;
      events |= EVENT_CLEAR;
    }
  }

  state.alarm = state.guards.some((g) => g.state === GUARD_CHASE);
  return events;
}

/** Highest current suspicion across guards — the HUD detection meter. */
export function detectionLevel(state) {
  let top = 0;
  for (const guard of state.guards) top = Math.max(top, guard.suspicion);
  return top;
}

/** Score so far in this level (documents only; bonuses land in game.js). */
export function levelScore(state) {
  return state.documentsTaken * SCORE_DOCUMENT;
}

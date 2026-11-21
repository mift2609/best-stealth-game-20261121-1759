// Night Courier — the screenshot scenes behind ?shot=start|play|end.
//
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot (breadth-first path to the
// nearest document, wait in shadow when a guard's cone covers the next
// step, sneak near guards), so every frame is what a short game really
// looks like and the same seed always gives the same frame. The play pilot
// is patient; the end pilot is reckless, so it gets caught — unless it
// clears the level first, in which case the shot shows the clear screen.

import { STEP, TILE } from './config.js';
import { LEVELS } from './levels.js';
import { createWorld, stepWorld, findPath, EVENT_CAUGHT, EVENT_CLEAR, detectionLevel } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_OVER } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 16;
const END_LIMIT_SECONDS = 420;

function guardSeesPoint(world, x, y) {
  for (const guard of world.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 190) continue;
    let angle = Math.atan2(dy, dx) - guard.facing;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) < 0.65) return true;
  }
  return false;
}

function nearestTarget(world) {
  const player = world.player;
  let bestDoc = null;
  let bestDist = Infinity;
  for (const doc of world.documents) {
    if (doc.taken) continue;
    const d = Math.hypot(doc.x - player.x, doc.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      bestDoc = doc;
    }
  }
  if (bestDoc) return { x: bestDoc.x, y: bestDoc.y };
  return { x: world.exit.x, y: world.exit.y };
}

/** One autopilot step: follow the BFS path to the target, or wait. */
function autopilotStep(world, patient) {
  const player = world.player;
  const target = nearestTarget(world);
  const fromCol = Math.floor(player.x / TILE);
  const fromRow = Math.floor(player.y / TILE);
  const toCol = Math.floor(target.x / TILE);
  const toRow = Math.floor(target.y / TILE);
  const path = findPath(world.tiles, fromCol, fromRow, toCol, toRow);
  // No path (already on the target tile): head straight for the point.
  const next = path.length > 0
    ? { x: path[0][0] * TILE + TILE / 2, y: path[0][1] * TILE + TILE / 2 }
    : target;
  const dx = next.x - player.x;
  const dy = next.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return { x: 0, y: 0, sneak: true };
  const danger = detectionLevel(world) > 45 || guardSeesPoint(world, next.x, next.y);
  if (danger && patient) return { x: 0, y: 0, sneak: true };
  const nearGuard = world.guards.some((g) => Math.hypot(g.x - player.x, g.y - player.y) < 150);
  return { x: dx / dist, y: dy / dist, sneak: nearGuard || danger };
}

/** Run the world forward with the autopilot for up to `seconds`. */
function simulate(world, seconds, patient) {
  let events = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const move = autopilotStep(world, patient);
    events = stepWorld(world, { x: move.x, y: move.y }, move.sneak, STEP);
    if (events & (EVENT_CAUGHT | EVENT_CLEAR)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play or end) and return the screen
 * to draw over it plus the score to show.
 */
export function stageShot(name, world) {
  const fresh = createWorld(LEVELS[0]);
  world.tiles = fresh.tiles;
  world.levelDef = fresh.levelDef;
  world.player = fresh.player;
  world.guards = fresh.guards;
  world.documents = fresh.documents;
  world.exit = fresh.exit;
  world.documentsTaken = 0;
  world.pebbles = fresh.pebbles;
  world.pebble = null;
  world.noise = null;
  world.time = 0;
  world.alarm = false;
  world.everAlarmed = false;
  world.caught = false;
  world.cleared = false;

  if (name !== 'play' && name !== 'end') {
    simulate(world, START_SECONDS, true);
    return { screen: SCREEN_TITLE, score: 0, levelIndex: 0 };
  }
  if (name === 'play') {
    // Reckless on purpose: the pilot walks into a cone, so the frame shows
    // the detection meter hot and a guard closing in.
    simulate(world, PLAY_SECONDS, false);
    return { screen: SCREEN_PLAY, score: world.documentsTaken * 150, levelIndex: 0 };
  }
  const events = simulate(world, END_LIMIT_SECONDS, true);
  if (events & EVENT_CLEAR) {
    return { screen: SCREEN_CLEAR, score: world.documentsTaken * 150 + 200, levelIndex: 0 };
  }
  return { screen: world.caught ? SCREEN_CAUGHT : SCREEN_OVER, score: world.documentsTaken * 150, levelIndex: 0 };
}

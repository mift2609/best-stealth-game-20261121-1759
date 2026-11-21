// Night Courier — boot and the one loop.
//
// Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between title, play, paused, caught,
// level-clear, victory and game-over screens, all owned by game.js.
//
// ?shot=start|play|end stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { LEVELS } from './levels.js';
import { createWorld, detectionLevel } from './world.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_VICTORY, SCREEN_OVER } from './render.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, ACTION_PEBBLE_KEY, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = {
  level: document.getElementById('hud-level'),
  docs: document.getElementById('hud-docs'),
  meter: document.getElementById('hud-meter-fill'),
  meterLabel: document.getElementById('hud-meter-label'),
  lives: document.getElementById('hud-lives'),
  pebbles: document.getElementById('hud-pebbles'),
  time: document.getElementById('hud-time'),
  score: document.getElementById('hud-score'),
  best: document.getElementById('hud-best'),
  mute: document.getElementById('btn-mute'),
};
const overlays = {
  title: document.getElementById('overlay-title'),
  paused: document.getElementById('overlay-paused'),
  caught: document.getElementById('overlay-caught'),
  clear: document.getElementById('overlay-clear'),
  victory: document.getElementById('overlay-victory'),
  over: document.getElementById('overlay-over'),
};
const overlayFields = {
  'clear-score': document.getElementById('clear-score'),
  'clear-next': document.getElementById('clear-next'),
  'victory-score': document.getElementById('victory-score'),
  'victory-best': document.getElementById('victory-best'),
  'over-score': document.getElementById('over-score'),
  'over-best': document.getElementById('over-best'),
  'caught-lives': document.getElementById('caught-lives'),
  'title-best': document.getElementById('title-best'),
};

const audio = createAudio();
const renderer = createRenderer(canvas);

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showOverlay(name) {
  for (const key of Object.keys(overlays)) {
    overlays[key].hidden = key !== name;
  }
}

function renderHud(h) {
  hud.level.textContent = h.levelName;
  hud.docs.textContent = `${h.documentsTaken}/${h.documentsTotal} files`;
  hud.meter.style.width = `${Math.round(h.detection)}%`;
  hud.meter.className = h.alarm ? 'alarm' : h.detection > 55 ? 'hot' : h.detection > 20 ? 'warm' : '';
  hud.meterLabel.textContent = h.alarm ? 'ALARM!' : h.detection > 55 ? 'SPOTTED — HIDE!' : h.detection > 20 ? 'Suspicious…' : 'Unseen';
  hud.lives.textContent = '♥'.repeat(Math.max(0, h.lives)) + '♡'.repeat(Math.max(0, 3 - h.lives));
  hud.pebbles.textContent = `◉ ×${h.pebbles}`;
  hud.time.textContent = fmtTime(h.time);
  hud.score.textContent = String(h.score);
  hud.best.textContent = String(h.best);
  hud.mute.textContent = h.muted ? '🔇 Sound: off (M)' : '🔊 Sound: on (M)';
}

function renderScreen(screen, info) {
  const map = {
    [SCREEN_TITLE]: 'title',
    [SCREEN_PAUSED]: 'paused',
    [SCREEN_CAUGHT]: 'caught',
    [SCREEN_CLEAR]: 'clear',
    [SCREEN_VICTORY]: 'victory',
    [SCREEN_OVER]: 'over',
  };
  const name = map[screen] ?? null;
  if (name) {
    if (name === 'clear') {
      overlayFields['clear-score'].textContent = `Score: ${info.score}`;
      overlayFields['clear-next'].textContent = info.levelIndex + 1 < LEVELS.length
        ? `Next: ${LEVELS[info.levelIndex + 1].name}`
        : '';
    }
    if (name === 'victory') {
      overlayFields['victory-score'].textContent = `Final score: ${info.score}`;
      overlayFields['victory-best'].textContent = `Best: ${info.best}`;
    }
    if (name === 'over') {
      overlayFields['over-score'].textContent = `Score: ${info.score}`;
      overlayFields['over-best'].textContent = `Best: ${info.best}`;
    }
    if (name === 'caught') {
      overlayFields['caught-lives'].textContent = info.lives > 0
        ? `${info.lives} ${info.lives === 1 ? 'life' : 'lives'} left — the guards drag you back to the start.`
        : '';
    }
    if (name === 'title') {
      overlayFields['title-best'].textContent = info.best > 0 ? `Best score: ${info.best}` : 'No courier has finished a run yet.';
    }
    showOverlay(name);
  } else {
    showOverlay(null);
  }
  const label = {
    [SCREEN_TITLE]: 'Night Courier. Title screen. Press Enter to start.',
    [SCREEN_PLAY]: 'Night Courier. Playing.',
    [SCREEN_PAUSED]: 'Paused.',
    [SCREEN_CAUGHT]: 'Spotted! A guard caught you.',
    [SCREEN_CLEAR]: 'Level cleared.',
    [SCREEN_VICTORY]: 'You stole every file. Victory!',
    [SCREEN_OVER]: 'Game over.',
  }[screen];
  if (label) status.textContent = label;
}

function runShot(name) {
  const world = createWorld(LEVELS[0]);
  const scene = stageShot(name, world);
  const score = scene.score;
  let painted = 0;
  const hudState = {
    levelName: LEVELS[0].name,
    briefing: LEVELS[0].briefing,
    // The title scene shows the world mid-patrol behind the overlay, but its
    // HUD must read like a fresh run: no files yet, clock at zero.
    documentsTaken: scene.screen === SCREEN_TITLE ? 0 : world.documentsTaken,
    documentsTotal: world.documents.length,
    detection: scene.screen === SCREEN_TITLE ? 0 : detectionLevel(world),
    alarm: false,
    lives: 3,
    pebbles: world.pebbles,
    time: scene.screen === SCREEN_TITLE ? 0 : world.time,
    score,
    best: score,
    muted: false,
  };
  renderHud(hudState);
  renderScreen(scene.screen, { levelIndex: 0, score, best: score, lives: 3 });
  function paint() {
    renderer.draw(world, scene.screen, world.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const game = createGame({
    audio,
    onHud: renderHud,
    onScreen: renderScreen,
  });
  const input = createInput(canvas, (action) => {
    if (action === ACTION_PEBBLE_KEY) {
      // Q throws a pebble at the mouse position, or straight ahead.
      game.update({ x: 0, y: 0 }, false, { x: game.world.player.x + Math.cos(game.world.player.facing) * 120, y: game.world.player.y + Math.sin(game.world.player.facing) * 120 }, 0);
      return;
    }
    game.action(action);
  });
  document.querySelectorAll('[data-button]').forEach((button) => {
    button.addEventListener('click', () => {
      audio.unlock();
      game.button(button.dataset.button);
    });
  });
  renderScreen(SCREEN_TITLE, { levelIndex: 0, score: 0, best: readBest(), lives: 3 });
  game.pushHud();

  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;
  function frame(now) {
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += frameSeconds;
    if (game.screen === SCREEN_PLAY) {
      accumulator += frameSeconds;
      while (accumulator >= STEP) {
        const pebbleTarget = input.takePebbleTarget();
        game.update(input.moveVector(), input.sneak(), pebbleTarget, STEP);
        accumulator -= STEP;
        if (game.screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game.world, game.screen, elapsed);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function readBest() {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }
}

if (shot) runShot(shot);
else runGame();

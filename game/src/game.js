// Night Courier — the state machine: title, play, pause, caught, cleared,
// victory and game over, plus score, lives and the level flow.
//
// One file, one job: it owns which screen is showing and what a level
// transition means. The simulation lives in world.js, the drawing in
// render.js; this file only wires them together and talks to the HUD.

import { BEST_KEY, LIVES, SCORE_LEVEL_CLEAR, SCORE_GHOST_BONUS, SCORE_TIME_BONUS_PER_SECOND } from './config.js';
import { LEVELS } from './levels.js';
import {
  createWorld, stepWorld, throwPebble, detectionLevel,
  EVENT_DOCUMENT, EVENT_ALARM, EVENT_CAUGHT, EVENT_CLEAR, EVENT_NOISE,
} from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_VICTORY, SCREEN_OVER } from './render.js';

export function createGame(callbacks) {
  const { onHud, onScreen, audio } = callbacks;
  let screen = SCREEN_TITLE;
  let levelIndex = 0;
  let world = createWorld(LEVELS[0]);
  let lives = LIVES;
  let score = 0;
  let best = readBest();
  let levelScore = 0;
  let muted = false;

  function readBest() {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
      // Private windows: the best score lasts this visit only.
    }
  }

  function setScreen(next) {
    screen = next;
    onScreen(next, {
      levelIndex,
      level: LEVELS[levelIndex],
      score,
      best,
      lives,
      world,
    });
    pushHud();
  }

  function pushHud() {
    onHud({
      screen,
      levelName: LEVELS[levelIndex].name,
      briefing: LEVELS[levelIndex].briefing,
      documentsTaken: world.documentsTaken,
      documentsTotal: world.documents.length,
      detection: detectionLevel(world),
      alarm: world.alarm,
      lives,
      pebbles: world.pebbles,
      time: world.time,
      score: score + levelScore,
      best: Math.max(best, score + levelScore),
      muted,
    });
  }

  function startLevel(index) {
    levelIndex = index;
    world = createWorld(LEVELS[index]);
    levelScore = 0;
    setScreen(SCREEN_PLAY);
  }

  function startGame() {
    score = 0;
    lives = LIVES;
    audio.unlock();
    audio.click();
    startLevel(0);
  }

  function levelCleared() {
    const timeBonus = Math.max(0, Math.round((LEVELS[levelIndex].par - world.time) * SCORE_TIME_BONUS_PER_SECOND));
    const ghost = world.everAlarmed ? 0 : SCORE_GHOST_BONUS;
    levelScore += SCORE_LEVEL_CLEAR + timeBonus + ghost;
    audio.clear();
    if (levelIndex + 1 >= LEVELS.length) {
      score += levelScore;
      if (score > best) {
        best = score;
        saveBest(best);
      }
      setScreen(SCREEN_VICTORY);
    } else {
      setScreen(SCREEN_CLEAR);
    }
  }

  function caught() {
    audio.caught();
    lives -= 1;
    if (lives <= 0) {
      score += levelScore;
      if (score > best) {
        best = score;
        saveBest(best);
      }
      setScreen(SCREEN_OVER);
    } else {
      setScreen(SCREEN_CAUGHT);
    }
  }

  return {
    get screen() {
      return screen;
    },
    get world() {
      return world;
    },
    get levelIndex() {
      return levelIndex;
    },

    /** One frame of play: advance the world when the screen is the game. */
    update(move, sneak, pebbleTarget, dt) {
      if (screen !== SCREEN_PLAY) return;
      if (pebbleTarget) {
        if (throwPebble(world, pebbleTarget.x, pebbleTarget.y)) audio.pebble();
      }
      const events = stepWorld(world, move, sneak, dt);
      if (events & EVENT_DOCUMENT) {
        levelScore += 150;
        audio.pickup();
      }
      if (events & EVENT_ALARM) audio.alarm();
      if (events & EVENT_NOISE) {
        // Footsteps: the nearest patrolling guard's tread, by distance.
        let nearest = Infinity;
        for (const guard of world.guards) {
          nearest = Math.min(nearest, Math.hypot(guard.x - world.player.x, guard.y - world.player.y));
        }
        if (nearest < 320) audio.footstep(1 - nearest / 320);
      }
      pushHud();
      if (events & EVENT_CAUGHT) {
        caught();
        return;
      }
      if (events & EVENT_CLEAR) levelCleared();
    },

    /** One-shot keys: Enter, P, M, R, Q. */
    action(name) {
      audio.unlock();
      if (name === 'mute') {
        muted = audio.toggleMute();
        pushHud();
        return;
      }
      if (name === 'restart') {
        if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_CAUGHT || screen === SCREEN_OVER) {
          audio.click();
          if (screen === SCREEN_OVER) startGame();
          else startLevel(levelIndex);
        }
        return;
      }
      if (name === 'pause') {
        if (screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED);
        else if (screen === SCREEN_PAUSED) setScreen(SCREEN_PLAY);
        return;
      }
      if (name === 'confirm') {
        audio.click();
        if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
        else if (screen === SCREEN_CLEAR) {
          score += levelScore;
          startLevel(levelIndex + 1);
        } else if (screen === SCREEN_VICTORY) startGame();
        else if (screen === SCREEN_CAUGHT) startLevel(levelIndex);
        else if (screen === SCREEN_PAUSED) setScreen(SCREEN_PLAY);
      }
    },

    /** Called by overlay buttons: same intents as the keys. */
    button(name) {
      if (name === 'start') this.action('confirm');
      else if (name === 'resume') this.action('pause');
      else if (name === 'retry') this.action('confirm');
      else if (name === 'next') this.action('confirm');
      else if (name === 'again') this.action('confirm');
      else if (name === 'mute') this.action('mute');
    },

    pushHud,
    setScreen,
    startGame,
  };
}

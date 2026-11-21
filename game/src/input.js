// Night Courier — input: keyboard movement plus mouse pebble throws.
//
// One file, one job: turn keys and clicks into the small intents the game
// loop reads each frame (a move vector, sneak held, a pebble target, and the
// one-shot action keys). It never decides what those intents do.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_PEBBLE_KEY = 'pebble';

const MOVE_KEYS = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

const ACTION_KEYS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  KeyQ: ACTION_PEBBLE_KEY,
};

export function createInput(canvas, onAction) {
  const held = new Set();
  let sneakHeld = false;
  let pebbleTarget = null;

  function isMoveKey(code) {
    return Object.prototype.hasOwnProperty.call(MOVE_KEYS, code);
  }

  function onKeyDown(event) {
    if (isMoveKey(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      sneakHeld = true;
      event.preventDefault();
      return;
    }
    const action = ACTION_KEYS[event.code];
    if (action && !event.repeat) {
      event.preventDefault();
      onAction(action);
    }
  }

  function onKeyUp(event) {
    if (isMoveKey(event.code)) held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') sneakHeld = false;
  }

  function onBlur() {
    held.clear();
    sneakHeld = false;
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    pebbleTarget = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    /** Current move vector, normalised to length 1 at most. */
    moveVector() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        x += MOVE_KEYS[code].x;
        y += MOVE_KEYS[code].y;
      }
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    sneak() {
      return sneakHeld;
    },
    /** Take a pending click-to-throw target, if the player clicked. */
    takePebbleTarget() {
      const target = pebbleTarget;
      pebbleTarget = null;
      return target;
    },
  };
}

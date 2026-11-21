// Night Courier — shared tuning constants for the whole game.
// One file, one job: every number the other modules agree on lives here,
// so difficulty can be tuned without touching the simulation or the renderer.

export const TILE = 40;
export const COLS = 24;
export const ROWS = 16;
export const VIEW_W = COLS * TILE; // 960
export const VIEW_H = ROWS * TILE; // 640
export const STEP = 1 / 60;
export const BEST_KEY = 'night-courier-best';
export const LIVES = 3;
export const PEBBLES_PER_LEVEL = 3;

// Player movement (pixels per second).
export const PLAYER_WALK = 150;
export const PLAYER_SNEAK = 88;
export const PLAYER_RADIUS = 13;

// Guards.
export const GUARD_PATROL_SPEED = 72;
export const GUARD_CHASE_SPEED = 168;
export const GUARD_INVESTIGATE_SPEED = 110;
export const GUARD_RADIUS = 14;
export const GUARD_PAUSE_AT_WAYPOINT = 1.1; // seconds stood still, scanning
export const GUARD_SCAN_SWEEP = 0.9; // radians the guard sweeps while paused

// Vision cones.
export const CONE_RANGE = 185;
export const CONE_HALF_ANGLE = 0.62; // radians, about 35 degrees each side
export const CONE_FOV_CATCH = 0.5; // suspicion only counts inside this

// Detection: suspicion 0..100. Reaching 100 raises the alarm.
export const SUSPICION_GAIN = 78; // per second at point blank, in the open
export const SUSPICION_DECAY = 30; // per second while unseen
export const LIGHT_FACTOR_LIT = 1.6;
export const LIGHT_FACTOR_SHADOW = 0.55;
export const LIGHT_FACTOR_NORMAL = 1.0;
export const MOVE_FACTOR_RUN = 1.35;
export const MOVE_FACTOR_SNEAK = 0.7;
export const MOVE_FACTOR_STILL = 0.85;
export const LOSE_SIGHT_SECONDS = 2.5; // unseen this long ends a chase
export const CATCH_DISTANCE = 22;

// Noise: running feet and thrown pebbles pull guards to investigate.
export const NOISE_RUN_RADIUS = 105;
export const NOISE_RUN_INTERVAL = 0.38; // seconds between footstep noises
export const NOISE_PEBBLE_RADIUS = 150;
export const PEBBLE_RANGE = 280;
export const PEBBLE_SPEED = 520;
export const INVESTIGATE_LOOK_SECONDS = 2.0;

// Scoring.
export const SCORE_DOCUMENT = 150;
export const SCORE_LEVEL_CLEAR = 200;
export const SCORE_GHOST_BONUS = 300; // finish a level without ever raising the alarm
export const SCORE_TIME_BONUS_PER_SECOND = 4; // under the level's par time

// Colours used by the renderer (kept here so HUD and canvas agree).
export const COLORS = {
  floor: '#232a33',
  floorAlt: '#20262e',
  shadowFloor: '#161d26',
  litFloor: '#3a3324',
  wall: '#0d1117',
  wallTop: '#39434f',
  crate: '#6b4f2a',
  crateTop: '#8a6a38',
  shelf: '#4a3b5e',
  shelfTop: '#63517a',
  player: '#e8b64c',
  playerCloak: '#2f6fb2',
  guard: '#c94f4f',
  guardCone: 'rgba(255, 214, 90, 0.20)',
  guardConeAlert: 'rgba(255, 70, 60, 0.30)',
  document: '#7fe0a8',
  exit: '#39d353',
  exitGlow: 'rgba(57, 211, 83, 0.25)',
};

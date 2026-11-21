// Night Courier — the renderer: paints the level top-down on one canvas.
//
// One file, one job: given a world state and a screen name, draw everything
// the player sees — floor, light pools and shadows, cover, vision cones,
// guards, the courier, documents, the exit and the floating HUD hints.
// It never changes the state; it only reads it.

import { TILE, COLS, ROWS, VIEW_W, VIEW_H, CONE_RANGE, CONE_HALF_ANGLE, COLORS } from './config.js';
import { lightFactorAt, detectionLevel } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_OVER = 'over';

function drawCone(ctx, guard, alert) {
  const a0 = guard.facing - CONE_HALF_ANGLE;
  const a1 = guard.facing + CONE_HALF_ANGLE;
  const gradient = ctx.createRadialGradient(guard.x, guard.y, 10, guard.x, guard.y, CONE_RANGE);
  gradient.addColorStop(0, alert ? 'rgba(255, 70, 60, 0.42)' : 'rgba(255, 214, 90, 0.34)');
  gradient.addColorStop(1, alert ? 'rgba(255, 70, 60, 0.05)' : 'rgba(255, 214, 90, 0.04)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.arc(guard.x, guard.y, CONE_RANGE, a0, a1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = alert ? 'rgba(255, 90, 70, 0.55)' : 'rgba(255, 214, 90, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(a0) * CONE_RANGE, guard.y + Math.sin(a0) * CONE_RANGE);
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(a1) * CONE_RANGE, guard.y + Math.sin(a1) * CONE_RANGE);
  ctx.stroke();
}

function drawGuard(ctx, guard, time) {
  const alert = guard.state === 'chase';
  drawCone(ctx, guard, alert);
  // Footstep rings: the nearer a guard, the louder its steps read.
  const pulse = (time * 1.4 + guard.x * 0.01) % 1;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * (1 - pulse)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(guard.x, guard.y, 18 + pulse * 26, 0, Math.PI * 2);
  ctx.stroke();
  // Body: red coat, dark visor, facing tick.
  ctx.fillStyle = '#7e2a2a';
  ctx.beginPath();
  ctx.arc(guard.x, guard.y, guard.radius + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.guard;
  ctx.beginPath();
  ctx.arc(guard.x, guard.y, guard.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b0f0f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(guard.x, guard.y, guard.radius - 4, guard.facing - 0.9, guard.facing + 0.9);
  ctx.stroke();
  ctx.strokeStyle = '#ffd65a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(guard.facing) * (guard.radius + 8), guard.y + Math.sin(guard.facing) * (guard.radius + 8));
  ctx.stroke();
  // Suspicion arc above the guard.
  if (guard.suspicion > 2) {
    const frac = guard.suspicion / 100;
    ctx.strokeStyle = frac > 0.66 ? '#ff5040' : frac > 0.33 ? '#ffb02e' : '#ffd65a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, guard.radius + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  if (alert) {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', guard.x, guard.y - guard.radius - 12);
  }
}

function drawPlayer(ctx, player, tiles) {
  const lit = lightFactorAt(tiles, player.x, player.y);
  // A soft glow marks the courier; brighter in lamplight, dim in shadow.
  const glow = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, 34);
  glow.addColorStop(0, lit > 1 ? 'rgba(232, 182, 76, 0.30)' : 'rgba(120, 160, 255, 0.16)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 34, 0, Math.PI * 2);
  ctx.fill();
  // Cloak: a hooded triangle pointing where the courier faces.
  const a = player.facing;
  ctx.fillStyle = COLORS.playerCloak;
  ctx.beginPath();
  ctx.moveTo(player.x + Math.cos(a) * 16, player.y + Math.sin(a) * 16);
  ctx.lineTo(player.x + Math.cos(a + 2.5) * 13, player.y + Math.sin(a + 2.5) * 13);
  ctx.lineTo(player.x + Math.cos(a - 2.5) * 13, player.y + Math.sin(a - 2.5) * 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d2b3a';
  ctx.beginPath();
  ctx.arc(player.x + Math.cos(a) * 4, player.y + Math.sin(a) * 4, 5, 0, Math.PI * 2);
  ctx.fill();
  if (player.sneaking) {
    ctx.strokeStyle = 'rgba(127, 224, 168, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDocuments(ctx, state, time) {
  for (const doc of state.documents) {
    if (doc.taken) continue;
    const bob = Math.sin(time * 3 + doc.x * 0.01) * 2;
    const glow = ctx.createRadialGradient(doc.x, doc.y + bob, 2, doc.x, doc.y + bob, 26);
    glow.addColorStop(0, 'rgba(127, 224, 168, 0.45)');
    glow.addColorStop(1, 'rgba(127, 224, 168, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(doc.x, doc.y + bob, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(doc.x, doc.y + bob);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#f4f1e4';
    ctx.fillRect(-7, -9, 14, 18);
    ctx.strokeStyle = '#7fe0a8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -9, 14, 18);
    ctx.strokeStyle = '#5a6b7a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.moveTo(-4, 4);
    ctx.lineTo(1, 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawExit(ctx, state, time) {
  const ex = state.exit;
  const open = state.documentsTaken === state.documents.length;
  const pulse = open ? 0.6 + Math.sin(time * 4) * 0.25 : 0.25;
  ctx.fillStyle = `rgba(57, 211, 83, ${pulse * 0.5})`;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = open ? COLORS.exit : '#3a5a40';
  ctx.fillRect(ex.x - 14, ex.y - 16, 28, 32);
  ctx.strokeStyle = open ? '#b8ffce' : '#6b8a72';
  ctx.lineWidth = 2;
  ctx.strokeRect(ex.x - 14, ex.y - 16, 28, 32);
  ctx.fillStyle = open ? '#0d2b14' : '#223626';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(open ? 'EXIT' : 'LOCK', ex.x, ex.y + 4);
  if (open) {
    ctx.fillStyle = '#b8ffce';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('▼ GO!', ex.x, ex.y - 24);
  }
}

/** Paint the whole world for one frame. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  function drawFloor(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const kind = state.tiles[row][col];
        const x = col * TILE;
        const y = row * TILE;
        if (kind === 'wall') {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = COLORS.wallTop;
          ctx.fillRect(x, y, TILE, 4);
          continue;
        }
        ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        if (kind === 'shadow') ctx.fillStyle = COLORS.shadowFloor;
        if (kind === 'lit') ctx.fillStyle = COLORS.litFloor;
        ctx.fillRect(x, y, TILE, TILE);
        if (kind === 'lit') {
          const g = ctx.createRadialGradient(x + 20, y + 20, 2, x + 20, y + 20, 30);
          g.addColorStop(0, 'rgba(255, 214, 120, 0.20)');
          g.addColorStop(1, 'rgba(255, 214, 120, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, TILE, TILE);
        }
        if (kind === 'shadow') {
          ctx.fillStyle = 'rgba(90, 130, 200, 0.10)';
          ctx.fillRect(x, y, TILE, TILE);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
    // Cover: crates and shelves read as solid blocks with a lit top edge.
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const kind = state.tiles[row][col];
        if (kind !== 'crate' && kind !== 'shelf') continue;
        const x = col * TILE;
        const y = row * TILE;
        const base = kind === 'crate' ? COLORS.crate : COLORS.shelf;
        const top = kind === 'crate' ? COLORS.crateTop : COLORS.shelfTop;
        ctx.fillStyle = base;
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = top;
        ctx.fillRect(x + 3, y + 3, TILE - 6, 6);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.moveTo(x + 3, y + TILE - 3);
        ctx.lineTo(x + TILE - 3, y + 3);
        ctx.stroke();
      }
    }
  }

  function draw(state, screen, time) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawFloor(state);
    // Noise rings: running feet and landing pebbles, visible to the player.
    if (state.noise) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.noise.x, state.noise.y, state.noise.radius * (1 - state.noise.ttl), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.pebble) {
      ctx.fillStyle = '#cfd6de';
      ctx.beginPath();
      ctx.arc(state.pebble.x, state.pebble.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawExit(ctx, state, time);
    drawDocuments(ctx, state, time);
    for (const guard of state.guards) drawGuard(ctx, guard, time);
    drawPlayer(ctx, state.player, state.tiles);
    // A red wash creeps in as the detection meter fills.
    const level = detectionLevel(state);
    if (level > 1) {
      ctx.fillStyle = `rgba(255, 40, 30, ${(level / 100) * 0.10})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(6, 10, 16, 0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  return { draw };
}

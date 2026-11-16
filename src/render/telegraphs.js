/**
 * Visual wind-ups (P1.G6) for every boss attack and "dangerous" enemy attack
 * (dash charger, turret shot, hop leap): a growing/fading warning ring, plus
 * a line/area preview for attacks with a clear shape, so the threat can be
 * read and dodged *during* the wind-up rather than only once it lands.
 */
import { getBossPattern } from '../systems/ai/bossPatterns.js';
import { CONFIG } from '../core/config.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function drawWarningRing(ctx, x, y, baseRadius, progress, color) {
  ctx.globalAlpha = 0.25 + 0.55 * (1 - progress);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 + progress * 2;
  ctx.beginPath();
  ctx.arc(x, y, baseRadius * (1 + progress * 0.6), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawLinePreview(ctx, fromX, fromY, dirX, dirY, length, width, progress) {
  ctx.globalAlpha = 0.2 + 0.5 * progress;
  ctx.strokeStyle = '#ff5050';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX + dirX * length, fromY + dirY * length);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawAreaPreview(ctx, x, y, radius, progress) {
  ctx.globalAlpha = 0.15 + 0.25 * progress;
  ctx.fillStyle = '#ff5050';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A non-boss enemy's attack wind-up (dash charger, turret, hop leap), if it's currently telegraphing one. */
export function drawEnemyTelegraph(ctx, enemy, screen, zoom) {
  const r = (enemy.radius ?? 14) * zoom;

  if (enemy.windingUp) {
    const progress = clamp01(1 - (enemy.windUpTimer ?? 0) / CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS);
    drawWarningRing(ctx, screen.x, screen.y, r, progress, '#ffd050');
    if (enemy.dashDir) drawLinePreview(ctx, screen.x, screen.y, enemy.dashDir.x, enemy.dashDir.y, 320 * zoom, 3 * zoom, progress);
    return;
  }

  if (enemy.fireCooldownSeconds != null && enemy.fireCooldown != null && enemy.fireCooldown <= CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS) {
    drawWarningRing(ctx, screen.x, screen.y, r, clamp01(1 - enemy.fireCooldown / CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS), '#ffd050');
    return;
  }

  if (enemy.hopPhase === 'idle' && enemy.aiTimer != null && enemy.aiTimer <= CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS) {
    drawWarningRing(ctx, screen.x, screen.y, r, clamp01(1 - enemy.aiTimer / CONFIG.ENEMY_ATTACK_TELEGRAPH_SECONDS), '#ffd050');
  }
}

/** A boss's attack wind-up: a generic ring always, plus a line/area preview for charge/laser/slam. */
export function drawBossTelegraph(ctx, boss, player, screen, zoom) {
  if (boss.patternState !== 'telegraph' || !boss.currentPatternId) return;
  const pattern = getBossPattern(boss.currentPatternId);
  if (!pattern) return;
  const progress = clamp01(1 - (boss.patternTimer ?? 0) / pattern.telegraphSeconds);
  const r = (boss.radius ?? 28) * zoom;

  drawWarningRing(ctx, screen.x, screen.y, r, progress, '#ff5050');

  if (boss.currentPatternId === 'charge' && player) {
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const len = Math.hypot(dx, dy) || 1;
    drawLinePreview(ctx, screen.x, screen.y, dx / len, dy / len, len * zoom, 6 * zoom, progress);
  } else if (boss.currentPatternId === 'telegraphedLaser' && boss._laserDir) {
    drawLinePreview(ctx, screen.x, screen.y, boss._laserDir.x, boss._laserDir.y, 600 * zoom, (CONFIG.BOSS_LASER_WIDTH_PX ?? 30) * zoom, progress);
  } else if (boss.currentPatternId === 'slam') {
    drawAreaPreview(ctx, screen.x, screen.y, (CONFIG.BOSS_SLAM_RADIUS ?? 110) * zoom, progress);
  }
}

/**
 * Shared one-shot effect vocabulary for cards and pills (CLAUDE.md §3): both
 * are "consumable slot" content that fire a list of {type, ...} actions when
 * used, so they share one dispatcher instead of each carrying its own copy.
 */
import { circlesOverlap } from '../engine/collision.js';
import { heal, addSoulHeart, addBlackHeart, removeRedContainer } from './health.js';
import { applyStatEffects } from './statEffects.js';
import { applyEnemyDamage } from './enemies.js';

/** Mod API hook (CLAUDE.md §4 `registerEffectAction`): adds a new effect `type` custom cards/pills/actives can use. `fn(effect, ctx)`, same ctx shape as every built-in case below. Checked only when `effect.type` matches none of the built-ins. */
const EFFECT_ACTIONS = new Map();
export function registerEffectAction(type, fn) {
  EFFECT_ACTIONS.set(type, fn);
}

/** ctx: { world, player, playerHealth, stats, events, rng, floor, floorRuntime, currency }. */
export function applyEffect(effect, ctx) {
  const { world, player, playerHealth, stats, events, rng, floor, floorRuntime, currency } = ctx;
  switch (effect.type) {
    case 'heal':
      heal(playerHealth, effect.value ?? 2);
      break;
    case 'healFull':
      heal(playerHealth, playerHealth.redMax - playerHealth.red);
      break;
    case 'damage':
      playerHealth.red = Math.max(0, playerHealth.red - (effect.value ?? 2));
      break;
    case 'soulHeart':
      addSoulHeart(playerHealth, effect.value ?? 2);
      break;
    case 'blackHeart':
      addBlackHeart(playerHealth, effect.value ?? 2);
      break;
    case 'statPermanent':
      applyStatEffects(stats, [{ stat: effect.stat, value: effect.value }], 1);
      break;
    case 'statTemporary':
      player.tempStatBoosts = player.tempStatBoosts ?? [];
      player.tempStatBoosts.push({ stat: effect.stat, value: effect.value, timer: effect.duration ?? 8 });
      applyStatEffects(stats, [{ stat: effect.stat, value: effect.value }], 1);
      break;
    case 'coins':
      if (currency) currency.coins = Math.max(0, currency.coins + effect.value);
      break;
    case 'bombs':
      if (currency) currency.bombs = Math.max(0, currency.bombs + effect.value);
      break;
    case 'keys':
      if (currency) currency.keys = Math.max(0, currency.keys + effect.value);
      break;
    case 'mapReveal':
      if (floor && floorRuntime) for (const key of floor.cells.keys()) floorRuntime.visited.add(key);
      break;
    case 'teleport': {
      const tx = rng.int(2, world.tileGrid.width - 3);
      const ty = rng.int(2, world.tileGrid.height - 3);
      const center = world.tileGrid.tileCenter(tx, ty);
      player.x = center.x;
      player.y = center.y;
      break;
    }
    case 'nova': {
      const radius = effect.radius ?? 120;
      const damage = effect.damage ?? 20;
      for (const enemy of world.entities.byType('enemy')) {
        if (!enemy.alive) continue;
        if (!circlesOverlap(player.x, player.y, radius, enemy.x, enemy.y, enemy.radius)) continue;
        applyEnemyDamage(world, enemy, damage, { player, playerHealth, events, rng });
      }
      break;
    }
    case 'devilTrade':
      removeRedContainer(playerHealth, effect.heartsCost ?? 2);
      applyStatEffects(stats, [{ stat: effect.stat, value: effect.value }], 1);
      break;
    default:
      break;
  }
}

/** Applies every effect in `effects`, in order. */
export function applyEffects(effects, ctx) {
  for (const effect of effects ?? []) applyEffect(effect, ctx);
}

/** Decays statTemporary boosts and reverses them on expiry. Call once per tick. */
export function updateTempStatBoosts(player, dt) {
  if (!player.tempStatBoosts || player.tempStatBoosts.length === 0) return;
  const stillActive = [];
  for (const boost of player.tempStatBoosts) {
    boost.timer -= dt;
    if (boost.timer <= 0) {
      applyStatEffects(player.stats, [{ stat: boost.stat, value: boost.value }], -1);
    } else {
      stillActive.push(boost);
    }
  }
  player.tempStatBoosts = stillActive;
}

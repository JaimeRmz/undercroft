import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { createPlayer } from '../src/systems/player.js';
import { Stats } from '../src/systems/stats.js';
import { Health } from '../src/systems/health.js';
import { createEventBus } from '../src/core/events.js';
import { useCard } from '../src/systems/cards.js';

test('useCard applies every listed effect and emits card:used', () => {
  const world = new World({ widthTiles: 20, heightTiles: 20, tileSize: 40 });
  const player = createPlayer(world, { x: 100, y: 100, stats: new Stats() });
  const playerHealth = new Health({ redMax: 6 });
  playerHealth.red = 2;
  const events = createEventBus();
  let payload;
  events.on('card:used', (p) => (payload = p));

  const def = {
    id: 'core:card-01',
    name: 'Rune of Mending',
    effects: [{ type: 'healFull' }, { type: 'statPermanent', stat: 'luck', value: 1 }],
  };
  useCard(def, { playerHealth, stats: player.stats, events });

  assert.equal(playerHealth.red, playerHealth.redMax);
  assert.equal(player.stats.luck, 1);
  assert.equal(payload.name, 'Rune of Mending');
});

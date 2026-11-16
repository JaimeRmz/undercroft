import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, TileGrid, resolveCircleVsTileGrid } from '../src/engine/world.js';

test('TileGrid treats out-of-bounds as solid so entities cannot leave the room', () => {
  const grid = new TileGrid(13, 7, 40);
  assert.ok(grid.isSolid(-1, 0));
  assert.ok(grid.isSolid(13, 0));
  assert.ok(!grid.isSolid(0, 0)); // default open
});

test('setSolid/isSolid round-trip within bounds', () => {
  const grid = new TileGrid(13, 7, 40);
  grid.setSolid(3, 3, true);
  assert.ok(grid.isSolid(3, 3));
  grid.setSolid(3, 3, false);
  assert.ok(!grid.isSolid(3, 3));
});

test('solid and blocksProjectile are independent bitsets (a pit can block one but not the other)', () => {
  const grid = new TileGrid(13, 7, 40);
  grid.setSolid(3, 3, true); // pit: blocks ground movement...
  assert.ok(grid.isSolid(3, 3));
  assert.ok(!grid.isBlockingProjectile(3, 3), '...but not projectiles, by default');
  grid.setBlocksProjectile(3, 3, true); // rock/wall: blocks both
  assert.ok(grid.isBlockingProjectile(3, 3));
  assert.ok(grid.isSolid(3, 3));
});

test('TileGrid treats out-of-bounds as blocking projectiles too', () => {
  const grid = new TileGrid(13, 7, 40);
  assert.ok(grid.isBlockingProjectile(-1, 0));
  assert.ok(grid.isBlockingProjectile(13, 0));
  assert.ok(!grid.isBlockingProjectile(0, 0));
});

test('resolveCircleVsTileGrid pushes a circle out of a single solid tile', () => {
  const grid = new TileGrid(13, 7, 40);
  grid.setSolid(1, 0, true); // tile spans x:[40,80), y:[0,40)
  // circle overlapping the left edge of that tile
  const result = resolveCircleVsTileGrid(grid, 45, 20, 10);
  assert.ok(result.x < 45); // pushed left, out of the solid tile
});

test('resolveCircleVsTileGrid leaves a circle alone when no nearby tile is solid', () => {
  const grid = new TileGrid(13, 7, 40);
  const result = resolveCircleVsTileGrid(grid, 100, 100, 10);
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

test('World.spawn adds an entity and resolveTileCollision keeps it off solid tiles', () => {
  const world = new World({ widthTiles: 13, heightTiles: 7, tileSize: 40 });
  world.tileGrid.setSolid(0, 0, true); // left wall-ish tile, x:[0,40) y:[0,40)
  const entity = world.spawn('enemy', { x: 35, y: 20, radius: 10 });
  world.resolveTileCollision(entity);
  assert.ok(entity.x >= 40); // pushed out of the solid tile to the right
});

test('World.queryNearby uses the spatial hash after rebuild', () => {
  const world = new World();
  const entity = world.spawn('enemy', { x: 50, y: 50, radius: 8 });
  world.rebuildSpatialHash();
  const found = world.queryNearby(50, 50, 10);
  assert.ok(found.includes(entity));
});

test('World.reap removes dead entities from the entity manager', () => {
  const world = new World();
  const entity = world.spawn('projectile', {});
  entity.destroy();
  world.reap();
  assert.equal(world.entities.get(entity.id), undefined);
});

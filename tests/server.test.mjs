import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeResolve, hashModsDir, listModManifests } from '../server.js';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('safeResolve allows paths inside root', () => {
  const resolved = safeResolve(ROOT, '/index.html');
  assert.equal(resolved, path.join(ROOT, 'index.html'));
});

test('safeResolve blocks path traversal', () => {
  assert.equal(safeResolve(ROOT, '/../../etc/passwd'), null);
  assert.equal(safeResolve(ROOT, '/..%2F..%2Fetc%2Fpasswd'), null);
});

test('listModManifests returns an entry per mod directory', async () => {
  const manifests = await listModManifests();
  const dirs = manifests.map((m) => m._dir);
  assert.ok(dirs.includes('core'));
  assert.ok(dirs.includes('example-mod'));
});

test('hashModsDir returns a stable string hash with no args', async () => {
  const hash = await hashModsDir();
  assert.equal(typeof hash, 'string');
});

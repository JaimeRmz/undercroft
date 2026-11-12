/**
 * Node fs-backed mod source — used by tests and tools/*.mjs (headless). Kept in
 * its own module (separate from source-http.js) so main.js, which only needs
 * the http source, never pulls in `node:fs`/`node:path` — the browser can't
 * resolve those imports even if the code path is unused.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function createFsSource(modsRootDir) {
  return {
    async listMods() {
      let entries;
      try {
        entries = await fsp.readdir(modsRootDir, { withFileTypes: true });
      } catch {
        return [];
      }
      const manifests = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(modsRootDir, entry.name, 'mod.json');
        try {
          const raw = await fsp.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw);
          manifest._dir = entry.name;
          manifests.push(manifest);
        } catch (err) {
          manifests.push({ _dir: entry.name, _error: `mod.json missing or invalid: ${err.message}` });
        }
      }
      return manifests;
    },

    async listFiles(modDir, folder) {
      const dirPath = path.join(modsRootDir, modDir, folder);
      let entries;
      try {
        entries = await fsp.readdir(dirPath, { withFileTypes: true });
      } catch {
        return [];
      }
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    },

    async readFile(modDir, relPath) {
      return fsp.readFile(path.join(modsRootDir, modDir, relPath), 'utf-8');
    },

    /** Cache-busted dynamic import, so hot reload (console `reload`) picks up edited scripts. */
    async importScript(modDir, relPath) {
      const full = path.join(modsRootDir, modDir, relPath);
      const url = `${pathToFileURL(full).href}?t=${Date.now()}`;
      return import(url);
    },
  };
}

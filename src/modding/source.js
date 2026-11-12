/**
 * Mod data sources. The loader is written once against this interface and
 * runs identically in Node (fs source — used by tests, tools/simulate.mjs,
 * tools/smoke.mjs) and in the browser (http source — talks to server.js).
 *
 * Interface: listMods(), listFiles(modDir, folder), readFile(modDir, relPath),
 * importScript(modDir, relPath).
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

export function createHttpSource(baseUrl = '') {
  return {
    async listMods() {
      const res = await fetch(`${baseUrl}/api/mods`);
      const data = await res.json();
      return data.mods;
    },

    async listFiles(modDir, folder) {
      const res = await fetch(`${baseUrl}/api/mods/${encodeURIComponent(modDir)}/list?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      return data.files;
    },

    async readFile(modDir, relPath) {
      const res = await fetch(`${baseUrl}/mods/${modDir}/${relPath}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },

    async importScript(modDir, relPath) {
      return import(`${baseUrl}/mods/${modDir}/${relPath}?t=${Date.now()}`);
    },
  };
}

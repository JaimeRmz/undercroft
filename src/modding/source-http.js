/** Browser-backed mod source — talks to server.js over fetch(). No Node built-ins, safe for main.js. */
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

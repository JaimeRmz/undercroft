/** Small leveled logger. Avoids bare console.* calls scattered through systems. */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(name, level = 'info') {
  let currentLevel = LEVELS[level] ?? LEVELS.info;

  function write(lvl, args) {
    if (LEVELS[lvl] < currentLevel) return;
    const fn = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log;
    fn(`[${name}]`, ...args);
  }

  return {
    setLevel(lvl) {
      if (lvl in LEVELS) currentLevel = LEVELS[lvl];
    },
    getLevel() {
      return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel);
    },
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}

export const log = createLogger('undercroft');

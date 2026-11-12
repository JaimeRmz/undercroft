/**
 * Mod scripting API surface passed to each mod script's `export default function(api) {...}`.
 * This is v1 (registration + events only); P3.1 extends it with registerTearModifier,
 * registerAIBehavior, registerBossPattern, registerWeapon, registerConsoleCommand, etc.
 */
export function createModApi({ events, registries, log }) {
  return {
    events,
    registries,
    log,
    registerContent(kind, def) {
      registries.of(kind).register(def.id, def);
    },
  };
}

// Demonstrates a scripted mod item. Full scripting API (synergies, AI, bosses, console commands)
// lands in P3.1/P3.2 — this just proves default-export-function scripts load and can register content.
export default function (api) {
  api.registerContent('item', {
    id: 'example-mod:scripted-trinket',
    name: 'Example Scripted Trinket',
    type: 'active',
    description: 'Registered from script.js rather than a JSON file.',
  });
  api.log.info('example-mod script loaded');
}

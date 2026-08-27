// Assembles the static web build into web/dist. Copy only: the renderer
// is already browser code. Run: npm run web:build
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'web/dist');

mkdirSync(DIST, { recursive: true });
const copies = [
  ['web/index.html', 'index.html'],
  ['web/app.js', 'app.js'],
  ['web/fling.js', 'fling.js'],
  ['web/lines.json', 'lines.json'],
  ['web/lines', 'lines'],
  ['lib/pitchcore.js', 'lib/pitchcore.js'],
  ['lib/crunchcore.js', 'lib/crunchcore.js'],
  ['lib/skinphys.js', 'lib/skinphys.js'],
  ['renderer/goblin.js', 'renderer/goblin.js'],
  ['renderer/voicefx.js', 'renderer/voicefx.js'],
  ['assets/grunts', 'assets/grunts'],
];
for (const [from, to] of copies) {
  cpSync(path.join(ROOT, from), path.join(DIST, to), { recursive: true });
}
console.log(`built web/dist (${copies.length} entries)`);

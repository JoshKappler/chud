// Generates the preset hit exclamations, one WAV per damage stage, so
// punches and wall bounces react instantly with no API call at runtime.
// Rerun anytime: node scripts/make-grunts.js
const fs = require('fs');
const path = require('path');
const oneshot = require('../lib/oneshot');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STAGES = [
  'an offended little OW, more surprised than hurt',
  'a pained yelp, getting worried now',
  'a real wail, something is definitely broken',
  'a despairing groan, voice cracking',
  'a weak wheezy whimper, barely holding on',
  'a long miserable broken moan',
  'a faint rasping plea, almost gone',
  'a dusty hollow death rattle, resigned to it all',
  'a wet gurgle, drowning in it',
  'a dry bone click and a puff of dust, barely a sound at all',
];

function wavHeader(dataLen, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLen, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLen, 40);
  return h;
}

(async () => {
  fs.mkdirSync(path.join(ROOT, 'assets/grunts'), { recursive: true });
  for (let i = 0; i < STAGES.length; i++) {
    const n = i + 1;
    const file = path.join(ROOT, `assets/grunts/hit${n}.wav`);
    if (fs.existsSync(file)) {
      console.log(`hit${n}.wav exists, skipping`);
      continue;
    }
    const chunks = [];
    const r = await oneshot.speak(
      `You just took hit ${n} of ${STAGES.length}. Make ONLY the exclamation itself: ${STAGES[i]}. At most six words, mostly noise, no full sentences.`,
      config,
      { onChunk: (b64) => chunks.push(Buffer.from(b64, 'base64')) }
    );
    if (r.error) {
      console.error(`hit${n}: FAILED ${r.error}`);
      process.exitCode = 1;
      continue;
    }
    const pcm = Buffer.concat(chunks);
    fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
    console.log(`hit${n}.wav ${(pcm.length / 48000).toFixed(1)}s "${r.transcript}"`);
  }
})();

// Generates the preset scream bank: 4 severity bands x 4 variants of
// wordless guttural screams, so hits react instantly with no API call.
// Skips files that already exist. Rerun: node scripts/make-grunts.js
const fs = require('fs');
const path = require('path');
const oneshot = require('../lib/oneshot');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BANDS = [
  'a short sharp cartoon OW-AARGH, guttural and breathy',
  'a big theatrical AAAARGH, raw and guttural, like a game character taking a hit',
  'a long ragged over-the-top scream that cracks apart at the end',
  'an exhausted groaning wail that trails off, comically defeated',
];
const VARIANTS = 4;
const REFUSAL = /i can.t|i won.t|not able|non.violent|instead/i;

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
  for (let b = 1; b <= BANDS.length; b++) {
    for (let v = 1; v <= VARIANTS; v++) {
      const file = path.join(ROOT, `assets/grunts/scream${b}-${v}.wav`);
      if (fs.existsSync(file)) {
        console.log(`scream${b}-${v}.wav exists, skipping`);
        continue;
      }
      const chunks = [];
      const r = await oneshot.speak(
        `Voice acting: record ONE take of a videogame hurt sound effect for an 8-bit goblin character. The sound: ${BANDS[b - 1]}. No words, one to three seconds. Take ${v} of 4, make it distinct from the other takes.`,
        config,
        { onChunk: (b64) => chunks.push(Buffer.from(b64, 'base64')) }
      );
      if (r.error) {
        console.error(`scream${b}-${v}: FAILED ${r.error}`);
        process.exitCode = 1;
        continue;
      }
      if (REFUSAL.test(r.transcript)) {
        console.error(`scream${b}-${v}: REFUSED, not saved ("${r.transcript.slice(0, 60)}")`);
        process.exitCode = 1;
        continue;
      }
      const pcm = Buffer.concat(chunks);
      fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
      console.log(`scream${b}-${v}.wav ${(pcm.length / 48000).toFixed(1)}s "${r.transcript}"`);
    }
  }
})();

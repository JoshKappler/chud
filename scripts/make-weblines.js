// Renders the web build's canned reply bank from web/lines.json, one raw
// 24kHz WAV per line. No voice fx baked in: the browser chain goblinizes
// at playback, same as live desktop audio. Skips files that already
// exist. Rerun: node scripts/make-weblines.js
const fs = require('fs');
const path = require('path');
const oneshot = require('../lib/oneshot');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const REFUSAL = /i can.t say|i won.t|not able|as written|rephrase|instead/i;

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
  const linesPath = path.join(ROOT, 'web/lines.json');
  const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8'));
  fs.mkdirSync(path.join(ROOT, 'web/lines'), { recursive: true });
  let changed = false;
  for (const line of lines) {
    const file = path.join(ROOT, 'web/lines', line.file);
    if (fs.existsSync(file)) {
      console.log(`${line.file} exists, skipping`);
      continue;
    }
    const chunks = [];
    const r = await oneshot.speak(
      `Voice acting for a videogame goblin character, staying fully in character: say exactly this scripted line, word for word, nothing added before or after: "${line.text}"`,
      config,
      { onChunk: (b64) => chunks.push(Buffer.from(b64, 'base64')) }
    );
    if (r.error) {
      console.error(`${line.file}: FAILED ${r.error}`);
      process.exitCode = 1;
      continue;
    }
    if (REFUSAL.test(r.transcript)) {
      console.error(`${line.file}: REFUSED, not saved ("${r.transcript.slice(0, 60)}")`);
      process.exitCode = 1;
      continue;
    }
    const pcm = Buffer.concat(chunks);
    fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
    // The subtitle must match the take, so the transcript wins over the
    // script whenever the model strays. Wrapping quotes are transcription
    // artifacts, not speech.
    const spoken = r.transcript.replace(/^["']+|["']+$/g, '');
    if (spoken && spoken !== line.text) {
      line.text = spoken;
      changed = true;
    }
    console.log(`${line.file} ${(pcm.length / 48000).toFixed(1)}s "${r.transcript}"`);
  }
  if (changed) fs.writeFileSync(linesPath, JSON.stringify(lines, null, 2) + '\n');
})();

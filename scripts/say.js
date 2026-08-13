// Voice test harness: one spoken response through the speakers, no mic and
// no window. Usage: npm run say [-- "what to do"]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const oneshot = require('../lib/oneshot');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ask = process.argv[2] || 'Say: Hello, Joshua! Then cackle like a gleeful goblin, long and loud, with a snort at the end.';
const outFile = '/tmp/chud-say.wav';

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

const chunks = [];
oneshot.speak(ask, config, { onChunk: (b64) => chunks.push(Buffer.from(b64, 'base64')) }).then((r) => {
  if (r.error) {
    console.error('failed:', r.error);
    process.exit(2);
  }
  const pcm = Buffer.concat(chunks);
  fs.writeFileSync(outFile, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
  console.log(`voice: ${config.voice}  model: ${config.model}`);
  console.log(`transcript: ${r.transcript}`);
  console.log(`audio: ${(pcm.length / 48000).toFixed(1)}s -> ${outFile}, playing...`);
  try { execFileSync('afplay', [outFile]); } catch (e) { console.error('afplay failed:', e.message); }
  process.exit(pcm.length > 0 ? 0 : 3);
});

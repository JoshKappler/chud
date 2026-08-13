// Renders five crunch variants into one WAV and plays it, so the foley
// can be judged without punching the goblin. Usage: node scripts/crunch-preview.js
const fs = require('fs');
const { execFileSync } = require('child_process');
const { renderCrunch } = require('../lib/crunchcore');

const SR = 24000;
const GAP = Math.floor(SR * 0.35);
const parts = [];
for (let v = 0; v < 5; v++) {
  const s = renderCrunch(SR);
  for (const smp of s) if (Number.isNaN(smp) || Math.abs(smp) > 1) throw new Error('bad sample');
  parts.push(s, new Float32Array(GAP));
  console.log(`variant ${v + 1}: ${(s.length / SR).toFixed(2)}s`);
}
const total = parts.reduce((a, p) => a + p.length, 0);
const pcm = Buffer.alloc(total * 2);
let off = 0;
for (const p of parts) {
  for (let i = 0; i < p.length; i++) pcm.writeInt16LE(Math.round(p[i] * 32767), (off + i) * 2);
  off += p.length;
}
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write('WAVE', 8);
h.write('fmt ', 12);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write('data', 36);
h.writeUInt32LE(pcm.length, 40);
fs.writeFileSync('/tmp/chud-crunch.wav', Buffer.concat([h, pcm]));
console.log('playing 5 variants from /tmp/chud-crunch.wav');
execFileSync('afplay', ['/tmp/chud-crunch.wav']);

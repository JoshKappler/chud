// Voice test harness: opens a realtime session over WebSocket, asks for one
// spoken response, saves the audio to a WAV and plays it out loud.
// Usage: npm run say [-- "what to do"]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY missing');
  process.exit(1);
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

const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`;
const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
const chunks = [];
let transcript = '';

const bail = setTimeout(() => {
  console.error('timed out after 45s');
  ws.close();
  process.exit(2);
}, 45000);

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: config.instructions,
      output_modalities: ['audio'],
      audio: { output: { voice: config.voice, format: { type: 'audio/pcm', rate: 24000 } } },
    },
  }));
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: ask }] },
  }));
  ws.send(JSON.stringify({ type: 'response.create' }));
});

ws.on('message', (data) => {
  const ev = JSON.parse(data);
  if (ev.type === 'response.output_audio.delta' || ev.type === 'response.audio.delta') {
    chunks.push(Buffer.from(ev.delta, 'base64'));
  } else if (ev.type === 'response.output_audio_transcript.delta') {
    transcript += ev.delta;
  } else if (ev.type === 'error') {
    console.error('error event:', JSON.stringify(ev.error || ev).slice(0, 400));
  } else if (ev.type === 'response.done') {
    clearTimeout(bail);
    ws.close();
    const pcm = Buffer.concat(chunks);
    fs.writeFileSync(outFile, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
    const secs = (pcm.length / 48000).toFixed(1);
    console.log(`voice: ${config.voice}  model: ${config.model}`);
    console.log(`transcript: ${transcript.trim()}`);
    console.log(`audio: ${secs}s -> ${outFile}, playing...`);
    try { execFileSync('afplay', [outFile]); } catch (e) { console.error('afplay failed:', e.message); }
    process.exit(pcm.length > 0 ? 0 : 3);
  }
});

ws.on('error', (err) => {
  console.error('ws error:', err.message);
  process.exit(4);
});

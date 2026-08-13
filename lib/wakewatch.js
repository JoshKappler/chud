// Always-on wake phrase watcher: a Realtime transcription session (no LLM)
// over WebSocket. The renderer streams PCM16 24kHz chunks in via IPC; this
// watches transcripts for the wake phrase and fires the callback on match.
const WebSocket = require('ws');

const WS_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
const MAX_AGE_MS = 55 * 60 * 1000;

let ws = null;
let cfg = null;
let phrase = '';
let onDetect = () => {};
let enabled = false;
let backoffMs = 1000;
let openedAt = 0;
let refreshTimer = null;
let lastFire = 0;

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sessionConfig() {
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          noise_reduction: { type: 'near_field' },
          transcription: {
            model: cfg.wakeTranscribeModel,
            language: 'en',
            keywords: cfg.wakeKeywords,
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      },
    },
  };
}

// Keyword biasing is a hint, not a guarantee, so also accept a wake prefix
// followed by a near-homophone of the name (same trick as the local engine).
function matches(text) {
  if ((' ' + text + ' ').includes(' ' + phrase + ' ')) return true;
  const words = text.split(' ');
  for (let i = 1; i < words.length; i++) {
    if (cfg.wakePrefixes.includes(words[i - 1]) && cfg.wakeAliases.includes(words[i])) return true;
  }
  return false;
}

function checkTranscript(text) {
  if (!text || Date.now() - lastFire < 3000) return;
  if (matches(normalize(text))) {
    lastFire = Date.now();
    onDetect();
  }
}

function handle(msg) {
  if (msg.type === 'conversation.item.input_audio_transcription.delta') checkTranscript(msg.delta);
  else if (msg.type === 'conversation.item.input_audio_transcription.completed') checkTranscript(msg.transcript);
  else if (msg.type === 'error') console.error('wakewatch error:', JSON.stringify(msg).slice(0, 300));
}

function connect() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('wakewatch: OPENAI_API_KEY missing, watcher disabled');
    return;
  }
  ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${key}` } });
  ws.on('open', () => {
    openedAt = Date.now();
    backoffMs = 1000;
    ws.send(JSON.stringify(sessionConfig()));
  });
  ws.on('message', (data) => {
    try { handle(JSON.parse(data)); } catch (e) { /* ignore malformed */ }
  });
  ws.on('error', (err) => console.error('wakewatch ws:', err.message));
  ws.on('close', () => {
    ws = null;
    if (enabled) {
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  });
}

function start(config, cb) {
  if (enabled) return;
  cfg = config;
  phrase = normalize(config.wakePhrase);
  onDetect = cb;
  enabled = true;
  connect();
  refreshTimer = setInterval(() => {
    if (ws && Date.now() - openedAt > MAX_AGE_MS) {
      try { ws.close(); } catch (e) { /* reconnects via close handler */ }
    }
  }, 60 * 1000);
}

function append(buf) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: Buffer.from(buf).toString('base64') }));
}

function stop() {
  enabled = false;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  if (ws) { try { ws.close(); } catch (e) { /* already closing */ } }
  ws = null;
}

module.exports = { start, append, stop };

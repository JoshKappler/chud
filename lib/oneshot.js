// One-shot spoken response over WebSocket, no mic and no standing session.
// Streams audio chunks to a sink; used for punch reactions and voice tests.
const WebSocket = require('ws');

let busy = false;

function speak(prompt, config, sink) {
  if (busy) return Promise.resolve({ skipped: true });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve({ error: 'OPENAI_API_KEY missing' });
  busy = true;

  return new Promise((resolve) => {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${key}` } });
    let transcript = '';
    const done = (r) => {
      busy = false;
      clearTimeout(bail);
      try { ws.close(); } catch (e) { /* already closed */ }
      resolve({ ...r, transcript: transcript.trim() });
    };
    const bail = setTimeout(() => done({ error: 'timeout' }), 30000);

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
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] },
      }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    });
    ws.on('message', (data) => {
      let ev;
      try { ev = JSON.parse(data); } catch (e) { return; }
      if (ev.type === 'response.output_audio.delta' || ev.type === 'response.audio.delta') {
        if (sink.onChunk) sink.onChunk(ev.delta);
      } else if (ev.type === 'response.output_audio_transcript.delta') {
        transcript += ev.delta;
      } else if (ev.type === 'response.done') {
        done({ ok: true });
      } else if (ev.type === 'error') {
        console.error('oneshot error:', JSON.stringify(ev.error || ev).slice(0, 300));
      }
    });
    ws.on('error', (err) => done({ error: err.message }));
  });
}

module.exports = { speak };

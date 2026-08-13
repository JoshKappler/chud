// One-shot spoken response over WebSocket, no mic and no standing session.
// Streams audio chunks to a sink; used for voice tests and grunt assets.
// Instructions ride in the minted client secret: baking them in at session
// creation is the only path where the persona reliably sticks.
const WebSocket = require('ws');
const session = require('./session');

let busy = false;

async function speak(prompt, config, sink) {
  if (busy) return { skipped: true };
  if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY missing' };
  busy = true;

  let clientSecret;
  try {
    ({ clientSecret } = await session.mint(config, []));
  } catch (err) {
    busy = false;
    return { error: err.message };
  }

  return new Promise((resolve) => {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime', {
      headers: { Authorization: `Bearer ${clientSecret}` },
    });
    let transcript = '';
    const done = (r) => {
      busy = false;
      clearTimeout(bail);
      try { ws.close(); } catch (e) { /* already closed */ }
      resolve({ ...r, transcript: transcript.trim() });
    };
    const bail = setTimeout(() => done({ error: 'timeout' }), 30000);

    ws.on('message', (data) => {
      let ev;
      try { ev = JSON.parse(data); } catch (e) { return; }
      if (ev.type === 'session.created') {
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] },
        }));
        ws.send(JSON.stringify({ type: 'response.create' }));
      } else if (ev.type === 'response.output_audio.delta' || ev.type === 'response.audio.delta') {
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

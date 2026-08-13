// WebRTC client for the OpenAI Realtime API. The main process mints an
// ephemeral secret; this file owns the peer connection, the event data
// channel, tool call round trips, and the output audio level for the mouth.
const RT = (() => {
  const audioEl = document.getElementById('voice');
  let pc = null;
  let dc = null;
  let connected = false;
  let connecting = false;
  let idleTimer = null;
  let cfg = null;
  let hooks = {};
  let analyser = null;
  let levelBuf = null;
  let outCtx = null;
  let outbox = [];
  let armClose = false;
  let goodbyeActive = false;

  function send(msg) {
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(msg));
    else outbox.push(msg);
  }

  function touch() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => disconnect('idle'), cfg.idleSeconds * 1000);
  }

  function hookAnalyser(remoteStream) {
    const ac = new AudioContext();
    outCtx = ac;
    const src = ac.createMediaStreamSource(remoteStream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    levelBuf = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    const loop = () => {
      if (!connected) return;
      analyser.getByteTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) {
        const v = (levelBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / levelBuf.length);
      if (hooks.onLevel) hooks.onLevel(rms);
      if (rms > 0.05) touch();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async function doTool(item) {
    if (item.name === 'end_session') {
      send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: item.call_id, output: '{"ok":true}' },
      });
      send({ type: 'response.create' });
      armClose = true;
      setTimeout(() => { if (connected) disconnect('bye'); }, 10000);
      return;
    }
    if (hooks.onToolStart) hooks.onToolStart(item.name);
    let result;
    try {
      const args = item.arguments ? JSON.parse(item.arguments) : {};
      result = await window.chud.tool(item.name, args);
    } catch (err) {
      result = { error: String(err.message || err) };
    }
    send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result) },
    });
    send({ type: 'response.create' });
    if (hooks.onToolEnd) hooks.onToolEnd(item.name, result);
  }

  function handle(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        if (hooks.onListening) hooks.onListening();
        touch();
        break;
      case 'response.created':
        if (armClose) goodbyeActive = true;
        if (hooks.onThinking) hooks.onThinking();
        touch();
        break;
      case 'response.done':
        if (goodbyeActive) {
          setTimeout(() => disconnect('bye'), 1500);
          break;
        }
        if (hooks.onResponseDone) hooks.onResponseDone();
        touch();
        break;
      case 'response.output_item.done':
        if (ev.item && ev.item.type === 'function_call') doTool(ev.item);
        break;
      case 'error':
        console.error('realtime error', ev);
        if (hooks.onError) hooks.onError(ev);
        break;
      default:
        break;
    }
  }

  async function connect(config, h) {
    if (connected || connecting) return;
    connecting = true;
    cfg = config;
    hooks = h || {};
    try {
      const { clientSecret } = await window.chud.mint();
      pc = new RTCPeerConnection();
      const mic = Wake.getStream();
      for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);
      pc.ontrack = (ev) => {
        audioEl.srcObject = ev.streams[0];
        hookAnalyser(ev.streams[0]);
      };
      dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        for (const msg of outbox.splice(0)) dc.send(JSON.stringify(msg));
      };
      dc.onmessage = (e) => {
        try { handle(JSON.parse(e.data)); } catch (err) { /* ignore malformed */ }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`sdp exchange failed: ${res.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      connected = true;
      connecting = false;
      touch();
      if (hooks.onConnect) hooks.onConnect();
    } catch (err) {
      connecting = false;
      disconnect('error');
      throw err;
    }
  }

  function disconnect(reason) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (dc) { try { dc.close(); } catch (e) {} dc = null; }
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (outCtx) { try { outCtx.close(); } catch (e) {} outCtx = null; }
    outbox = [];
    armClose = false;
    goodbyeActive = false;
    const was = connected;
    connected = false;
    if (was && hooks.onDisconnect) hooks.onDisconnect(reason);
  }

  function say(text) {
    send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
    });
    send({ type: 'response.create' });
    touch();
  }

  return {
    connect,
    disconnect,
    say,
    isConnected: () => connected,
    isConnecting: () => connecting,
  };
})();

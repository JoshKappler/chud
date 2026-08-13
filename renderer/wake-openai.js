// OpenAI wake engine. The renderer captures mic audio, downsamples to 24kHz
// PCM16, and ships chunks to the main process, which runs an always-on
// Realtime transcription session and signals when the wake phrase is heard.
// While paused or muted no audio leaves the machine at all.
const WakeOpenAI = (() => {
  let stream = null;
  let audioCtx = null;
  let node = null;
  let onWake = null;
  let muted = false;
  let paused = false;
  let lastFire = 0;

  function toPCM16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }

  async function init(cfg, cb) {
    onWake = cb;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    audioCtx = new AudioContext({ sampleRate: 24000 });
    const src = audioCtx.createMediaStreamSource(stream);
    node = audioCtx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (paused || muted) return;
      window.chud.wakeAudio(toPCM16(e.inputBuffer.getChannelData(0)));
    };
    src.connect(node);
    node.connect(audioCtx.destination);
    window.chud.onWakeDetected(() => {
      const now = Date.now();
      if (paused || muted || now - lastFire < 3000) return;
      lastFire = now;
      if (onWake) onWake();
    });
    window.chud.wakeStart();
  }

  return {
    init,
    getStream: () => stream,
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    setMuted: (v) => { muted = v; },
    isMuted: () => muted,
    isReady: () => !!stream,
  };
})();

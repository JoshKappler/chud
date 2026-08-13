// Local wake phrase detection with Vosk (WASM). Nothing leaves the machine
// until "hey chud" is heard. "chud" is not in the model vocabulary, so we
// match a prefix word followed by a configurable list of near-homophones.
const Wake = (() => {
  let stream = null;
  let recognizer = null;
  let audioCtx = null;
  let node = null;
  let aliases = [];
  let prefixes = [];
  let onWake = null;
  let muted = false;
  let paused = false;
  let lastFire = 0;
  let ready = false;

  function check(text) {
    if (!text || muted || paused) return;
    const now = Date.now();
    if (now - lastFire < 3000) return;
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      if (prefixes.includes(words[i - 1]) && aliases.includes(words[i])) {
        lastFire = now;
        if (onWake) onWake();
        return;
      }
    }
  }

  async function init(cfg, cb) {
    onWake = cb;
    aliases = cfg.wakeAliases.map((w) => w.toLowerCase());
    prefixes = cfg.wakePrefixes.map((w) => w.toLowerCase());
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const model = await Vosk.createModel('chud://app/models/model.tar.gz');
    audioCtx = new AudioContext();
    recognizer = new model.KaldiRecognizer(audioCtx.sampleRate);
    recognizer.on('partialresult', (m) => check(m.result.partial));
    recognizer.on('result', (m) => check(m.result.text));
    const src = audioCtx.createMediaStreamSource(stream);
    node = audioCtx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (paused || muted) return;
      try { recognizer.acceptWaveform(e.inputBuffer); } catch (err) { /* keep listening */ }
    };
    src.connect(node);
    node.connect(audioCtx.destination);
    ready = true;
  }

  return {
    init,
    getStream: () => stream,
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    setMuted: (v) => { muted = v; },
    isMuted: () => muted,
    isReady: () => ready,
  };
})();

// One output chain for everything chud says: live session audio, preset
// grunts, and any buffer playback all route through the goblinizer and a
// shared analyser that drives the mouth.
const VoiceFX = (() => {
  let ctx = null;
  let bus = null;
  let analyser = null;
  let streamSrc = null;
  let levelCb = null;

  function ensure(cfg) {
    if (ctx) return;
    const fx = cfg.voiceFx || { enabled: false };
    ctx = new AudioContext();
    bus = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    let tail = bus;
    if (fx.enabled) {
      const gob = PitchCore.createGoblinizer({ pitch: fx.pitch, gravel: fx.gravel });
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = (e) => gob.process(e.inputBuffer.getChannelData(0), e.outputBuffer.getChannelData(0));
      bus.connect(sp);
      tail = sp;
    }
    tail.connect(analyser);
    analyser.connect(ctx.destination);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      if (levelCb) levelCb(Math.sqrt(sum / buf.length));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function attachStream(stream) {
    detachStream();
    streamSrc = ctx.createMediaStreamSource(stream);
    streamSrc.connect(bus);
  }

  function detachStream() {
    if (streamSrc) {
      try { streamSrc.disconnect(); } catch (e) { /* already gone */ }
      streamSrc = null;
    }
  }

  let gruntSrc = null;
  let playSeq = 0;
  const bufCache = new Map();

  function loadBuffer(url) {
    if (!bufCache.has(url)) {
      const p = fetch(url)
        .then((res) => res.arrayBuffer())
        .then((raw) => ctx.decodeAudioData(raw));
      p.catch(() => bufCache.delete(url));
      bufCache.set(url, p);
    }
    return bufCache.get(url);
  }

  // A new call silences the current line at once and supersedes any older
  // call still decoding, so the freshest impact always wins.
  async function playUrl(url) {
    const seq = ++playSeq;
    if (gruntSrc) {
      try { gruntSrc.stop(); } catch (e) { /* already ended */ }
      gruntSrc = null;
    }
    const buf = await loadBuffer(url);
    if (seq !== playSeq) return;
    const src = ctx.createBufferSource();
    gruntSrc = src;
    src.buffer = buf;
    src.connect(bus);
    src.start();
    return new Promise((r) => { src.onended = r; });
  }

  return {
    ensure,
    attachStream,
    detachStream,
    playUrl,
    preload: loadBuffer,
    getCtx: () => ctx,
    getBus: () => bus,
    onLevel: (cb) => { levelCb = cb; },
  };
})();

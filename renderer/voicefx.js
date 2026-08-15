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

  let playSeq = 0;
  let cur = null;
  let pend = null;
  const XFADE_AT = 0.75;
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

  // Lines chain instead of cutting: the playing line holds to 75% of its
  // length, then crossfades into the newest call over its remaining tail,
  // so repeated slams read as one continuous scream. A lone line plays
  // out in full; only the freshest not-yet-started line is kept queued.
  async function playUrl(url) {
    const seq = ++playSeq;
    const buf = await loadBuffer(url);
    if (seq !== playSeq) return;
    const now = ctx.currentTime;
    if (pend && now >= pend.start) { cur = pend; pend = null; }
    if (cur && now >= cur.start + cur.dur) cur = null;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.connect(g);
    g.connect(bus);
    const done = new Promise((r) => { src.onended = () => { g.disconnect(); r(); }; });
    if (!cur) {
      src.start(now);
      cur = { src, g, start: now, dur: buf.duration };
      return done;
    }
    const at = Math.max(now, cur.start + cur.dur * XFADE_AT);
    const end = cur.start + cur.dur;
    if (pend) {
      try { pend.src.stop(); } catch (e) { /* never started */ }
      pend.g.disconnect();
    }
    cur.g.gain.cancelAndHoldAtTime(at);
    cur.g.gain.linearRampToValueAtTime(0, end);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, end);
    src.start(at);
    pend = { src, g, start: at, dur: buf.duration };
    return done;
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

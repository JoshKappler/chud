// Goblinizer: granular pitch-down plus tanh saturation ("gravel"), pure
// sample math so the renderer, say.js, and tests all share one voice.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PitchCore = api;
})(this, function () {
  function createGoblinizer(opts = {}) {
    const rate = opts.pitch || 0.8;
    const gravel = Math.min(1, Math.max(0, opts.gravel === undefined ? 0.3 : opts.gravel));
    const N = 16384;
    const M = N - 1;
    const FADE = 256;
    const ring = new Float32Array(N);
    let w = 4096;
    let rp = 0;
    let fadePos = 0;
    let fadeI = -1;
    const drive = 1 + gravel * 4;
    const norm = Math.tanh(drive);

    function readAt(p) {
      const i = Math.floor(p);
      const frac = p - i;
      const a = ring[i & M];
      const b = ring[(i + 1) & M];
      return a + (b - a) * frac;
    }

    function process(inp, out) {
      for (let i = 0; i < inp.length; i++) {
        ring[w & M] = inp[i];
        w++;
        let s = readAt(rp);
        if (fadeI >= 0) {
          const k = fadeI / FADE;
          s = s * (1 - k) + readAt(fadePos) * k;
          fadePos += rate;
          fadeI++;
          if (fadeI >= FADE) {
            rp = fadePos;
            fadeI = -1;
          }
        } else if (w - rp > 2048) {
          fadePos = w - 512;
          fadeI = 0;
        }
        rp += rate;
        const wet = Math.tanh(s * drive) / norm;
        out[i] = s + (wet - s) * gravel;
      }
    }

    return { process };
  }

  return { createGoblinizer };
});

// Wet crunch foley, lettuce-head style: many micro-cracks over a squelchy
// noise bed, swept through a resonant lowpass, with a low thump. Pure
// sample math shared by the renderer and the preview script; every call
// randomizes so each hit sounds different.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CrunchCore = api;
})(this, function () {
  function renderCrunch(sr, rnd) {
    rnd = rnd || Math.random;
    const dur = 0.22 + rnd() * 0.15;
    const len = Math.floor(sr * dur);
    const x = new Float32Array(len);

    const cracks = 26 + Math.floor(rnd() * 26);
    for (let c = 0; c < cracks; c++) {
      const pos = Math.floor(Math.pow(rnd(), 1.7) * len * 0.85);
      const f = 700 + rnd() * 2800;
      const clen = Math.floor(sr * (0.004 + rnd() * 0.012));
      const amp = 0.3 + rnd() * 0.7;
      for (let i = 0; i < clen && pos + i < len; i++) {
        x[pos + i] += Math.sin((2 * Math.PI * f * i) / sr) * amp * Math.pow(1 - i / clen, 2);
      }
    }

    let squelch = 0;
    for (let i = 0; i < len; i++) {
      if (rnd() < 0.0035) squelch = 0.5 + rnd() * 0.5;
      squelch *= 0.9994;
      x[i] += (rnd() * 2 - 1) * Math.pow(1 - i / len, 1.3) * (0.15 + squelch * 0.55);
    }

    const q = 2.5 + rnd() * 4;
    const f0 = 1900 + rnd() * 1400;
    const f1 = 230 + rnd() * 170;
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    let xn1 = 0, xn2 = 0, yn1 = 0, yn2 = 0;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      if (i % 32 === 0) {
        const fc = f0 * Math.pow(f1 / f0, i / len);
        const w = (2 * Math.PI * fc) / sr;
        const alpha = Math.sin(w) / (2 * q);
        const cosw = Math.cos(w);
        const a0 = 1 + alpha;
        b0 = (1 - cosw) / 2 / a0;
        b1 = (1 - cosw) / a0;
        b2 = b0;
        a1 = (-2 * cosw) / a0;
        a2 = (1 - alpha) / a0;
      }
      const yn = b0 * x[i] + b1 * xn1 + b2 * xn2 - a1 * yn1 - a2 * yn2;
      xn2 = xn1;
      xn1 = x[i];
      yn2 = yn1;
      yn1 = yn;
      out[i] = yn * Math.pow(1 - i / len, 0.8);
    }

    const th0 = 90 + rnd() * 45;
    const tlen = Math.min(Math.floor(sr * 0.13), len);
    let ph = 0;
    for (let i = 0; i < tlen; i++) {
      const f = th0 * Math.pow(40 / th0, i / tlen);
      ph += (2 * Math.PI * f) / sr;
      out[i] += Math.sin(ph) * 0.5 * Math.pow(1 - i / tlen, 1.5);
    }

    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0) for (let i = 0; i < len; i++) out[i] = (out[i] / peak) * 0.85;
    return out;
  }

  return { renderCrunch };
});

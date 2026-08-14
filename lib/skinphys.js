// Skin kinematics from classic mechanics: raw window velocity is
// differentiated into the full chain (velocity, acceleration, jerk,
// snap, crackle, pop), one-pole filtered against pixel quantization.
// The lag rides the base-excitation oscillator (seismometer equation)
//   lag'' + 2*Z*W*lag' + W^2*lag = W^2*(-v) - KA*a - KJ*j
// with shear-thickening damping (rises with deformation rate) so a
// violent transit arrives fast but controlled. Squash pumps on
// acceleration shock along the stretched-tail axis, registering a
// reversal the frame it happens; snap, crackle and pop feed flutter.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SkinPhys = api;
})(this, function () {
  const LAG_W = 11;
  const LAG_Z = 0.42;
  const KA = 3.5;
  const KJ = 0.01;
  const KZD = 0.55;
  const LV0 = 2.6e4;
  const SQ_W = 14;
  const SQ_Z = 0.3;
  const KSA = 0.003;
  const KSJ = 0.000009;
  const TAU = [0.03, 0.03, 0.04, 0.05, 0.06, 0.07];
  const SN0 = 3.7e7;
  const CR0 = 5.9e8;
  const PP0 = 7.7e9;

  function createSkin() {
    const val = TAU.map(() => ({ x: 0, y: 0 }));
    const old = TAU.map(() => ({ x: 0, y: 0 }));
    const st = {
      lagX: 0, lagY: 0, lagVX: 0, lagVY: 0,
      sq: 0, sqV: 0, flutter: 0,
      dirX: 0, dirY: 1, speed: 0,
    };
    function step(vx, vy, rawDt) {
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      for (let k = 0; k < TAU.length; k++) {
        const rx = k === 0 ? vx : (val[k - 1].x - old[k - 1].x) / dt;
        const ry = k === 0 ? vy : (val[k - 1].y - old[k - 1].y) / dt;
        const a = dt / (TAU[k] + dt);
        val[k].x += (rx - val[k].x) * a;
        val[k].y += (ry - val[k].y) * a;
      }
      for (let k = 0; k < TAU.length; k++) {
        old[k].x = val[k].x;
        old[k].y = val[k].y;
      }
      const [v, acc, jrk, snap, crk, pop] = val;

      const rate = Math.hypot(st.lagVX, st.lagVY);
      const zEff = LAG_Z + KZD * Math.min(1, rate / LV0);
      st.lagVX += ((-v.x - st.lagX) * LAG_W * LAG_W - 2 * zEff * LAG_W * st.lagVX - KA * acc.x - KJ * jrk.x) * dt;
      st.lagVY += ((-v.y - st.lagY) * LAG_W * LAG_W - 2 * zEff * LAG_W * st.lagVY - KA * acc.y - KJ * jrk.y) * dt;
      st.lagX += st.lagVX * dt;
      st.lagY += st.lagVY * dt;

      const comp = Math.max(0, acc.x * st.dirX + acc.y * st.dirY);
      const jcomp = Math.max(0, jrk.x * st.dirX + jrk.y * st.dirY);
      st.sqV += (KSA * comp + KSJ * jcomp - st.sq * SQ_W * SQ_W - 2 * SQ_Z * SQ_W * st.sqV) * dt;
      st.sq += st.sqV * dt;
      st.sq = Math.max(-0.5, Math.min(0.85, st.sq));

      const drive = Math.min(1,
        Math.hypot(snap.x, snap.y) / SN0
        + Math.hypot(crk.x, crk.y) / CR0
        + Math.hypot(pop.x, pop.y) / PP0);
      const ft = drive > st.flutter ? 0.03 : 0.18;
      st.flutter += (drive - st.flutter) * (dt / (ft + dt));

      st.speed = Math.hypot(st.lagX, st.lagY);
      if (st.speed > 40) {
        st.dirX = st.lagX / st.speed;
        st.dirY = st.lagY / st.speed;
      }
      return st;
    }

    // Direct squash shock for impacts reported by the main process,
    // which can land between two render frames.
    function impulse(amount) {
      st.sqV += amount;
    }

    return { step, impulse };
  }

  return { createSkin };
});

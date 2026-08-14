// Skin kinematics from classic mechanics. The window's motion is
// differentiated into the full derivative chain (velocity, acceleration,
// jerk, snap, crackle, pop), each stage one-pole filtered against pixel
// quantization noise. The skin lag rides the base-excitation oscillator
// (the seismometer equation, driven by the frame's acceleration):
//   lag'' + 2*Z*W*lag' + W^2*lag = W^2*(-v) - KA*a - KJ*j
// The -v wind term holds the steady-speed stretch; the acceleration and
// jerk terms are the inertial kick that answers a yank the frame it
// happens instead of after the old smoothing delay. Squash is pumped by
// deceleration and braking jerk along the travel direction; snap,
// crackle and pop feed a flutter envelope for violent shaking.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SkinPhys = api;
})(this, function () {
  const LAG_W = 11;
  const LAG_Z = 0.42;
  const KA = 5.0;
  const KJ = 0.022;
  const SQ_W = 14;
  const SQ_Z = 0.3;
  const KSA = 0.002;
  const KSJ = 0.0000045;
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
    let mvX = 0;
    let mvY = 0;

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

      st.lagVX += ((-v.x - st.lagX) * LAG_W * LAG_W - 2 * LAG_Z * LAG_W * st.lagVX - KA * acc.x - KJ * jrk.x) * dt;
      st.lagVY += ((-v.y - st.lagY) * LAG_W * LAG_W - 2 * LAG_Z * LAG_W * st.lagVY - KA * acc.y - KJ * jrk.y) * dt;
      st.lagX += st.lagVX * dt;
      st.lagY += st.lagVY * dt;

      const sp = Math.hypot(v.x, v.y);
      if (sp > 40) {
        mvX = v.x / sp;
        mvY = v.y / sp;
      }
      const decel = Math.max(0, -(acc.x * mvX + acc.y * mvY));
      const jbrake = Math.max(0, -(jrk.x * mvX + jrk.y * mvY));
      st.sqV += (KSA * decel + KSJ * jbrake - st.sq * SQ_W * SQ_W - 2 * SQ_Z * SQ_W * st.sqV) * dt;
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

    return { step };
  }

  return { createSkin };
});

// Drag, fling and idle drift for the web build, ported from lib/drift.js:
// he hangs from the pointer on a slack elastic cord, a fast release
// throws him, hard wall arrivals splat and hold before a soft rebound,
// and at rest he drifts lazily around the fake desktop.
const Fling = (() => {
  const FLING_MIN = 350;
  const FLING_CAP = 2800;
  const BOUNCE = 0.5;
  const REBOUND = 0.4;
  const AIR = 1.1;
  const SMEAR_FRICTION = 2.5;
  const SMEAR_MIN = 300;
  const IMPACT_MIN = 350;
  const HURT_MIN = 900;
  const HURT_COOLDOWN_MS = 250;
  const RELEASE_PX = 8;
  const TETHER_LEN = 44;
  const TETHER_K = 460;
  const TETHER_DAMP = 12;
  const TETHER_DRAG = 1.2;
  const TETHER_DRAG2 = 0.0006;
  const TETHER_SETTLE = 7;
  const TETHER_SETTLE_V = 300;
  const CRUISE = 8;
  const BOB = 3;
  const MARGIN = 18;

  let canvas, field, hooks;
  let px = 0, py = 0, vx = 0, vy = 0;
  let mode = 'drift', theta = 0, t = 0;
  let wallC = null, lastHurtAt = 0;
  let grab = null, lastT = 0;
  const contact = new Set();

  // The canvas is three head-widths square with the head centered; px,py
  // track the head's top-left in field coordinates. norm() converts CSS
  // speeds to the desktop screen-pixel scale the physics was tuned in.
  const head = () => canvas.clientWidth / 3;
  const norm = () => canvas.width / canvas.clientWidth;

  function apply() {
    canvas.style.transform = `translate(${px - head()}px, ${py - head()}px)`;
  }

  function wallPoint(edge) {
    const w = head();
    if (edge === 'left') return [0, py + w / 2];
    if (edge === 'right') return [field.clientWidth, py + w / 2];
    if (edge === 'top') return [px + w / 2, 0];
    return [px + w / 2, field.clientHeight];
  }

  function slam(edge, vn) {
    const nv = vn * norm();
    if (nv < IMPACT_MIN) return false;
    const hurt = nv > HURT_MIN && Date.now() - lastHurtAt > HURT_COOLDOWN_MS;
    if (hurt) lastHurtAt = Date.now();
    const [ix, iy] = wallPoint(edge);
    hooks.onSlam(edge, Math.min(nv, FLING_CAP), hurt, ix, iy);
    return hurt;
  }

  function arrive(edge, vn) {
    if (contact.has(edge)) return;
    contact.add(edge);
    slam(edge, vn);
  }

  function dragStep(dt) {
    const g = grab;
    if (dt > 0.001) {
      const mix = Math.min(1, dt / 0.06);
      g.cvx += ((g.cx - g.lx) / dt - g.cvx) * mix;
      g.cvy += ((g.cy - g.ly) / dt - g.cvy) * mix;
    }
    g.lx = g.cx;
    g.ly = g.cy;
    if (!g.armed) {
      if (Math.abs(g.cx - g.ax) + Math.abs(g.cy - g.ay) <= 3) return;
      g.armed = true;
    }
    const still = Math.max(0, 1 - Math.hypot(g.cvx, g.cvy) / TETHER_SETTLE_V);
    let rem = dt;
    while (rem > 0) {
      const h = Math.min(rem, 0.012);
      rem -= h;
      const sx = g.cx - (px + g.gx);
      const sy = g.cy - (py + g.gy);
      const dist = Math.hypot(sx, sy);
      if (dist > TETHER_LEN) {
        const ux = sx / dist;
        const uy = sy / dist;
        // spring on the stretch plus a dashpot on the stretch rate,
        // clamped at zero: a cord pulls and never pushes
        const sep = (g.cvx - vx) * ux + (g.cvy - vy) * uy;
        const pull = Math.max(0, TETHER_K * (dist - TETHER_LEN) + TETHER_DAMP * sep);
        vx += pull * ux * h;
        vy += pull * uy * h;
      }
      const spd = Math.hypot(vx, vy);
      const air = Math.exp(-(TETHER_DRAG + TETHER_DRAG2 * spd + TETHER_SETTLE * still) * h);
      vx *= air;
      vy *= air;
      px += vx * h;
      py += vy * h;
    }
    const w = head();
    const W = field.clientWidth;
    const H = field.clientHeight;
    for (const e of [...contact]) {
      const c = e === 'left' ? px : e === 'right' ? W - w - px : e === 'top' ? py : H - w - py;
      if (c >= RELEASE_PX) contact.delete(e);
    }
    if (px <= 0) { arrive('left', -vx); px = 0; vx = 0; }
    else if (px + w >= W) { arrive('right', vx); px = W - w; vx = 0; }
    if (py <= 0) { arrive('top', -vy); py = 0; vy = 0; }
    else if (py + w >= H) { arrive('bottom', vy); py = H - w; vy = 0; }
  }

  function flingStep(dt) {
    const w = head();
    const W = field.clientWidth;
    const H = field.clientHeight;
    // Wall contact: the splat plays out on the glass while sideways speed
    // sheds to friction, then he leaves at REBOUND of the arrival speed.
    if (wallC) {
      if (wallC.edge === 'top' || wallC.edge === 'bottom') {
        vy = 0;
        py = wallC.edge === 'top' ? 0 : H - w;
        vx *= Math.exp(-SMEAR_FRICTION * dt);
        px = Math.min(Math.max(px + vx * dt, 0), W - w);
      } else {
        vx = 0;
        px = wallC.edge === 'left' ? 0 : W - w;
        vy *= Math.exp(-SMEAR_FRICTION * dt);
        py = Math.min(Math.max(py + vy * dt, 0), H - w);
      }
      const vt = Math.abs(wallC.edge === 'top' || wallC.edge === 'bottom' ? vx : vy);
      if (vt * norm() > SMEAR_MIN && hooks.onSmear) {
        const [ix, iy] = wallPoint(wallC.edge);
        hooks.onSmear(wallC.edge, ix, iy, vt * norm() * 0.35);
      }
      if (Date.now() >= wallC.until) {
        if (wallC.edge === 'left') vx = wallC.out;
        else if (wallC.edge === 'right') vx = -wallC.out;
        else if (wallC.edge === 'top') vy = wallC.out;
        else vy = -wallC.out;
        wallC = null;
      }
      return;
    }
    vx *= Math.exp(-AIR * dt);
    vy *= Math.exp(-AIR * dt);
    px += vx * dt;
    py += vy * dt;
    let hit = null;
    if (px < 0) { hit = ['left', -vx]; px = 0; vx = Math.abs(vx) * BOUNCE; }
    if (px + w > W) { hit = ['right', vx]; px = W - w; vx = -Math.abs(vx) * BOUNCE; }
    if (py < 0) { hit = ['top', -vy]; py = 0; vy = Math.abs(vy) * BOUNCE; }
    if (py + w > H) { hit = ['bottom', vy]; py = H - w; vy = -Math.abs(vy) * BOUNCE; }
    if (hit && slam(hit[0], hit[1])) {
      if (hit[0] === 'left' || hit[0] === 'right') vx = 0; else vy = 0;
      const nv = Math.min(hit[1] * norm(), FLING_CAP);
      wallC = {
        edge: hit[0],
        until: Date.now() + SkinPhys.impactTiming(nv).total,
        out: (nv * REBOUND) / norm(),
      };
    }
    if (!wallC && Math.hypot(vx, vy) < 25) {
      mode = 'drift';
      theta = Math.atan2(vy, vx);
    }
  }

  function driftStep(dt) {
    const w = head();
    const W = field.clientWidth;
    const H = field.clientHeight;
    theta += (Math.random() - 0.5) * 1.6 * dt;
    let dvx = Math.cos(theta) * CRUISE;
    let dvy = Math.sin(theta) * CRUISE * 0.6 + Math.sin(t * 0.9) * BOB;
    if (px < MARGIN) dvx += CRUISE * 2;
    if (px + w > W - MARGIN) dvx -= CRUISE * 2;
    if (py < MARGIN) dvy += CRUISE * 2;
    if (py + w > H - MARGIN) dvy -= CRUISE * 2;
    const blend = Math.min(1, 1.8 * dt);
    vx += (dvx - vx) * blend;
    vy += (dvy - vy) * blend;
    px = Math.min(Math.max(px + vx * dt, 2), W - w - 2);
    py = Math.min(Math.max(py + vy * dt, 2), H - w - 2);
  }

  function tick(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    t += dt;
    if (grab) dragStep(dt);
    else if (mode === 'fling') flingStep(dt);
    else driftStep(dt);
    apply();
    Goblin.setMotion(vx * norm(), vy * norm());
    requestAnimationFrame(tick);
  }

  function localXY(e) {
    const r = field.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onHead(x, y) {
    const w = head();
    const p = 8;
    return x >= px - p && x < px + w + p && y >= py - p && y < py + w + p;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const [x, y] = localXY(e);
    if (!onHead(x, y)) return;
    wallC = null;
    mode = 'drift';
    grab = {
      gx: x - px, gy: y - py, cx: x, cy: y, lx: x, ly: y,
      cvx: 0, cvy: 0, ax: x, ay: y, armed: false, downT: Date.now(),
    };
    field.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e) {
    if (!grab) return;
    const [x, y] = localXY(e);
    grab.cx = x;
    grab.cy = y;
  }

  function release() {
    if (!grab) return;
    const g = grab;
    grab = null;
    contact.clear();
    // A punch is any short press without a real drag: mashing and finger
    // taps wobble a few pixels, so the bar sits well above the 3px that
    // arms the tether.
    const moved = Math.abs(g.cx - g.ax) + Math.abs(g.cy - g.ay);
    if (moved < 14 && Date.now() - g.downT < 400) {
      const w = head();
      hooks.onPunch(px + w / 2, py + w / 2);
      return;
    }
    const speed = Math.hypot(vx, vy) * norm();
    if (speed < FLING_MIN) {
      mode = 'drift';
      theta = Math.atan2(vy, vx);
      return;
    }
    const scale = Math.min(speed, FLING_CAP) / speed;
    vx *= scale;
    vy *= scale;
    mode = 'fling';
  }

  function init(opts) {
    canvas = opts.canvas;
    field = opts.field;
    hooks = opts.hooks;
    px = (field.clientWidth - head()) / 2;
    py = (field.clientHeight - head()) / 2;
    theta = Math.random() * Math.PI * 2;
    field.addEventListener('pointerdown', onDown);
    field.addEventListener('pointermove', onMove);
    field.addEventListener('pointerup', release);
    field.addEventListener('pointercancel', release);
    field.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const [x, y] = localXY(e);
      const w = head();
      if (onHead(x, y)) hooks.onPunch(px + w / 2, py + w / 2);
    });
    window.addEventListener('resize', () => {
      px = Math.min(Math.max(px, 0), Math.max(0, field.clientWidth - head()));
      py = Math.min(Math.max(py, 0), Math.max(0, field.clientHeight - head()));
    });
    lastT = performance.now();
    apply();
    requestAnimationFrame(tick);
  }

  return { init };
})();

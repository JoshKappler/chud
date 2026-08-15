// Lazy water-drift for the goblin window: a slowly turning heading with a
// buoyant bob, velocity smoothed toward it, steered to stay in a band near
// the screen edges. Prefers the external display; after a manual drag it
// adopts whatever display it is on.
const { screen } = require('electron');
const fs = require('fs');
const skinphys = require('./skinphys');

const TICK_MS = 16;
const CRUISE = 8;
const BOB = 3;
const BAND = 170;
const MARGIN = 24;

const FLING_MIN = 350;
const FLING_CAP = 2800;
const BOUNCE = 0.5;
const HURT_COOLDOWN_MS = 80;
const SLAM_MIN = 350;
const RELEASE_PX = 8;
const REBOUND = 0.4;
const SMEAR_FRICTION = 2.5;
const SMEAR_MIN = 300;

const TETHER_LEN = 44;
const TETHER_K = 460;
const TETHER_DAMP = 12;
const TETHER_DRAG = 1.2;
const TETHER_DRAG2 = 0.0006;
const TETHER_SETTLE = 7;
const TETHER_SETTLE_V = 300;

let win = null;
let timer = null;
// The window carries a transparent margin for the stretch tail; px, py
// and every clamp below track the visible head square, inset from the
// window by a constant on all four sides.
let inset = 0;
let display = null;
let px = 0, py = 0, vx = 0, vy = 0, t = 0;
let theta = 0;
let dragging = false;
let mode = 'drift';
let samples = [];
let onBounce = null;
let lastHurtAt = 0;
let wallC = null;
let pinEdge = null;
let pinUntil = 0;
let pinVn = 0;
let onSmear = null;
let dragBodyVx = 0;
let dragBodyVy = 0;
const contact = new Set();

function pickDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => !d.internal) || screen.getPrimaryDisplay();
}

function headSize() {
  const [ww, wh] = win.getSize();
  return [ww - inset * 2, wh - inset * 2];
}

function adoptCurrentDisplay() {
  const [x, y] = win.getPosition();
  const [w, h] = headSize();
  px = x + inset;
  py = y + inset;
  display = screen.getDisplayMatching({ x: px, y: py, width: w, height: h });
  vx = 0;
  vy = 0;
}

function applyPosition() {
  const [curX, curY] = win.getPosition();
  const nx = Math.round(px) - inset;
  const ny = Math.round(py) - inset;
  if (nx !== curX || ny !== curY) win.setPosition(nx, ny);
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const dt = TICK_MS / 1000;
  t += dt;
  if (dragging) return;

  const wa = display.workArea;
  const [w, h] = headSize();

  if (mode === 'fling') {
    // Wall contact: the splat plays out on the glass while any sideways
    // speed keeps sliding, shedding to friction and smearing blood as it
    // goes. He leaves once the face has recovered, at REBOUND of the
    // arrival speed: a soft rubber ball, not a superball.
    if (wallC) {
      const horiz = wallC.edge === 'top' || wallC.edge === 'bottom';
      if (horiz) {
        vy = 0;
        py = wallC.edge === 'top' ? wa.y : wa.y + wa.height - h;
        vx *= Math.exp(-SMEAR_FRICTION * dt);
        px += vx * dt;
        const cx = Math.min(Math.max(px, wa.x), wa.x + wa.width - w);
        if (cx !== px) { px = cx; vx = 0; }
      } else {
        vx = 0;
        px = wallC.edge === 'left' ? wa.x : wa.x + wa.width - w;
        vy *= Math.exp(-SMEAR_FRICTION * dt);
        py += vy * dt;
        const cy = Math.min(Math.max(py, wa.y), wa.y + wa.height - h);
        if (cy !== py) { py = cy; vy = 0; }
      }
      const vt = Math.abs(horiz ? vx : vy);
      if (vt > SMEAR_MIN && onSmear) onSmear(smearHit(wallC.edge, wa, w, h, vt));
      if (Date.now() >= wallC.until) {
        if (wallC.edge === 'left') vx = wallC.out;
        else if (wallC.edge === 'right') vx = -wallC.out;
        else if (wallC.edge === 'top') vy = wallC.out;
        else vy = -wallC.out;
        wallC = null;
      }
      applyPosition();
      return;
    }
    vx *= Math.exp(-1.1 * dt);
    vy *= Math.exp(-1.1 * dt);
    px += vx * dt;
    py += vy * dt;
    let hit = null;
    if (px < wa.x) { hit = { edge: 'left', ix: wa.x, iy: py + h / 2, vn: -vx }; px = wa.x; vx = Math.abs(vx) * BOUNCE; }
    if (px + w > wa.x + wa.width) { hit = { edge: 'right', ix: wa.x + wa.width, iy: py + h / 2, vn: vx }; px = wa.x + wa.width - w; vx = -Math.abs(vx) * BOUNCE; }
    if (py < wa.y) { hit = { edge: 'top', ix: px + w / 2, iy: wa.y, vn: -vy }; py = wa.y; vy = Math.abs(vy) * BOUNCE; }
    if (py + h > wa.y + wa.height) { hit = { edge: 'bottom', ix: px + w / 2, iy: wa.y + wa.height, vn: vy }; py = wa.y + wa.height - h; vy = -Math.abs(vy) * BOUNCE; }
    // A hard hit is judged by the speed INTO the glass, not path speed,
    // so a shallow graze skims off softly instead of splatting.
    if (hit && hit.vn > 900 && Date.now() - lastHurtAt > HURT_COOLDOWN_MS) {
      lastHurtAt = Date.now();
      if (onBounce) onBounce({ edge: hit.edge, ix: hit.ix, iy: hit.iy, speed: hit.vn, wa });
      if (hit.edge === 'left' || hit.edge === 'right') vx = 0; else vy = 0;
      wallC = {
        edge: hit.edge,
        until: Date.now() + skinphys.impactTiming(hit.vn).total,
        out: Math.min(hit.vn, FLING_CAP) * REBOUND,
      };
    }
    if (!wallC && Math.hypot(vx, vy) < 25) {
      mode = 'drift';
      theta = Math.atan2(vy, vx);
    }
    applyPosition();
    return;
  }

  const cx = px + w / 2;
  const cy = py + h / 2;

  theta += (Math.random() - 0.5) * 1.6 * dt;
  let dvx = Math.cos(theta) * CRUISE;
  let dvy = Math.sin(theta) * CRUISE * 0.6 + Math.sin(t * 0.9) * BOB;

  const dl = cx - wa.x;
  const dr = wa.x + wa.width - cx;
  const dtp = cy - wa.y;
  const db = wa.y + wa.height - cy;
  const dMin = Math.min(dl, dr, dtp, db);
  if (dMin > BAND) {
    if (dMin === dl) dvx -= CRUISE;
    else if (dMin === dr) dvx += CRUISE;
    else if (dMin === dtp) dvy -= CRUISE;
    else dvy += CRUISE;
  }
  if (px < wa.x + MARGIN) dvx += CRUISE * 2;
  if (px + w > wa.x + wa.width - MARGIN) dvx -= CRUISE * 2;
  if (py < wa.y + MARGIN) dvy += CRUISE * 2;
  if (py + h > wa.y + wa.height - MARGIN) dvy -= CRUISE * 2;

  const blend = Math.min(1, 1.8 * dt);
  vx += (dvx - vx) * blend;
  vy += (dvy - vy) * blend;

  px += vx * dt;
  py += vy * dt;
  px = Math.min(Math.max(px, wa.x + 2), wa.x + wa.width - w - 2);
  py = Math.min(Math.max(py, wa.y + 2), wa.y + wa.height - h - 2);

  applyPosition();
}

function noteMove(dx, dy) {
  samples.push({ dx, dy, t: Date.now() });
  if (samples.length > 40) samples.shift();
}

function smearHit(edge, wa, w, h, vt) {
  const hit = { edge, wa, speed: vt * 0.35 };
  if (edge === 'left' || edge === 'right') {
    hit.ix = edge === 'left' ? wa.x : wa.x + wa.width;
    hit.iy = py + h / 2;
  } else {
    hit.ix = px + w / 2;
    hit.iy = edge === 'top' ? wa.y : wa.y + wa.height;
  }
  return hit;
}

function displayBeyond(x, y, currentId) {
  return screen.getAllDisplays().some((d) =>
    d.id !== currentId
    && x >= d.bounds.x && x < d.bounds.x + d.bounds.width
    && y >= d.bounds.y && y < d.bounds.y + d.bounds.height);
}

function clearance(edge, nx, ny, wa, w, h) {
  if (edge === 'left') return nx - wa.x;
  if (edge === 'right') return wa.x + wa.width - w - nx;
  if (edge === 'top') return ny - wa.y;
  return wa.y + wa.height - h - ny;
}

// Held drags clamp at real monitor edges; crossing into another display
// stays free. A hurt fires once per arrival at a wall (the wall joins
// `contact`, silent until pulled RELEASE_PX clear), and arrival includes
// landing exactly ON the boundary: a cursor pinned at a screen edge moves
// in lockstep with the window, so that wall can never be overshot. The
// display lookup is cached because it hits the window server and this
// runs per mouse event.
let dragDisp = null;
let dragDispAt = 0;
const DBG = !!process.env.CHUD_DEBUG || fs.existsSync('/tmp/chud-debug-on');
const dbgLog = (m) => { try { fs.appendFileSync('/tmp/chud-debug.log', m + '\n'); } catch (e) { /* debug only */ } };
let evN = 0;
let evLogAt = 0;
let evLast = 0;
function dragMove(dx, dy) {
  if (!win || win.isDestroyed()) return;
  if (DBG) {
    evN++;
    const t = Date.now();
    if (evLast && t - evLast > 24) dbgLog(`[draggap] ${t - evLast}ms`);
    evLast = t;
    if (t - evLogAt > 1000) {
      dbgLog(`[dragmove] ${evN} ev/s`);
      evN = 0;
      evLogAt = t;
    }
  }
  noteMove(dx, dy);
  const [wx, wy] = win.getPosition();
  const [w, h] = headSize();
  const x = wx + inset;
  const y = wy + inset;
  let nx = x + dx;
  let ny = y + dy;
  const dnow = Date.now();
  if (!dragDisp || dnow - dragDispAt > 120
      || x < dragDisp.bounds.x || x >= dragDisp.bounds.x + dragDisp.bounds.width
      || y < dragDisp.bounds.y || y >= dragDisp.bounds.y + dragDisp.bounds.height) {
    dragDisp = screen.getDisplayMatching({ x, y, width: w, height: h });
    dragDispAt = dnow;
  }
  const disp = dragDisp;
  const wa = disp.workArea;
  const b = disp.bounds;
  const hits = [];
  if (nx <= wa.x && !displayBeyond(b.x - 20, ny + h / 2, disp.id)) {
    nx = wa.x;
    hits.push({ edge: 'left', ix: wa.x, iy: ny + h / 2 });
  }
  if (nx + w >= wa.x + wa.width && !displayBeyond(b.x + b.width + 20, ny + h / 2, disp.id)) {
    nx = wa.x + wa.width - w;
    hits.push({ edge: 'right', ix: wa.x + wa.width, iy: ny + h / 2 });
  }
  if (ny <= wa.y && !displayBeyond(nx + w / 2, b.y - 20, disp.id)) {
    ny = wa.y;
    hits.push({ edge: 'top', ix: nx + w / 2, iy: wa.y });
  }
  if (ny + h >= wa.y + wa.height && !displayBeyond(nx + w / 2, b.y + b.height + 20, disp.id)) {
    ny = wa.y + wa.height - h;
    hits.push({ edge: 'bottom', ix: nx + w / 2, iy: wa.y + wa.height });
  }
  const tx = Math.round(nx) - inset;
  const ty = Math.round(ny) - inset;
  if (tx !== wx || ty !== wy) win.setPosition(tx, ty);
  for (const e of [...contact]) {
    if (clearance(e, nx, ny, wa, w, h) >= RELEASE_PX) contact.delete(e);
  }
  const fresh = hits.find((hh) => !contact.has(hh.edge));
  for (const hh of hits) contact.add(hh.edge);
  if (fresh) {
    // judged by the tether body's speed into the glass, so a sideways
    // smear along a wall does not read as a slam
    const vn = fresh.edge === 'left' ? -dragBodyVx
      : fresh.edge === 'right' ? dragBodyVx
        : fresh.edge === 'top' ? -dragBodyVy : dragBodyVy;
    if (vn > SLAM_MIN && Date.now() - lastHurtAt > HURT_COOLDOWN_MS) {
      lastHurtAt = Date.now();
      if (onBounce) onBounce({ ...fresh, speed: vn, wa });
      pinEdge = fresh.edge;
      pinVn = vn;
      pinUntil = Date.now() + skinphys.impactTiming(vn).total;
    }
  }
}

function start(window, pad) {
  win = window;
  inset = pad || 0;
  display = pickDisplay();
  const wa = display.workArea;
  const [w] = headSize();
  px = wa.x + wa.width - w - 80;
  py = wa.y + Math.round(wa.height * 0.35);
  applyPosition();
  timer = setInterval(tick, TICK_MS);
}

// Dragging hangs him from the cursor on a slack elastic cord tied to the
// grab point: no force inside TETHER_LEN, a damped spring pull past it.
// Damping is radial only, so stretch bounce dies while orbit speed
// survives; circling the cursor spins him up, and release hands the
// cord's speed to the fling, so a spin lets go as a slingshot.
let dragGrab = null;
let dragFallback = null;
let lastTickAt = 0;

function beginDrag() {
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragGrab = {
    gx: c.x - (wx + inset), gy: c.y - (wy + inset),
    ax: c.x, ay: c.y, armed: false,
    bx: wx + inset, by: wy + inset, bvx: 0, bvy: 0,
    cx: c.x, cy: c.y, cvx: 0, cvy: 0,
  };
  lastTickAt = Date.now();
  dragFallback = setInterval(() => {
    if (Date.now() - lastTickAt > 40) {
      if (DBG) dbgLog(`[fallback] renderer pump silent ${Date.now() - lastTickAt}ms`);
      dragTick();
    }
  }, 50);
}

function dragTick() {
  if (!dragging || !dragGrab || !win || win.isDestroyed()) return;
  const now = Date.now();
  let dt = Math.min((now - lastTickAt) / 1000, 0.05);
  lastTickAt = now;
  const g = dragGrab;
  const p = screen.getCursorScreenPoint();
  if (dt > 0.001) {
    // smoothed hand velocity: feeds the cord's dashpot, and tells a
    // driving hand (lively) from a resting one (the swing settles)
    const mix = Math.min(1, dt / 0.06);
    g.cvx += ((p.x - g.cx) / dt - g.cvx) * mix;
    g.cvy += ((p.y - g.cy) / dt - g.cvy) * mix;
  }
  g.cx = p.x;
  g.cy = p.y;
  if (!g.armed) {
    if (Math.abs(p.x - g.ax) + Math.abs(p.y - g.ay) <= 3) return;
    g.armed = true;
    const [wx, wy] = win.getPosition();
    g.bx = wx + inset;
    g.by = wy + inset;
  }
  const still = Math.max(0, 1 - Math.hypot(g.cvx, g.cvy) / TETHER_SETTLE_V);
  while (dt > 0) {
    const h = Math.min(dt, 0.012);
    dt -= h;
    const sx = p.x - (g.bx + g.gx);
    const sy = p.y - (g.by + g.gy);
    const dist = Math.hypot(sx, sy);
    if (dist > TETHER_LEN) {
      const ux = sx / dist;
      const uy = sy / dist;
      // spring on the stretch plus a dashpot on the stretch RATE,
      // clamped at zero: a cord pulls and never pushes
      const sep = (g.cvx - g.bvx) * ux + (g.cvy - g.bvy) * uy;
      const pull = Math.max(0, TETHER_K * (dist - TETHER_LEN) + TETHER_DAMP * sep);
      g.bvx += pull * ux * h;
      g.bvy += pull * uy * h;
    }
    const spd = Math.hypot(g.bvx, g.bvy);
    const air = Math.exp(-(TETHER_DRAG + TETHER_DRAG2 * spd + TETHER_SETTLE * still) * h);
    g.bvx *= air;
    g.bvy *= air;
    g.bx += g.bvx * h;
    g.by += g.bvy * h;
  }
  dragBodyVx = g.bvx;
  dragBodyVy = g.bvy;
  const [cwx, cwy] = win.getPosition();
  const dx = Math.round(g.bx) - (cwx + inset);
  const dy = Math.round(g.by) - (cwy + inset);
  if (dx || dy) dragMove(dx, dy);
  // dragMove clamps at real walls; adopt the clamp, kill the speed into
  // the glass, and let a fast slide along it leave its blood trail.
  const [nwx, nwy] = win.getPosition();
  const hx = nwx + inset;
  const hy = nwy + inset;
  if (Math.round(g.bx) !== hx) {
    if (onSmear && Math.abs(g.bvy) > SMEAR_MIN && dragDisp) {
      const wa = dragDisp.workArea;
      const [, h2] = headSize();
      const edge = Math.round(g.bx) < hx ? 'left' : 'right';
      onSmear({ edge, ix: edge === 'left' ? wa.x : wa.x + wa.width, iy: hy + h2 / 2, wa, speed: Math.abs(g.bvy) * 0.35 });
    }
    g.bx = hx;
    g.bvx = 0;
  }
  if (Math.round(g.by) !== hy) {
    if (onSmear && Math.abs(g.bvx) > SMEAR_MIN && dragDisp) {
      const wa = dragDisp.workArea;
      const [w2] = headSize();
      const edge = Math.round(g.by) < hy ? 'top' : 'bottom';
      onSmear({ edge, ix: hx + w2 / 2, iy: edge === 'top' ? wa.y : wa.y + wa.height, wa, speed: Math.abs(g.bvx) * 0.35 });
    }
    g.by = hy;
    g.bvy = 0;
  }
}

function setDragging(v) {
  dragging = v;
  if (v) {
    samples = [];
    contact.clear();
    mode = 'drift';
    wallC = null;
    pinUntil = 0;
    evLast = 0;
    if (!dragGrab) beginDrag();
    return;
  }
  dragGrab = null;
  if (dragFallback) {
    clearInterval(dragFallback);
    dragFallback = null;
  }
  adoptCurrentDisplay();
  const now = Date.now();
  const recent = samples.filter((s) => now - s.t < 140);
  samples = [];
  let fvx = 0;
  let fvy = 0;
  if (recent.length) {
    const span = Math.max(0.03, (now - recent[0].t) / 1000);
    fvx = recent.reduce((a, s) => a + s.dx, 0) / span;
    fvy = recent.reduce((a, s) => a + s.dy, 0) / span;
  }
  // Released while still crushed on the glass: hold the wall for the
  // rest of the splat, keep any sideways speed sliding, and push off at
  // REBOUND of the arrival speed once the face has recovered.
  if (now < pinUntil && contact.has(pinEdge)) {
    if (pinEdge === 'top' || pinEdge === 'bottom') fvy = 0;
    else fvx = 0;
    const spd = Math.hypot(fvx, fvy);
    if (spd > FLING_CAP) {
      fvx *= FLING_CAP / spd;
      fvy *= FLING_CAP / spd;
    }
    vx = fvx;
    vy = fvy;
    wallC = { edge: pinEdge, until: pinUntil, out: Math.min(pinVn, FLING_CAP) * REBOUND };
    pinUntil = 0;
    mode = 'fling';
    return;
  }
  pinUntil = 0;
  const speed = Math.hypot(fvx, fvy);
  if (speed < FLING_MIN) return;
  const scale = Math.min(speed, FLING_CAP) / speed;
  vx = fvx * scale;
  vy = fvy * scale;
  mode = 'fling';
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  start,
  setDragging,
  dragMove,
  dragTick,
  getMode: () => mode,
  setOnBounce: (cb) => { onBounce = cb; },
  setOnSmear: (cb) => { onSmear = cb; },
  stop,
};

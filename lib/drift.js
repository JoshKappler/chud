// Lazy water-drift for the goblin window: a slowly turning heading with a
// buoyant bob, velocity smoothed toward it, steered to stay in a band near
// the screen edges. Prefers the external display; after a manual drag it
// adopts whatever display it is on.
const { screen } = require('electron');

const TICK_MS = 16;
const CRUISE = 8;
const BOB = 3;
const BAND = 170;
const MARGIN = 24;

const FLING_MIN = 350;
const FLING_CAP = 2800;
const BOUNCE = 0.75;
const HURT_COOLDOWN_MS = 80;
const SLAM_MIN = 350;
const RELEASE_PX = 8;

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
    vx *= Math.exp(-1.1 * dt);
    vy *= Math.exp(-1.1 * dt);
    px += vx * dt;
    py += vy * dt;
    const preSpeed = Math.hypot(vx, vy);
    let hit = null;
    if (px < wa.x) { px = wa.x; vx = Math.abs(vx) * BOUNCE; hit = { edge: 'left', ix: wa.x, iy: py + h / 2 }; }
    if (px + w > wa.x + wa.width) { px = wa.x + wa.width - w; vx = -Math.abs(vx) * BOUNCE; hit = { edge: 'right', ix: wa.x + wa.width, iy: py + h / 2 }; }
    if (py < wa.y) { py = wa.y; vy = Math.abs(vy) * BOUNCE; hit = { edge: 'top', ix: px + w / 2, iy: wa.y }; }
    if (py + h > wa.y + wa.height) { py = wa.y + wa.height - h; vy = -Math.abs(vy) * BOUNCE; hit = { edge: 'bottom', ix: px + w / 2, iy: wa.y + wa.height }; }
    if (hit && preSpeed > 900 && Date.now() - lastHurtAt > HURT_COOLDOWN_MS) {
      lastHurtAt = Date.now();
      if (onBounce) onBounce({ ...hit, speed: preSpeed, wa });
    }
    if (Math.hypot(vx, vy) < 25) {
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
  if (samples.length > 12) samples.shift();
}

// magnitude sum, not net displacement: rapid back-and-forth bashing
// strokes must not cancel each other out
function dragSpeed() {
  const now = Date.now();
  const recent = samples.filter((s) => now - s.t < 100);
  if (!recent.length) return 0;
  const span = Math.max(0.025, (now - recent[0].t) / 1000);
  let mag = 0;
  for (const s of recent) mag += Math.hypot(s.dx, s.dy);
  return mag / span;
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
// stays free (the neighbor probe reaches past the display bounds, not the
// work area, whose menu bar and dock strips would read a stacked screen
// as a wall). A hurt fires once per arrival at a wall: the wall joins
// `contact` and stays silent, however hard he is ground into it, until
// he pulls RELEASE_PX clear. One slam, one hurt, at any bashing rhythm.
function dragMove(dx, dy) {
  if (!win || win.isDestroyed()) return;
  noteMove(dx, dy);
  const [wx, wy] = win.getPosition();
  const [w, h] = headSize();
  const x = wx + inset;
  const y = wy + inset;
  let nx = x + dx;
  let ny = y + dy;
  const disp = screen.getDisplayMatching({ x, y, width: w, height: h });
  const wa = disp.workArea;
  const b = disp.bounds;
  const hits = [];
  if (nx < wa.x && !displayBeyond(b.x - 20, ny + h / 2, disp.id)) {
    nx = wa.x;
    hits.push({ edge: 'left', ix: wa.x, iy: ny + h / 2 });
  }
  if (nx + w > wa.x + wa.width && !displayBeyond(b.x + b.width + 20, ny + h / 2, disp.id)) {
    nx = wa.x + wa.width - w;
    hits.push({ edge: 'right', ix: wa.x + wa.width, iy: ny + h / 2 });
  }
  if (ny < wa.y && !displayBeyond(nx + w / 2, b.y - 20, disp.id)) {
    ny = wa.y;
    hits.push({ edge: 'top', ix: nx + w / 2, iy: wa.y });
  }
  if (ny + h > wa.y + wa.height && !displayBeyond(nx + w / 2, b.y + b.height + 20, disp.id)) {
    ny = wa.y + wa.height - h;
    hits.push({ edge: 'bottom', ix: nx + w / 2, iy: wa.y + wa.height });
  }
  win.setPosition(Math.round(nx) - inset, Math.round(ny) - inset);
  for (const e of [...contact]) {
    if (clearance(e, nx, ny, wa, w, h) >= RELEASE_PX) contact.delete(e);
  }
  const fresh = hits.find((hh) => !contact.has(hh.edge));
  for (const hh of hits) contact.add(hh.edge);
  if (fresh) {
    const sp = dragSpeed();
    if (sp > SLAM_MIN && Date.now() - lastHurtAt > HURT_COOLDOWN_MS) {
      lastHurtAt = Date.now();
      if (onBounce) onBounce({ ...fresh, speed: sp, wa });
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

function setDragging(v) {
  dragging = v;
  if (v) {
    samples = [];
    contact.clear();
    mode = 'drift';
    return;
  }
  adoptCurrentDisplay();
  const now = Date.now();
  const recent = samples.filter((s) => now - s.t < 140);
  samples = [];
  if (!recent.length) return;
  const span = Math.max(0.03, (now - recent[0].t) / 1000);
  let fvx = recent.reduce((a, s) => a + s.dx, 0) / span;
  let fvy = recent.reduce((a, s) => a + s.dy, 0) / span;
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
  getMode: () => mode,
  setOnBounce: (cb) => { onBounce = cb; },
  stop,
};

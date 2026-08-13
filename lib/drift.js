// Lazy water-drift for the goblin window: a damped random walk with a
// buoyant bob, steered to stay in a band near the screen edges. Prefers the
// external display; after a manual drag it adopts whatever display it is on.
const { screen } = require('electron');

const TICK_MS = 50;
const MAX_SPEED = 22;
const BAND = 170;
const MARGIN = 24;

let win = null;
let timer = null;
let display = null;
let px = 0, py = 0, vx = 0, vy = 0, t = 0;
let dragging = false;

function pickDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => !d.internal) || screen.getPrimaryDisplay();
}

function adoptCurrentDisplay() {
  display = screen.getDisplayMatching(win.getBounds());
  const [x, y] = win.getPosition();
  px = x;
  py = y;
  vx = 0;
  vy = 0;
}

function tick() {
  if (!win || win.isDestroyed()) return;
  t += TICK_MS / 1000;
  if (dragging) return;

  const dt = TICK_MS / 1000;
  const wa = display.workArea;
  const [w, h] = win.getSize();
  const cx = px + w / 2;
  const cy = py + h / 2;

  vx += (Math.random() - 0.5) * 14 * dt;
  vy += ((Math.random() - 0.5) * 14 + Math.sin(t * 1.4) * 9) * dt;

  const dl = cx - wa.x;
  const dr = wa.x + wa.width - cx;
  const dtp = cy - wa.y;
  const db = wa.y + wa.height - cy;
  const dMin = Math.min(dl, dr, dtp, db);
  if (dMin > BAND) {
    const pull = 26 * dt;
    if (dMin === dl) vx -= pull;
    else if (dMin === dr) vx += pull;
    else if (dMin === dtp) vy -= pull;
    else vy += pull;
  }

  const push = 60 * dt;
  if (px < wa.x + MARGIN) vx += push;
  if (px + w > wa.x + wa.width - MARGIN) vx -= push;
  if (py < wa.y + MARGIN) vy += push;
  if (py + h > wa.y + wa.height - MARGIN) vy -= push;

  vx *= 0.985;
  vy *= 0.985;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) {
    vx = (vx / speed) * MAX_SPEED;
    vy = (vy / speed) * MAX_SPEED;
  }

  px += vx * dt;
  py += vy * dt;
  px = Math.min(Math.max(px, wa.x + 2), wa.x + wa.width - w - 2);
  py = Math.min(Math.max(py, wa.y + 2), wa.y + wa.height - h - 2);

  const [curX, curY] = win.getPosition();
  const nx = Math.round(px);
  const ny = Math.round(py);
  if (nx !== curX || ny !== curY) win.setPosition(nx, ny);
}

function start(window) {
  win = window;
  display = pickDisplay();
  const wa = display.workArea;
  const [w, h] = win.getSize();
  px = wa.x + wa.width - w - 80;
  py = wa.y + Math.round(wa.height * 0.35);
  win.setPosition(Math.round(px), Math.round(py));
  timer = setInterval(tick, TICK_MS);
}

function setDragging(v) {
  dragging = v;
  if (!v) adoptCurrentDisplay();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, setDragging, stop };

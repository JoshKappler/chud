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

let win = null;
let timer = null;
let display = null;
let px = 0, py = 0, vx = 0, vy = 0, t = 0;
let theta = 0;
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
  const dt = TICK_MS / 1000;
  t += dt;
  if (dragging) return;

  const wa = display.workArea;
  const [w, h] = win.getSize();
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

  const [curX, curY] = win.getPosition();
  const nx = Math.round(px);
  const ny = Math.round(py);
  if (nx !== curX || ny !== curY) win.setPosition(nx, ny);
}

function start(window) {
  win = window;
  display = pickDisplay();
  const wa = display.workArea;
  const [w] = win.getSize();
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

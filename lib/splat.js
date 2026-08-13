// Blood splat windows, pooled and reused: constructing a BrowserWindow per
// hit stalls the main process mid-flurry. Windows are transparent,
// click-through, shown inactive (an activating window steals the drag),
// and hidden again after the page fades out.
const { BrowserWindow } = require('electron');

const SIZE = 260;
const LIFE_MS = 5200;
const POOL = 3;
let pool = [];
let idx = 0;
let lastAt = 0;

function ensurePool() {
  if (pool.length) return;
  for (let i = 0; i < POOL; i++) {
    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      show: false,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
    });
    win.setIgnoreMouseEvents(true);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pool.push({ win, hideTimer: null });
  }
}

function show(edge, ix, iy, wa) {
  const now = Date.now();
  if (now - lastAt < 60) return;
  lastAt = now;
  ensurePool();

  let sx = Math.round(ix - SIZE / 2);
  let sy = Math.round(iy - SIZE / 2);
  if (edge === 'left') sx = wa.x;
  if (edge === 'right') sx = wa.x + wa.width - SIZE;
  if (edge === 'top') sy = wa.y;
  if (edge === 'bottom') sy = wa.y + wa.height - SIZE;
  sx = Math.min(Math.max(sx, wa.x), wa.x + wa.width - SIZE);
  sy = Math.min(Math.max(sy, wa.y), wa.y + wa.height - SIZE);

  const slot = pool[idx++ % POOL];
  if (slot.win.isDestroyed()) return;
  if (slot.hideTimer) clearTimeout(slot.hideTimer);
  slot.win.setBounds({ x: sx, y: sy, width: SIZE, height: SIZE });
  const seed = Math.floor(Math.random() * 1e6);
  slot.win.loadURL(`chud://app/renderer/splat.html?edge=${edge}&seed=${seed}`);
  slot.win.showInactive();
  slot.hideTimer = setTimeout(() => {
    if (!slot.win.isDestroyed()) slot.win.hide();
  }, LIFE_MS);
}

module.exports = { show };

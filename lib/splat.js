// Short-lived blood splat windows: transparent, click-through, spawned at
// an impact point, closed after the page fades itself out.
const { BrowserWindow } = require('electron');

const SIZE = 140;
const LIFE_MS = 5200;
let lastAt = 0;

function show(edge, ix, iy, wa) {
  const now = Date.now();
  if (now - lastAt < 300) return;
  lastAt = now;

  let sx = Math.round(ix - SIZE / 2);
  let sy = Math.round(iy - SIZE / 2);
  if (edge === 'left') sx = wa.x;
  if (edge === 'right') sx = wa.x + wa.width - SIZE;
  if (edge === 'top') sy = wa.y;
  if (edge === 'bottom') sy = wa.y + wa.height - SIZE;
  sx = Math.min(Math.max(sx, wa.x), wa.x + wa.width - SIZE);
  sy = Math.min(Math.max(sy, wa.y), wa.y + wa.height - SIZE);

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x: sx,
    y: sy,
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
  const seed = Math.floor(Math.random() * 1e6);
  win.loadURL(`chud://app/renderer/splat.html?edge=${edge}&seed=${seed}`);
  setTimeout(() => {
    if (!win.isDestroyed()) win.close();
  }, LIFE_MS);
}

module.exports = { show };

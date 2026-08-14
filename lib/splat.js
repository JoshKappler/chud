// Blood overlays: one persistent workArea-sized window per display,
// created at startup and never mid-drag (constructing or showing a
// window during a drag severs the macOS drag session), click-through,
// always on top. Hits are injected into the page, which accumulates any
// number of smears at once and fades each on its own clock.
const { BrowserWindow, screen } = require('electron');

const overlays = new Map();
let lastAt = 0;

function build(display) {
  const wa = display.workArea;
  const win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
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
  win.loadURL('chud://app/renderer/splat.html');
  win.showInactive();
  return win;
}

function init() {
  if (overlays.size) return;
  for (const d of screen.getAllDisplays()) overlays.set(d.id, build(d));
  screen.on('display-added', (e, d) => overlays.set(d.id, build(d)));
  screen.on('display-removed', (e, d) => {
    const w = overlays.get(d.id);
    if (w && !w.isDestroyed()) w.destroy();
    overlays.delete(d.id);
  });
  screen.on('display-metrics-changed', (e, d) => {
    const w = overlays.get(d.id);
    if (w && !w.isDestroyed()) w.setBounds(d.workArea);
  });
}

function show(edge, ix, iy, wa, speed) {
  const now = Date.now();
  if (now - lastAt < 60) return;
  lastAt = now;
  init();
  const disp = screen.getDisplayMatching({ x: Math.round(ix), y: Math.round(iy), width: 1, height: 1 });
  const win = overlays.get(disp.id);
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const spec = {
    edge,
    x: Math.round(ix - b.x),
    y: Math.round(iy - b.y),
    sp: Math.round(speed || 0),
    seed: Math.floor(Math.random() * 1e6),
  };
  win.webContents.executeJavaScript('addSplat(' + JSON.stringify(spec) + ')', true).catch(() => {});
}

module.exports = { show, init };

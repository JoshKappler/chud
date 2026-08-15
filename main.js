const { app, BrowserWindow, ipcMain, Menu, protocol, net, screen, systemPreferences, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const session = require('./lib/session');
const tools = require('./lib/tools');
const wakewatch = require('./lib/wakewatch');
const drift = require('./lib/drift');
const splat = require('./lib/splat');

const ROOT = __dirname;
const SCREENSHOT = process.env.CHUD_SCREENSHOT || '';

function loadEnvFile() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

loadEnvFile();
const config = loadConfig();
// open(1) launches without the caller's env, so debug also arms via a
// marker file; the log goes to a file because launchd owns stdout.
const DEBUG = !!process.env.CHUD_DEBUG || fs.existsSync('/tmp/chud-debug-on');
const dbgLog = (m) => { try { fs.appendFileSync('/tmp/chud-debug.log', m + '\n'); } catch (e) { /* debug only */ } };

protocol.registerSchemesAsPrivileged([
  { scheme: 'chud', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let dragging = false;

// The goblin head is 28 cells, centered in an 84-cell window; the margin
// is transparent room for the G-force stretch tail, so the visible head
// square sits pad px in from every window edge.
function createWindow() {
  const scale = config.spriteScale || 4;
  const pad = 28 * scale;
  const side = 84 * scale;
  win = new BrowserWindow({
    width: side,
    height: side,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const pose = process.env.CHUD_POSE || '';
  const badge = process.env.CHUD_BADGE || '';
  const emote = encodeURIComponent(process.env.CHUD_EMOTE || '');
  const damage = process.env.CHUD_DAMAGE || '';
  const page = process.env.CHUD_PAGE || 'index';
  const edge = process.env.CHUD_EDGE || 'punch';
  const qs = SCREENSHOT ? `?pose=${pose}&badge=${badge}&emote=${emote}&damage=${damage}&edge=${edge}&seed=7`
    : (DEBUG ? '?debug=1' : '');
  if (DEBUG) win.webContents.on('console-message', (e, l, m) => dbgLog('[r] ' + m));
  win.loadURL(`chud://app/renderer/${page}.html${qs}`);
  if (!SCREENSHOT) {
    drift.start(win, pad);
    startCursorPoll(pad);
  }

  if (SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SCREENSHOT, img.toPNG());
        app.quit();
      }, 1200);
    });
  }
}

// Only the head square should catch the mouse; the transparent margin
// passes clicks through. Dragging keeps the window interactive so a
// cursor that outruns the chasing window cannot sever the drag.
function startCursorPoll(pad) {
  let ignoring = false;
  let lastFlip = 0;
  const HYST = 6;
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const c = screen.getCursorScreenPoint();
    const b = win.getBounds();
    // Each flip re-hit-tests the window under the pointer, which macOS
    // answers by re-resolving the cursor; a pointer resting on the
    // boundary would otherwise flip every tick and flicker the cursor.
    const m = ignoring ? HYST : -HYST;
    const over = c.x >= b.x + pad + m && c.x < b.x + b.width - pad - m
      && c.y >= b.y + pad + m && c.y < b.y + b.height - pad - m;
    const want = !over && !dragging;
    const now = Date.now();
    if (want !== ignoring && now - lastFlip > 100) {
      ignoring = want;
      lastFlip = now;
      win.setIgnoreMouseEvents(want);
      if (DEBUG) dbgLog(`[ignore] ${want}`);
    }
  }, 16);
}

app.whenReady().then(async () => {
  // macOS App Nap coalesces main-process timers to ~100ms when the app
  // looks inactive, and a frameless never-activated window counts as
  // inactive; the drift tick and drag poll live on those timers, so a
  // napped goblin flies and drags at 10fps.
  powerSaveBlocker.start('prevent-app-suspension');
  if (DEBUG) {
    let hb = Date.now();
    let worst = 0;
    let n = 0;
    setInterval(() => {
      const t = Date.now();
      const gap = t - hb;
      hb = t;
      if (gap > worst) worst = gap;
      if (++n >= 120) {
        dbgLog(`[tick8] worst=${worst}ms`);
        worst = 0;
        n = 0;
      }
    }, 8);
  }
  protocol.handle('chud', (req) => {
    const url = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  if (!SCREENSHOT && process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  tools.setNotify((payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('agent-done', payload);
  });
  drift.setOnBounce((hit) => {
    splat.show(hit.edge, hit.ix, hit.iy, hit.wa, hit.speed);
    if (win && !win.isDestroyed()) {
      const wall = hit.edge === 'left' || hit.edge === 'right' ? hit.ix : hit.iy;
      win.webContents.send('bounce-hurt', { speed: hit.speed, edge: hit.edge, wall });
    }
  });

  createWindow();
  const noSplat = process.env.CHUD_NOSPLAT || fs.existsSync('/tmp/chud-nosplat-on');
  if (!SCREENSHOT && !noSplat) splat.init();
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('mint-session', () => session.mint(config, tools.schemas()));
ipcMain.handle('tool-call', (e, { name, args }) => tools.execute(name, args || {}, config));
ipcMain.handle('get-config', () => ({ ...config, screenshotMode: !!SCREENSHOT }));

ipcMain.on('wake-start', () => {
  if (config.wakeEngine !== 'local') {
    wakewatch.start(config, () => {
      if (win && !win.isDestroyed()) win.webContents.send('wake-detected');
    });
  }
});
ipcMain.on('wake-audio', (e, buf) => wakewatch.append(buf));
ipcMain.on('drag-tick', () => drift.dragTick());
ipcMain.on('drag-state', (e, v) => {
  dragging = !!v;
  drift.setDragging(dragging);
});
ipcMain.handle('win-grab', () => {
  const wasFlinging = drift.getMode() === 'fling';
  dragging = true;
  drift.setDragging(true);
  return { wasFlinging };
});
app.on('before-quit', () => {
  wakewatch.stop();
  drift.stop();
});

ipcMain.on('splat-here', () => {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  splat.show('punch', b.x + b.width / 2, b.y + b.height / 2, wa);
});

ipcMain.on('goblin-menu', (e, state) => {
  const menu = Menu.buildFromTemplate([
    {
      label: state && state.muted ? 'Unmute wake word' : 'Mute wake word',
      click: () => win.webContents.send('menu-cmd', 'toggle-mute'),
    },
    {
      label: 'End session',
      enabled: !!(state && state.connected),
      click: () => win.webContents.send('menu-cmd', 'disconnect'),
    },
    { type: 'separator' },
    { label: 'Quit Chud', role: 'quit' },
  ]);
  menu.popup({ window: win });
});

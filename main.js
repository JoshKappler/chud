const { app, BrowserWindow, ipcMain, Menu, protocol, net, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const session = require('./lib/session');
const tools = require('./lib/tools');
const wakewatch = require('./lib/wakewatch');
const drift = require('./lib/drift');
const oneshot = require('./lib/oneshot');

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

protocol.registerSchemesAsPrivileged([
  { scheme: 'chud', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;

function createWindow() {
  const side = 28 * (config.spriteScale || 4);
  win = new BrowserWindow({
    width: side,
    height: side,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const pose = process.env.CHUD_POSE || '';
  const badge = process.env.CHUD_BADGE || '';
  const emote = encodeURIComponent(process.env.CHUD_EMOTE || '');
  const damage = process.env.CHUD_DAMAGE || '';
  const qs = SCREENSHOT ? `?pose=${pose}&badge=${badge}&emote=${emote}&damage=${damage}` : '';
  win.loadURL(`chud://app/renderer/index.html${qs}`);
  if (!SCREENSHOT) drift.start(win);

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

app.whenReady().then(async () => {
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

  createWindow();
});

app.on('window-all-closed', () => app.quit());

ipcMain.handle('mint-session', () => session.mint(config, tools.schemas()));
ipcMain.handle('tool-call', (e, { name, args }) => tools.execute(name, args || {}, config));
ipcMain.handle('get-config', () => ({ ...config, screenshotMode: !!SCREENSHOT }));
ipcMain.handle('oneshot-say', (e, text) =>
  oneshot.speak(String(text), config, {
    onChunk: (b64) => {
      if (win && !win.isDestroyed()) win.webContents.send('tts-pcm', b64);
    },
  })
);

ipcMain.on('wake-start', () => {
  if (config.wakeEngine !== 'local') {
    wakewatch.start(config, () => {
      if (win && !win.isDestroyed()) win.webContents.send('wake-detected');
    });
  }
});
ipcMain.on('wake-audio', (e, buf) => wakewatch.append(buf));
ipcMain.on('drag-state', (e, v) => drift.setDragging(!!v));
app.on('before-quit', () => {
  wakewatch.stop();
  drift.stop();
});

ipcMain.on('win-move-by', (e, { dx, dy }) => {
  if (!win) return;
  drift.noteMove(dx, dy);
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chud', {
  mint: () => ipcRenderer.invoke('mint-session'),
  tool: (name, args) => ipcRenderer.invoke('tool-call', { name, args }),
  getConfig: () => ipcRenderer.invoke('get-config'),
  moveBy: (dx, dy) => ipcRenderer.send('win-move-by', { dx, dy }),
  dragState: (v) => ipcRenderer.send('drag-state', v),
  menu: (state) => ipcRenderer.send('goblin-menu', state),
  onAgentDone: (cb) => ipcRenderer.on('agent-done', (e, d) => cb(d)),
  onMenuCmd: (cb) => ipcRenderer.on('menu-cmd', (e, d) => cb(d)),
  wakeStart: () => ipcRenderer.send('wake-start'),
  onBounceHurt: (cb) => ipcRenderer.on('bounce-hurt', () => cb()),
  wakeAudio: (buf) => ipcRenderer.send('wake-audio', buf),
  onWakeDetected: (cb) => ipcRenderer.on('wake-detected', () => cb()),
});

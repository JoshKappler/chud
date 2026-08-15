const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chud', {
  mint: () => ipcRenderer.invoke('mint-session'),
  tool: (name, args) => ipcRenderer.invoke('tool-call', { name, args }),
  getConfig: () => ipcRenderer.invoke('get-config'),
  dragState: (v) => ipcRenderer.send('drag-state', v),
  dragTick: () => ipcRenderer.send('drag-tick'),
  grab: () => ipcRenderer.invoke('win-grab'),
  splat: () => ipcRenderer.send('splat-here'),
  menu: (state) => ipcRenderer.send('goblin-menu', state),
  onAgentDone: (cb) => ipcRenderer.on('agent-done', (e, d) => cb(d)),
  onMenuCmd: (cb) => ipcRenderer.on('menu-cmd', (e, d) => cb(d)),
  wakeStart: () => ipcRenderer.send('wake-start'),
  onBounceHurt: (cb) => ipcRenderer.on('bounce-hurt', (e, d) => cb(d)),
  wakeAudio: (buf) => ipcRenderer.send('wake-audio', buf),
  onWakeDetected: (cb) => ipcRenderer.on('wake-detected', () => cb()),
});

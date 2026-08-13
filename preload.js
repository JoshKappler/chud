const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chud', {
  mint: () => ipcRenderer.invoke('mint-session'),
  tool: (name, args) => ipcRenderer.invoke('tool-call', { name, args }),
  getConfig: () => ipcRenderer.invoke('get-config'),
  moveBy: (dx, dy) => ipcRenderer.send('win-move-by', { dx, dy }),
  menu: (state) => ipcRenderer.send('goblin-menu', state),
  onAgentDone: (cb) => ipcRenderer.on('agent-done', (e, d) => cb(d)),
  onMenuCmd: (cb) => ipcRenderer.on('menu-cmd', (e, d) => cb(d)),
});

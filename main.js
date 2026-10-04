const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

// Memory trimming: software rendering + GPU merged into the main process
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=32');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,MediaRouter,TranslateUI');

const BASE = { w: 680, h: 320 };
// Portable builds run from a temp folder, so autostart must point at the real .exe
const EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
let win, start, saveTimer;
let cfg = { h24: false, scale: 1, x: null, y: null };
const cfgFile = () => path.join(app.getPath('userData'), 'settings.json');
const save = () => fs.writeFileSync(cfgFile(), JSON.stringify(cfg));

function apply() {
  const { x, y } = win.getBounds();
  win.webContents.setZoomFactor(cfg.scale);
  win.setBounds({ x, y, width: Math.round(BASE.w * cfg.scale), height: Math.round(BASE.h * cfg.scale) });
  win.webContents.send('cfg', cfg);
}

app.whenReady().then(() => {
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch {}
  const wa = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.round(BASE.w * cfg.scale), height: Math.round(BASE.h * cfg.scale),
    x: cfg.x ?? Math.round((wa.width - BASE.w) / 3),
    y: cfg.y ?? Math.round((wa.height - BASE.h) / 2),
    transparent: true, frame: false, resizable: false, skipTaskbar: true,
    hasShadow: false, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false },
  });
  win.loadFile('index.html');
  win.webContents.once('did-finish-load', () => { apply(); win.show(); });
  win.on('move', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { [cfg.x, cfg.y] = win.getPosition(); save(); }, 400);
  });

  ipcMain.on('drag-start', () => { start = win.getBounds(); });
  ipcMain.on('drag', (_e, dx, dy) => {
    if (start) win.setBounds({ x: start.x + dx, y: start.y + dy, width: start.width, height: start.height });
  });
  ipcMain.on('menu', () => {
    Menu.buildFromTemplate([
      { label: '24-hour clock', type: 'checkbox', checked: cfg.h24,
        click: (i) => { cfg.h24 = i.checked; save(); apply(); } },
      { label: 'Size', submenu: [0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => ({
        label: `${s * 100}%`, type: 'radio', checked: cfg.scale === s,
        click: () => { cfg.scale = s; save(); apply(); } })) },
      { label: 'Start with Windows', type: 'checkbox',
        checked: app.getLoginItemSettings({ path: EXE }).openAtLogin,
        click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, path: EXE }) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]).popup({ window: win });
  });
});

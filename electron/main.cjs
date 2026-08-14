const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow;
let miniWindow;
let tray;
let quitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

const isDev = !app.isPackaged;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function windowMaterial(win) {
  if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
    try { win.setBackgroundMaterial('acrylic'); } catch { /* Win10/CSS fallback */ }
  }
}

function createMainWindow() {
  const testWidth = Number(process.env.TOMATO_TEST_WIDTH) || 1060;
  const testHeight = Number(process.env.TOMATO_TEST_HEIGHT) || 760;
  mainWindow = new BrowserWindow({
    width: testWidth,
    height: testHeight,
    minWidth: 430,
    minHeight: 640,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    autoHideMenuBar: true,
    title: 'JJtomato',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windowMaterial(mainWindow);
  const url = isDev ? 'http://127.0.0.1:5173' : `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    if (process.env.TOMATO_MINI_DBLCLICK_TEST) {
      createMiniWindow();
      miniWindow.webContents.once('did-finish-load', async () => {
        await miniWindow.webContents.executeJavaScript("document.querySelector('.mini-return-zone')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
        await new Promise((resolve) => setTimeout(resolve, 500));
        fs.writeFileSync(process.env.TOMATO_MINI_DBLCLICK_TEST, JSON.stringify({
          mainVisible: mainWindow.isVisible(),
          miniVisible: miniWindow?.isVisible() ?? false,
        }, null, 2));
        app.quit();
      });
    }
    if (process.env.TOMATO_CAPTURE) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(process.env.TOMATO_CAPTURE, image.toPNG());
      app.quit();
    }
    if (process.env.TOMATO_LAYOUT_REPORT) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await mainWindow.webContents.executeJavaScript(`document.querySelector('.footer-actions button:last-child')?.click()`);
      await new Promise((resolve) => setTimeout(resolve, 450));
      const report = await mainWindow.webContents.executeJavaScript(`(() => {
        const rect = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
        };
        const all = (selector) => [...document.querySelectorAll(selector)].map((el) => ({
          text: el.textContent.trim(), ...rectFor(el)
        }));
        function rectFor(el) { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; }
        return {
          viewport: { width: innerWidth, height: innerHeight },
          ring: rect('.timer-safe-zone'),
          actions: rect('.timer-actions'),
          modeButtons: all('.mode-switcher button'),
          settingsButton: rect('.footer-actions button:last-child'),
          settingsSheet: rect('.settings-sheet'),
          bodyScroll: { width: document.body.scrollWidth, height: document.body.scrollHeight },
        };
      })()`);
      fs.writeFileSync(process.env.TOMATO_LAYOUT_REPORT, JSON.stringify(report, null, 2));
      app.quit();
    }
  });
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  miniWindow = new BrowserWindow({
    width: 180,
    height: 180,
    minWidth: 104,
    minHeight: 104,
    maxWidth: 360,
    maxHeight: 360,
    x: area.x + area.width - 220,
    y: area.y + 48,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const base = isDev ? 'http://127.0.0.1:5173' : `file://${path.join(__dirname, '../dist/index.html')}`;
  miniWindow.loadURL(`${base}#mini`);
  miniWindow.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '小窗大小', enabled: false },
      { label: '小（128 × 128）', click: () => resizeMiniWindow(128) },
      { label: '中（180 × 180）', click: () => resizeMiniWindow(180) },
      { label: '大（240 × 240）', click: () => resizeMiniWindow(240) },
      { label: '特大（320 × 320）', click: () => resizeMiniWindow(320) },
    ]);
    menu.popup({ window: miniWindow });
  });
  miniWindow.on('closed', () => { miniWindow = null; });
}

function resizeMiniWindow(size) {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const safe = Math.max(104, Math.min(360, Number(size) || 180));
  const [x, y] = miniWindow.getPosition();
  miniWindow.setBounds({ x, y, width: safe, height: safe });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.ico'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('JJtomato');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '打开置顶小窗', click: createMiniWindow },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

if (gotSingleInstanceLock) app.whenReady().then(() => {
  createMainWindow();
  createTray();

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:close', () => mainWindow?.hide());
  ipcMain.handle('window:set-opacity', (_event, value) => {
    const opacity = Math.max(0.65, Math.min(1, Number(value) || 1));
    mainWindow?.setOpacity(opacity);
    miniWindow?.setOpacity(opacity);
    return opacity;
  });
  ipcMain.handle('window:resize-mini', (_event, size) => {
    resizeMiniWindow(size);
    return miniWindow?.getSize() ?? null;
  });
  ipcMain.handle('window:open-mini', () => { createMiniWindow(); mainWindow?.hide(); });
  ipcMain.handle('window:restore-main', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    miniWindow?.hide();
    return true;
  });
  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); });
  ipcMain.handle('app:notify', (_event, payload) => {
    if (Notification.isSupported()) new Notification(payload).show();
  });
  ipcMain.handle('store:settings', (_event, settings) => {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('store:load-settings', () => {
    try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
    catch { return null; }
  });
  ipcMain.on('timer:state', (_event, state) => miniWindow?.webContents.send('timer:state', state));
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => { quitting = true; });

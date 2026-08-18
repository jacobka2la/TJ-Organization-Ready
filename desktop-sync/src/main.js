const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startSync } = require('./sync');

let mainWindow;

function statusHtml(root) {
  const safeRoot = root.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>TJ Organization Sync</title><style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f8;color:#171717;margin:0;padding:32px}
  .card{max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:18px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.06)}
  h1{margin:0 0 8px;font-size:25px}p{line-height:1.5;color:#555}.path{padding:12px 14px;background:#f2f2f3;border-radius:10px;font-family:monospace;word-break:break-all}.ok{display:inline-block;background:#e9f8ef;color:#137333;padding:6px 10px;border-radius:999px;font-weight:650;font-size:13px}button{margin-top:14px;border:0;border-radius:10px;padding:11px 15px;background:#171717;color:white;cursor:pointer}</style></head><body><div class="card"><span class="ok">Sync running</span><h1>TJ Organization</h1><p>Your client files are syncing both ways with the TJ Organization website.</p><div class="path">${safeRoot}</div><button onclick="location.href='tj-open-folder:'">Open TJ Organization Folder</button><p>Keep this app running while you work. Changes from the website are checked automatically, and local file changes are sent back to TJ Organization.</p></div></body></html>`;
}

app.whenReady().then(async () => {
  const syncRoot = path.join(app.getPath('documents'), 'TJ Organization');
  fs.mkdirSync(syncRoot, { recursive: true });

  mainWindow = new BrowserWindow({ width: 760, height: 520, resizable: true, webPreferences: { contextIsolation: true, sandbox: true } });
  mainWindow.removeMenu();
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(statusHtml(syncRoot))}`);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === 'tj-open-folder:') {
      event.preventDefault();
      shell.openPath(syncRoot);
    }
  });

  try {
    await startSync(syncRoot, app.getPath('userData'));
  } catch (error) {
    console.error('TJ Organization sync failed to start:', error);
    mainWindow.webContents.executeJavaScript(`document.querySelector('.ok').textContent='Sync error'; document.querySelector('.ok').style.color='#b3261e'; document.querySelector('.ok').style.background='#fce8e6';`);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

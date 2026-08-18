const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { startSync } = require('./sync');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

let mainWindow;
let tray;
let syncStarted = false;
let syncRoot;
let authClient;
let quitting = false;

function getSupabaseConfig() {
  const url = process.env.TJ_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.TJ_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing TJ_SUPABASE_URL/TJ_SUPABASE_ANON_KEY in desktop-sync/.env');
  return { url, key };
}

function sessionPath() { return path.join(app.getPath('userData'), 'tj-session.bin'); }
async function saveSession(session) {
  const raw = Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(raw.toString('utf8')) : raw;
  await fsp.writeFile(sessionPath(), data, { mode: 0o600 });
}
async function loadSession() {
  try {
    const data = await fsp.readFile(sessionPath());
    const raw = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
    return JSON.parse(raw);
  } catch { return null; }
}
async function clearSession() { await fsp.rm(sessionPath(), { force: true }).catch(() => {}); }

function createAuthClient() {
  const { url, key } = getSupabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
}

async function startAuthenticatedSync(session) {
  if (syncStarted) return;
  const { data, error } = await authClient.auth.setSession(session);
  if (error || !data.session) throw error || new Error('Saved login expired.');
  await saveSession(data.session);

  authClient.auth.onAuthStateChange(async (_event, nextSession) => {
    if (nextSession) await saveSession(nextSession).catch(console.error);
  });

  // Pass the authenticated Supabase session directly to the sync client.
  // This avoids relying on global.fetch, which does not exist in Electron 22 / Node 16.
  await startSync(syncRoot, app.getPath('userData'), data.session);
  syncStarted = true;
  updateTray();
}

function loginHtml(root, running = false) {
  const safeRoot = root.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>TJY Law</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f8;color:#171717;margin:0;padding:32px}.card{max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:18px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.06)}h1{margin:0 0 8px;font-size:25px}p{line-height:1.5;color:#555}.path{padding:12px 14px;background:#f2f2f3;border-radius:10px;font-family:monospace;word-break:break-all;margin:14px 0}.status{display:inline-block;background:#eef1f4;color:#555;padding:6px 10px;border-radius:999px;font-weight:650;font-size:13px}.row{display:grid;gap:10px;margin-top:18px}input{font:inherit;padding:11px 12px;border:1px solid #d8d8dc;border-radius:10px}button{border:0;border-radius:10px;padding:11px 15px;background:#171717;color:white;cursor:pointer;font-weight:650}.secondary{background:#ececef;color:#171717}.error{color:#b3261e;min-height:20px;margin:8px 0 0;font-size:14px}</style></head><body><div class="card"><span class="status" id="status">${running ? 'Sync running' : 'Login required'}</span><h1>TJY Law</h1><div class="row" id="loginForm" style="display:${running ? 'none' : 'grid'}"><p>Sign in once with your TJ Organization account. This computer will stay signed in.</p><input id="email" type="email" autocomplete="username" placeholder="Email"><input id="password" type="password" autocomplete="current-password" placeholder="Password"><button id="loginButton">Sign In & Start Sync</button><div class="error" id="error"></div></div><div id="running" style="display:${running ? 'block' : 'none'}"><p>Your client files are syncing automatically in the background.</p><div class="path">${safeRoot}</div><button id="openFolder">Open TJY Law Folder</button><button class="secondary" id="hide" style="margin-left:8px">Run in Background</button></div></div><script>const email=document.getElementById('email'),password=document.getElementById('password'),button=document.getElementById('loginButton'),error=document.getElementById('error'),status=document.getElementById('status');async function login(){error.textContent='';button.disabled=true;button.textContent='Signing in...';const result=await window.tjDesktop.login(email.value.trim(),password.value);if(!result.ok){error.textContent=result.error||'Could not sign in.';button.disabled=false;button.textContent='Sign In & Start Sync';return;}status.textContent='Sync running';document.getElementById('loginForm').style.display='none';document.getElementById('running').style.display='block';}button?.addEventListener('click',login);password?.addEventListener('keydown',e=>{if(e.key==='Enter')login();});document.getElementById('openFolder')?.addEventListener('click',()=>window.tjDesktop.openFolder());document.getElementById('hide')?.addEventListener('click',()=>window.tjDesktop.hide());</script></body></html>`;
}

function showWindow() { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }
function updateTray() {
  if (!tray) return;
  tray.setToolTip(syncStarted ? 'TJY Law — Up to date' : 'TJY Law');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: syncStarted ? '✓ Sync running' : 'Login required', enabled: false },
    { label: 'Open TJY Law Folder', click: () => shell.openPath(syncRoot) },
    { label: 'Open Sync App', click: showWindow },
    { type: 'separator' },
    { label: 'Quit TJY Law', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  updateTray();
  tray.on('click', showWindow);
}

ipcMain.handle('tj-open-folder', async () => { if (syncRoot) await shell.openPath(syncRoot); return { ok: true }; });
ipcMain.handle('tj-hide', async () => { mainWindow?.hide(); return { ok: true }; });
ipcMain.handle('tj-login', async (_event, credentials) => {
  try {
    if (syncStarted) return { ok: true };
    const email = String(credentials?.email || '').trim();
    const password = String(credentials?.password || '');
    if (!email || !password) return { ok: false, error: 'Enter your TJ Organization email and password.' };
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return { ok: false, error: error?.message || 'Could not sign in.' };
    await saveSession(data.session);
    await startAuthenticatedSync(data.session);
    return { ok: true };
  } catch (error) { console.error('TJY Law login/sync failed:', error); return { ok: false, error: error instanceof Error ? error.message : 'Could not start sync.' }; }
});

if (gotSingleInstanceLock) {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    const documentsDir = app.getPath('documents');
    const oldRoot = path.join(documentsDir, 'TJ Organization');
    syncRoot = path.join(documentsDir, 'TJY Law');

    if (fs.existsSync(oldRoot) && !fs.existsSync(syncRoot)) {
      try {
        await fsp.cp(oldRoot, syncRoot, { recursive: true, force: false, errorOnExist: false });
      } catch (error) {
        console.error('Could not copy old TJ Organization folder into TJY Law:', error);
      }
    }
    fs.mkdirSync(syncRoot, { recursive: true });
    authClient = createAuthClient();

    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

    mainWindow = new BrowserWindow({ width:760,height:560,resizable:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:false,nodeIntegration:false} });
    mainWindow.removeMenu();
    mainWindow.on('close', e => { if (!quitting) { e.preventDefault(); mainWindow.hide(); } });
    createTray();

    const saved = await loadSession();
    if (saved) {
      try { await startAuthenticatedSync(saved); mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(syncRoot,true))}`); }
      catch (e) { console.error('Saved session recovery failed:', e); await clearSession(); mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(syncRoot,false))}`); mainWindow.show(); }
    } else {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(syncRoot,false))}`);
      mainWindow.show();
    }
  });
}

app.on('activate', showWindow);
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; });

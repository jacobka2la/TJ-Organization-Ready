const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { startSync } = require('./sync');

let mainWindow;
let syncStarted = false;
let syncRoot;

function getSupabaseConfig() {
  const url = process.env.TJ_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.TJ_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing TJ_SUPABASE_URL/TJ_SUPABASE_ANON_KEY in desktop-sync/.env');
  return { url, key };
}

function loginHtml(root) {
  const safeRoot = root.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>TJ Organization Sync</title><style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f8;color:#171717;margin:0;padding:32px}
  .card{max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:18px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.06)}
  h1{margin:0 0 8px;font-size:25px}p{line-height:1.5;color:#555}.path{padding:12px 14px;background:#f2f2f3;border-radius:10px;font-family:monospace;word-break:break-all;margin:14px 0}.status{display:inline-block;background:#eef1f4;color:#555;padding:6px 10px;border-radius:999px;font-weight:650;font-size:13px}.row{display:grid;gap:10px;margin-top:18px}input{font:inherit;padding:11px 12px;border:1px solid #d8d8dc;border-radius:10px;outline:none}input:focus{border-color:#777}button{border:0;border-radius:10px;padding:11px 15px;background:#171717;color:white;cursor:pointer;font-weight:650}.secondary{background:#ececef;color:#171717}.error{color:#b3261e;min-height:20px;margin:8px 0 0;font-size:14px}</style></head><body><div class="card"><span class="status" id="status">Login required</span><h1>TJ Organization</h1><p>Sign in with the same email and password you use on the TJ Organization website.</p><div class="row" id="loginForm"><input id="email" type="email" autocomplete="username" placeholder="Email"><input id="password" type="password" autocomplete="current-password" placeholder="Password"><button id="loginButton">Sign In & Start Sync</button><div class="error" id="error"></div></div><div id="running" style="display:none"><p>Your client files are syncing both ways with the TJ Organization website.</p><div class="path">${safeRoot}</div><button id="openFolder">Open TJ Organization Folder</button><p>Keep this app running while you work.</p></div></div><script>
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const button = document.getElementById('loginButton');
  const error = document.getElementById('error');
  const status = document.getElementById('status');
  async function login(){
    error.textContent='';
    button.disabled=true;
    button.textContent='Signing in...';
    const result = await window.tjDesktop.login(email.value.trim(), password.value);
    if(!result.ok){ error.textContent=result.error || 'Could not sign in.'; button.disabled=false; button.textContent='Sign In & Start Sync'; return; }
    status.textContent='Sync running'; status.style.background='#e9f8ef'; status.style.color='#137333';
    document.getElementById('loginForm').style.display='none';
    document.getElementById('running').style.display='block';
  }
  button.addEventListener('click', login);
  password.addEventListener('keydown', (e)=>{ if(e.key==='Enter') login(); });
  document.getElementById('openFolder').addEventListener('click', ()=>window.tjDesktop.openFolder());
</script></body></html>`;
}

ipcMain.handle('tj-open-folder', async () => {
  if (syncRoot) await shell.openPath(syncRoot);
  return { ok: true };
});

ipcMain.handle('tj-login', async (_event, credentials) => {
  try {
    if (syncStarted) return { ok: true };
    const email = String(credentials?.email || '').trim();
    const password = String(credentials?.password || '');
    if (!email || !password) return { ok: false, error: 'Enter your TJ Organization email and password.' };

    const { url, key } = getSupabaseConfig();
    const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false, error: 'Signed in, but no session token was returned.' };

    // The sync engine uses the normal publishable key. Attach this signed-in user's
    // access token to its database/storage requests so existing RLS policies apply.
    const nativeFetch = global.fetch.bind(global);
    global.fetch = (input, init = {}) => {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${accessToken}`);
      return nativeFetch(input, { ...init, headers });
    };

    await startSync(syncRoot, app.getPath('userData'));
    syncStarted = true;
    return { ok: true };
  } catch (error) {
    console.error('TJ Organization login/sync failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Could not start sync.' };
  }
});

app.whenReady().then(async () => {
  syncRoot = path.join(app.getPath('documents'), 'TJ Organization');
  fs.mkdirSync(syncRoot, { recursive: true });

  mainWindow = new BrowserWindow({
    width: 760,
    height: 560,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(syncRoot))}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

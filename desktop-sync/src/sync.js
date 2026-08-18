const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const mime = require('mime-types');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BUCKET = 'client-files';
const POLL_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitize = (name) => String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim() || 'Unnamed';
const clientName = (c) => sanitize([c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed Client');
const rel = (root, full) => path.relative(root, full).split(path.sep).join('/');

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }
async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }
async function fileHash(p) {
  const data = await fsp.readFile(p);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function createSupabase() {
  const url = process.env.TJ_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.TJ_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing TJ_SUPABASE_URL/TJ_SUPABASE_ANON_KEY in desktop-sync/.env');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadManifest(manifestPath) {
  try { return JSON.parse(await fsp.readFile(manifestPath, 'utf8')); }
  catch { return { files: {}, folders: {}, clients: {}, version: 1 }; }
}
async function saveManifest(manifestPath, manifest) {
  await ensureDir(path.dirname(manifestPath));
  const tmp = `${manifestPath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(manifest, null, 2));
  await fsp.rename(tmp, manifestPath);
}

async function getRemoteState(supabase) {
  const [clientsRes, foldersRes, filesRes] = await Promise.all([
    supabase.from('clients').select('*').is('deleted_at', null),
    supabase.from('folders').select('*').is('deleted_at', null),
    supabase.from('files').select('*').is('deleted_at', null),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (foldersRes.error) throw foldersRes.error;
  if (filesRes.error) throw filesRes.error;
  return { clients: clientsRes.data || [], folders: foldersRes.data || [], files: filesRes.data || [] };
}

function buildMaps(state) {
  return {
    clients: new Map(state.clients.map((x) => [x.id, x])),
    folders: new Map(state.folders.map((x) => [x.id, x])),
    files: new Map(state.files.map((x) => [x.id, x])),
  };
}

function remoteLocalPath(root, maps, file) {
  const client = maps.clients.get(file.client_id);
  if (!client) return null;
  const base = path.join(root, clientName(client));
  if (file.is_extra_file || !file.folder_id) return path.join(base, 'Extra Files', sanitize(file.name));
  const folder = maps.folders.get(file.folder_id);
  if (!folder) return path.join(base, 'Extra Files', sanitize(file.name));
  return path.join(base, sanitize(folder.name), sanitize(file.name));
}

async function downloadRemoteFile(supabase, storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  await ensureDir(path.dirname(localPath));
  await fsp.writeFile(localPath, bytes);
}

async function pullRemote(root, manifestPath, manifest, suppress, supabase) {
  const state = await getRemoteState(supabase);
  const maps = buildMaps(state);
  const liveFileIds = new Set();
  const liveFolderIds = new Set();
  const liveClientIds = new Set();

  for (const client of state.clients) {
    const clientDir = path.join(root, clientName(client));
    await ensureDir(clientDir);
    liveClientIds.add(client.id);
    manifest.clients[client.id] = rel(root, clientDir);
  }

  for (const folder of state.folders) {
    const client = maps.clients.get(folder.client_id);
    if (!client) continue;
    const folderDir = path.join(root, clientName(client), sanitize(folder.name));
    await ensureDir(folderDir);
    liveFolderIds.add(folder.id);
    manifest.folders[folder.id] = rel(root, folderDir);
  }

  for (const file of state.files) {
    const localPath = remoteLocalPath(root, maps, file);
    if (!localPath) continue;
    liveFileIds.add(file.id);
    const localRel = rel(root, localPath);
    const old = manifest.files[file.id];

    if (old && old.path !== localRel) {
      const oldPath = path.join(root, ...old.path.split('/'));
      if (await exists(oldPath) && !(await exists(localPath))) {
        suppress.add(old.path);
        suppress.add(localRel);
        await ensureDir(path.dirname(localPath));
        await fsp.rename(oldPath, localPath).catch(() => {});
      }
    }

    const shouldDownload = !(await exists(localPath)) || !old || old.updated_at !== file.updated_at;
    if (shouldDownload) {
      suppress.add(localRel);
      await downloadRemoteFile(supabase, file.storage_path, localPath);
    }
    manifest.files[file.id] = { path: localRel, storage_path: file.storage_path, updated_at: file.updated_at, hash: await fileHash(localPath) };
  }

  for (const [id, item] of Object.entries(manifest.files)) {
    if (!liveFileIds.has(id)) {
      const p = path.join(root, ...item.path.split('/'));
      if (await exists(p)) {
        suppress.add(item.path);
        await fsp.rm(p, { force: true });
      }
      delete manifest.files[id];
    }
  }
  for (const id of Object.keys(manifest.folders)) if (!liveFolderIds.has(id)) delete manifest.folders[id];
  for (const id of Object.keys(manifest.clients)) if (!liveClientIds.has(id)) delete manifest.clients[id];
  await saveManifest(manifestPath, manifest);
  return state;
}

function findClientByRel(manifest, parts) {
  if (!parts.length) return null;
  const target = parts[0];
  return Object.entries(manifest.clients).find(([, p]) => p === target)?.[0] || null;
}
function findFolderByRel(manifest, parts) {
  if (parts.length < 2 || parts[1] === 'Extra Files') return null;
  const target = `${parts[0]}/${parts[1]}`;
  return Object.entries(manifest.folders).find(([, p]) => p === target)?.[0] || null;
}
function manifestFileAt(manifest, relativePath) {
  return Object.entries(manifest.files).find(([, v]) => v.path === relativePath) || null;
}

async function uploadNewLocalFile(root, fullPath, manifestPath, manifest, supabase) {
  const relativePath = rel(root, fullPath);
  const parts = relativePath.split('/');
  if (parts.length < 3) return;
  const clientId = findClientByRel(manifest, parts);
  if (!clientId) return;
  const isExtra = parts[1] === 'Extra Files';
  const folderId = isExtra ? null : findFolderByRel(manifest, parts);
  if (!isExtra && !folderId) return;

  const buf = await fsp.readFile(fullPath);
  const safeName = sanitize(path.basename(fullPath)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const folderPart = isExtra ? 'extra-files' : folderId;
  const storagePath = `${clientId}/${folderPart}/${crypto.randomUUID()}-${safeName}`;
  const contentType = mime.lookup(fullPath) || 'application/octet-stream';
  const uploaded = await supabase.storage.from(BUCKET).upload(storagePath, buf, { contentType, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const inserted = await supabase.from('files').insert({
    client_id: clientId, folder_id: folderId, name: path.basename(fullPath), storage_path: storagePath,
    file_type: contentType, file_size: buf.length, is_extra_file: isExtra,
  }).select().single();
  if (inserted.error) throw inserted.error;
  manifest.files[inserted.data.id] = { path: relativePath, storage_path: storagePath, updated_at: inserted.data.updated_at, hash: await fileHash(fullPath) };
  await saveManifest(manifestPath, manifest);
}

async function updateLocalFile(fullPath, manifestPath, manifest, supabase, fileId, item) {
  const buf = await fsp.readFile(fullPath);
  const newHash = crypto.createHash('sha256').update(buf).digest('hex');
  if (newHash === item.hash) return;
  const contentType = mime.lookup(fullPath) || 'application/octet-stream';
  const uploaded = await supabase.storage.from(BUCKET).update(item.storage_path, buf, { contentType, upsert: true });
  if (uploaded.error) throw uploaded.error;
  const now = new Date().toISOString();
  const updated = await supabase.from('files').update({ file_size: buf.length, file_type: contentType, updated_at: now }).eq('id', fileId);
  if (updated.error) throw updated.error;
  item.hash = newHash;
  item.updated_at = now;
  await saveManifest(manifestPath, manifest);
}

async function createLocalFolder(root, dirPath, manifestPath, manifest, supabase) {
  const relativePath = rel(root, dirPath);
  const parts = relativePath.split('/');
  if (parts.length !== 2 || parts[1] === 'Extra Files') return;
  if (Object.values(manifest.folders).includes(relativePath)) return;
  const clientId = findClientByRel(manifest, parts);
  if (!clientId) return;
  const inserted = await supabase.from('folders').insert({ client_id: clientId, name: parts[1] }).select().single();
  if (inserted.error) throw inserted.error;
  manifest.folders[inserted.data.id] = relativePath;
  await saveManifest(manifestPath, manifest);
}

async function startWatcher(root, manifestPath, manifest, suppress, supabase) {
  const watcher = chokidar.watch(root, { ignoreInitial: true, persistent: true, awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 100 }, ignored: /(^|[\\/])\../ });
  const shouldIgnore = (fullPath) => {
    const relativePath = rel(root, fullPath);
    if (suppress.has(relativePath)) { suppress.delete(relativePath); return true; }
    return false;
  };

  watcher.on('add', async (p) => {
    try { if (!shouldIgnore(p)) await uploadNewLocalFile(root, p, manifestPath, manifest, supabase); } catch (e) { console.error('local add sync failed', p, e); }
  });
  watcher.on('change', async (p) => {
    try {
      if (shouldIgnore(p)) return;
      const relativePath = rel(root, p);
      const found = manifestFileAt(manifest, relativePath);
      if (found) await updateLocalFile(p, manifestPath, manifest, supabase, found[0], found[1]);
      else await uploadNewLocalFile(root, p, manifestPath, manifest, supabase);
    } catch (e) { console.error('local change sync failed', p, e); }
  });

  // SAFETY RULE: a local disappearance must never delete a legal file from the cloud.
  // This covers Finder deletes, folder renames/moves, app migrations, disconnected drives,
  // and another sync process moving the root. The next remote pull will restore the file.
  watcher.on('unlink', (p) => {
    if (shouldIgnore(p)) return;
    console.warn('Local file disappeared; cloud copy preserved and will be restored:', p);
  });

  watcher.on('addDir', async (p) => {
    try { if (!shouldIgnore(p)) await createLocalFolder(root, p, manifestPath, manifest, supabase); } catch (e) { console.error('folder create sync failed', p, e); }
  });
  return watcher;
}

async function startSync(root, userDataDir) {
  await ensureDir(root);
  const supabase = createSupabase();
  const manifestPath = path.join(userDataDir, 'tj-sync-manifest.json');
  const manifest = await loadManifest(manifestPath);
  const suppress = new Set();

  await pullRemote(root, manifestPath, manifest, suppress, supabase);
  await startWatcher(root, manifestPath, manifest, suppress, supabase);

  (async () => {
    while (true) {
      await sleep(POLL_MS);
      try { await pullRemote(root, manifestPath, manifest, suppress, supabase); }
      catch (e) { console.error('remote pull sync failed', e); }
    }
  })();
}

module.exports = { startSync };

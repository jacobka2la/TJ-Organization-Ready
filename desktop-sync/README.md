# TJ Organization Desktop Sync

This is the desktop companion for TJ Organization. It creates a normal `TJ Organization` folder inside the signed-in computer user's Documents folder and keeps the firm's Supabase-backed client files synchronized with it.

## What syncs

- Existing TJ Organization clients become top-level folders.
- Existing client folders become normal folders under each client.
- Extra Files appears as `Extra Files`.
- Files uploaded on the website download to the computer.
- Website file renames/moves are reflected locally on the next pull.
- Files added locally inside an existing client folder upload to TJ Organization.
- Local file edits replace the matching Supabase Storage object and update file metadata.
- Local file deletes soft-delete the matching `files` row.
- New local folders directly inside an existing client create a TJ Organization folder.

Remote changes are checked every 30 seconds. Local changes are watched continuously while the app is running.

## Local setup

1. Copy `.env.example` to `.env`.
2. Put the same Supabase project URL and anon key used by the TJ Organization website into `.env`.
3. Run `npm install` inside `desktop-sync`.
4. Run `npm start`.
5. Click **Open TJ Organization Folder**.

## Build an installer

Windows:

```bash
npm run build:win
```

macOS:

```bash
npm run build:mac
```

The installer output is produced by electron-builder. Installing/running the app creates `Documents/TJ Organization` automatically.

## Safety notes

- `.env` is gitignored. Never commit the firm's Supabase credentials.
- The desktop app uses the same `clients`, `folders`, `files`, and `client-files` storage structures as the web app; it does not create a second database.
- The sync manifest is stored in Electron's per-user app-data directory, not inside the client file tree.
- Top-level client folders are currently created from TJ Organization. Create/rename clients in the website for now; local client-folder creation/rename is intentionally not guessed because client first/last-name parsing can be ambiguous.

## Next hardening before firm-wide rollout

For production use, the desktop app should authenticate each firm user with Supabase Auth and rely on RLS rather than distributing a broadly permissive project key. It should also add conflict/version handling for the rare case where the same file is edited on the website and desktop at nearly the same time.

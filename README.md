# TJ Organization

Private legal file organization workspace prototype for TJY Law internal use.

## What it is

TJ Organization is a private, login-first file organizer concept for case files. It is designed to feel smooth and simple while keeping the structure focused on:

- Case folders
- Legal document categories
- Recent uploads
- Case notes
- Search-friendly organization
- Login-only access flow
- No public marketing pages

## Privacy notes

This prototype includes no-index and crawl-blocking basics, but that alone does not make the app secure. Before storing real client files, connect real authentication and private file storage.

Recommended production setup:

- Supabase Auth or Clerk for login
- Two-factor authentication
- Supabase Storage or AWS S3 with private buckets
- Row-level security / user permissions
- HTTPS-only deployment
- Private Vercel project and private GitHub repo

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

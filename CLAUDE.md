# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**music-tagger** — a Windows Electron desktop app for tagging local music files. Browse, search, and organize music with custom colored tags. UI is in Chinese.

## Commands

All commands run from `music-tagger/`:

| Command | Description |
|---------|-------------|
| `npm run dev` | Development: starts Vite dev server (port 5173) + Electron app concurrently |
| `npm run vite:dev` | Vite dev server only |
| `npm run electron:dev` | Electron only (requires Vite running on 5173) |
| `npm run build` | Production build: Vite build + electron-builder (NSIS installer) |
| `npm run vite:build` | Frontend build only → `dist/` |
| `node test_electron_main.js` | Run the existing smoke test (plain Node.js, no framework) |

No linter, formatter, or test framework is configured yet.

## Architecture

**Dual-process Electron app** — Renderer (React SPA) ↔ IPC (contextBridge) ↔ Main process (Node.js services + sql.js).

### Renderer Process (`src/`)

React 18 + TypeScript + Tailwind CSS. Four pages routed by a switch in `App.tsx`:

- `MusicLibrary` — sortable/filterable track table with batch tag assignment
- `TagManager` — CRUD tags, view tracks by tag
- `SearchPage` — unified text search + tag-filter intersection
- `SettingsPage` — scan directories, trigger scan, change DB location, stats

Shared components: `Sidebar` (nav + stats + theme toggle), `AudioPlayer` (bottom bar, HTML5 `<audio>` with `file://` src), `TagBadge`, `TagSelector` (inline tag create + search dropdown).

The `Window.api` interface is declared in `src/types.ts` — all IPC calls are typed there.

Theme uses CSS custom properties (`--s-*` for surfaces, `--tx-*` for text) toggled by a `.dark` class on `<html>`. Dark mode is default; preference is persisted in `localStorage` and applied via inline `<script>` before paint to prevent flash.

### Main Process (`main-process/`)

Plain JavaScript (CommonJS). Entry: `main.js` → creates BrowserWindow with `contextIsolation: true`, `nodeIntegration: false`, and `webSecurity: false` (required for `file://` audio playback). Preload script at `preload.js`.

**IPC layer**: `ipcHandlers.js` registers `ipcMain.handle` for every channel. Each handler delegates to a service, calls `saveNow()` after mutations.

**Database layer** (`database.js`): Uses `sql.js` (SQLite compiled to WASM). Wraps it in a custom `Statement` class that mimics better-sqlite3's `.run()`, `.get()`, `.all()` API. The DB file lives at `{userData}/music-tagger.db` by default; path is configurable via `config.json`. Auto-saves every 30 seconds. On DB location change, schema tables are re-created in the new file.

**SQL schema** — 4 tables:
- `tracks` (id, file_path UNIQUE, title, artist, album, duration, format, file_size, added_at)
- `tags` (id, name UNIQUE, color, created_at)
- `track_tags` (track_id, tag_id, created_at, FK cascade deletes)
- `scan_dirs` (id, dir_path UNIQUE, added_at)

**Services**:
- `scanner.js` — Recursively collects music files from scan directories, parses metadata via `music-metadata` (ESM, dynamically imported), batches inserts. Also cleans up DB entries for deleted files.
- `trackService.js` — CRUD + listing with sort/search/pagination. Joins tags via `GROUP_CONCAT` and parses them with `parseTrackTags()`. `getTracksByTags` does AND-logic (track must have ALL specified tags).
- `tagService.js` — CRUD with track count aggregation. `setTrackTags` replaces all tags for a track in a transaction.
- `searchService.js` — Unified LIKE search across track title/artist/album/file_path and tag name.

### Key Conventions

- **IPC boundary**: Frontend never touches fs, db, or Node APIs directly. All goes through `window.api.*` → preload → ipcMain handlers.
- **Import alias**: `@/` maps to `src/` (configured in both `tsconfig.json` paths and `vite.config.ts` resolve.alias).
- **Component naming**: PascalCase files and exports (`AudioPlayer.tsx`, `TagSelector.tsx`).
- **Indentation**: 2 spaces.
- **TypeScript strict mode** is on for `src/`. Main process is still JS — migrate to TS when touching those files.
- **Windows-only**: File paths use backslashes natively. Build target is NSIS.

### Startup Sequence

1. `npm run dev` → concurrently runs `vite` and `wait-on http://localhost:5173 && cross-env NODE_ENV=development node scripts/start-electron.js`
2. `start-electron.js` unsets `ELECTRON_RUN_AS_NODE` and spawns `electron.exe .`
3. `main.js`: `app.whenReady()` → `initDb()` (loads sql.js WASM, creates/opens DB, ensures schema) → `autoSave(30000)` → `registerIpcHandlers()` → `createWindow()` → loads `http://localhost:5173` (dev) or `dist/index.html` (prod)
4. Renderer: `main.tsx` → renders `<App />` which calls `window.api.stats.get()` on mount

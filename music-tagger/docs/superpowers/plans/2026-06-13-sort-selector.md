# MusicLibrary Sort Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sort-method dropdown to MusicLibrary with three sort modes (添加时间, 最后使用时间, 使用次数) plus direction toggle, backed by new `last_used_at` and `play_count` columns auto-updated from the AudioPlayer.

**Architecture:** Database schema gains two new columns via ALTER TABLE migration. A new IPC channel `tracks:recordPlay` is called by AudioPlayer on each play event, updating `last_used_at` and `play_count` on the main process side. The frontend replaces the in-table-header sort click with a dropdown + direction toggle in the toolbar, and the `SortField` type expands to include the three new sort keys.

**Tech Stack:** Electron + React 18 + TypeScript (renderer), CommonJS Node.js (main process), sql.js (SQLite in WASM), Tailwind CSS

---

## Context from Codebase Analysis

### Current State Summary

| Layer | Current Behavior |
|-------|-----------------|
| **DB Schema** (`database.js`) | `tracks` table has `added_at DATETIME DEFAULT CURRENT_TIMESTAMP` but NO `last_used_at` or `play_count` columns. `CREATE TABLE IF NOT EXISTS` is used -- existing DBs will NOT get new columns automatically. |
| **trackService.js** | `validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at']` in 3 places (`getAllTracks`, `getTracksByTag`, `getTracksByTags`). Sort column is interpolated directly into SQL (`ORDER BY t.${sortBy}`). |
| **ipcHandlers.js** | No handler for updating play stats. Only `tracks:getAll`, `tracks:getById`, `tracks:getByTag`, `tracks:getByTags`, `tracks:remove`, `tracks:removeBatch`. |
| **preload.js** | `tracks.getAll(opts)`, `tracks.getByTag(tagId, opts)`, `tracks.getByTags(tagIds, opts)` -- opts includes `sortBy`/`sortDir`. No `recordPlay` method. |
| **types.ts** | `Track` interface has `added_at: string` but no `last_used_at` or `play_count`. `Window.api.tracks.getAll` opts has `sortBy?: string`. No `recordPlay` signature. |
| **MusicLibrary.tsx** | `SortField = 'title' \| 'artist' \| 'album' \| 'duration' \| 'format' \| 'added_at'`. Sort is by clicking column headers (each calls `handleSort(field)`). No dropdown. Direction toggles on same-column re-click. |
| **AudioPlayer.tsx** | Pure playback UI. No IPC calls on play/pause/ended events. `onPlay`/`onPause`/`onEnded` events update local React state only. |
| **TagManager.tsx** | Calls `window.api.tracks.getByTag(selectedTag.id)` without opts -- uses default `sortBy='title', sortDir='ASC'`. Not in scope of this change. |
| **searchService.js** | `search()` always hardcodes `ORDER BY t.title ASC`. Not in scope of this change. |

### Key Design Decisions

1. **Migration strategy**: since `database.js` uses `CREATE TABLE IF NOT EXISTS`, existing databases won't auto-add columns. Must use `ALTER TABLE ADD COLUMN` with existence checks before `CREATE TABLE`.
2. **Sort by play_count/last_used_at**: `play_count` will be `INTEGER DEFAULT 0`, `last_used_at` will be `DATETIME`. Both are nullable initially for backward compat -- existing tracks won't have them until first play.
3. **Play tracking trigger**: `AudioPlayer.tsx` already listens to `play` events on the `<audio>` element. We hook into that to fire an IPC call.
4. **No throttle needed**: play_count increments once per play start, not per timeupdate tick. Simple and sufficient.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `main-process/database.js` | Modify | Add migration for `last_used_at` and `play_count` columns |
| `main-process/trackService.js` | Modify | Add `last_used_at`, `play_count` to `validSortCols` (3 places); add `recordPlay()` function; include new columns in `insertTrack` |
| `main-process/ipcHandlers.js` | Modify | Register `tracks:recordPlay` handler |
| `main-process/preload.js` | Modify | Expose `tracks.recordPlay(trackId)` |
| `src/types.ts` | Modify | Add `last_used_at`, `play_count` to `Track`; add `recordPlay` to `Window.api.tracks` |
| `src/pages/MusicLibrary.tsx` | Modify | Replace inline-column sort with dropdown + direction toggle; expand `SortField` type |
| `src/components/AudioPlayer.tsx` | Modify | Call `window.api.tracks.recordPlay(track.id)` on play start |

---

## Tasks

### Task 1: Database Migration -- Add `last_used_at` and `play_count` Columns

**Files:**
- Modify: `music-tagger/main-process/database.js`

- [ ] **Step 1: Add column migration logic to `initDb()` and both `CREATE TABLE` sites**

In `database.js`, three places define the `tracks` table schema: `initDb()` (line 135), and twice inside `setDbPath()` (lines 248, 248). Each needs to be updated in the same way.

Add the migration pattern right after the `tracks` table creation in `initDb()`. The pattern uses `PRAGMA table_info` to check for column existence before `ALTER TABLE`, which is the safe approach for sql.js (it doesn't support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

Replace the `tracks` CREATE TABLE block in `initDb()` (lines 135-147) with:

```js
  // Init tables
  db.db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL,
      format TEXT,
      file_size INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      play_count INTEGER DEFAULT 0
    )
  `);

  // Migration: add columns if they don't exist (for existing databases)
  const trackCols = db.db.exec("PRAGMA table_info('tracks')");
  if (trackCols.length > 0) {
    const colNames = trackCols[0].values.map(row => row[1]); // column name is index 1
    if (!colNames.includes('last_used_at')) {
      db.db.run("ALTER TABLE tracks ADD COLUMN last_used_at DATETIME");
    }
    if (!colNames.includes('play_count')) {
      db.db.run("ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0");
    }
  }
```

Replace the `tracks` CREATE TABLE block inside `setDbPath()` (first occurrence, the one after the PRAGMA, lines 248-259) with the same updated schema:

```js
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration REAL,
        format TEXT,
        file_size INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        play_count INTEGER DEFAULT 0
      )
    `);

    // Migration for existing databases opened at new path
    const trackCols2 = sqlDb.exec("PRAGMA table_info('tracks')");
    if (trackCols2.length > 0) {
      const colNames2 = trackCols2[0].values.map(row => row[1]);
      if (!colNames2.includes('last_used_at')) {
        sqlDb.run("ALTER TABLE tracks ADD COLUMN last_used_at DATETIME");
      }
      if (!colNames2.includes('play_count')) {
        sqlDb.run("ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0");
      }
    }
```

- [ ] **Step 2: Verify migration works with existing database**

Run the dev server: `npm run dev` from `music-tagger/`. Open DevTools console, check for no errors. The app should start normally with existing databases.

Expected: App starts without errors. New databases get the columns in CREATE TABLE; existing databases get them via ALTER TABLE.

- [ ] **Step 3: Commit**

```bash
git add music-tagger/main-process/database.js
git commit -m "feat: add last_used_at and play_count columns to tracks table with migration"
```

---

### Task 2: Add `recordPlay` to trackService and Expand validSortCols

**Files:**
- Modify: `music-tagger/main-process/trackService.js`

- [ ] **Step 1: Expand `validSortCols` in all three functions**

`trackService.js` defines `validSortCols` in three functions. Add `'last_used_at'` and `'play_count'` to each array. The expected sort semantics:
- `last_used_at ASC` = oldest use first, `DESC` = most recent use first
- `play_count ASC` = least played first, `DESC` = most played first

In `getAllTracks` (line 5), change:

```js
  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
```

In `getTracksByTag` (line 91), change:

```js
  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
```

In `getTracksByTags` (line 112), change:

```js
  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
```

- [ ] **Step 2: Add `recordPlay` function**

Add this function before the `module.exports` block (before line 162):

```js
function recordPlay(trackId) {
  const db = getDb();
  db.prepare(`
    UPDATE tracks
    SET last_used_at = datetime('now', 'localtime'),
        play_count = COALESCE(play_count, 0) + 1
    WHERE id = ?
  `).run(trackId);
}
```

`COALESCE(play_count, 0)` handles existing rows where `play_count` is NULL (rows that existed before migration).

- [ ] **Step 3: Export `recordPlay`**

In `module.exports` (line 162-172), add `recordPlay`:

```js
module.exports = {
  getAllTracks,
  getTrackById,
  getTrackByPath,
  insertTrack,
  removeTrack,
  removeTrackByPath,
  getTracksByTag,
  getTracksByTags,
  getTrackCount,
  recordPlay,
};
```

- [ ] **Step 4: Commit**

```bash
git add music-tagger/main-process/trackService.js
git commit -m "feat: add recordPlay function and expand validSortCols"
```

---

### Task 3: Register IPC Handler and Expose via Preload

**Files:**
- Modify: `music-tagger/main-process/ipcHandlers.js`
- Modify: `music-tagger/main-process/preload.js`

- [ ] **Step 1: Register `tracks:recordPlay` IPC handler**

In `ipcHandlers.js`, add after the `tracks:removeBatch` handler (after line 134):

```js
  ipcMain.handle('tracks:recordPlay', (_event, trackId) => {
    trackService.recordPlay(trackId);
    saveNow();
    return { success: true };
  });
```

- [ ] **Step 2: Expose `recordPlay` in preload**

In `preload.js`, add to the `tracks` object (after line 11):

```js
    recordPlay: (trackId) => ipcRenderer.invoke('tracks:recordPlay', trackId),
```

Full tracks block should look like:

```js
  tracks: {
    getAll: (opts) => ipcRenderer.invoke('tracks:getAll', opts),
    getById: (id) => ipcRenderer.invoke('tracks:getById', id),
    getByTag: (tagId, opts) => ipcRenderer.invoke('tracks:getByTag', tagId, opts),
    getByTags: (tagIds, opts) => ipcRenderer.invoke('tracks:getByTags', tagIds, opts),
    remove: (id, deleteFile) => ipcRenderer.invoke('tracks:remove', id, deleteFile),
    removeBatch: (ids, deleteFile) => ipcRenderer.invoke('tracks:removeBatch', ids, deleteFile),
    recordPlay: (trackId) => ipcRenderer.invoke('tracks:recordPlay', trackId),
  },
```

- [ ] **Step 3: Commit**

```bash
git add music-tagger/main-process/ipcHandlers.js music-tagger/main-process/preload.js
git commit -m "feat: add tracks:recordPlay IPC channel"
```

---

### Task 4: Update TypeScript Types

**Files:**
- Modify: `music-tagger/src/types.ts`

- [ ] **Step 1: Add `last_used_at` and `play_count` to Track interface**

The `Track` interface (line 9-20) currently has:

```ts
export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  file_size: number | null;
  added_at: string;
  tags: Tag[];
}
```

Change to:

```ts
export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  file_size: number | null;
  added_at: string;
  last_used_at: string | null;
  play_count: number | null;
  tags: Tag[];
}
```

Both new fields are nullable because existing tracks won't have values until they are played.

- [ ] **Step 2: Add `recordPlay` to Window.api.tracks interface**

In the `Window.api` declaration, add to `tracks` object (after line 73):

```ts
        recordPlay: (trackId: number) => Promise<{ success: boolean }>;
```

Full tracks interface should be:

```ts
      tracks: {
        getAll: (opts?: {
          search?: string;
          sortBy?: string;
          sortDir?: string;
          limit?: number;
          offset?: number;
        }) => Promise<TracksResult>;
        getById: (id: number) => Promise<Track | null>;
        getByTag: (tagId: number, opts?: { sortBy?: string; sortDir?: string }) => Promise<Track[]>;
        getByTags: (tagIds: number[], opts?: { sortBy?: string; sortDir?: string }) => Promise<Track[]>;
        remove: (id: number, deleteFile?: boolean) => Promise<{
          success: boolean;
          cancelled?: boolean;
          fileDeleted?: boolean;
          fileError?: string | null;
        }>;
        removeBatch: (ids: number[], deleteFile?: boolean) => Promise<{
          success: boolean;
          cancelled?: boolean;
          total?: number;
          deleted?: number;
          fileDeleted?: number;
          failures?: Array<{ id: number; title: string; error: string }>;
        }>;
        recordPlay: (trackId: number) => Promise<{ success: boolean }>;
      };
```

- [ ] **Step 3: Commit**

```bash
git add music-tagger/src/types.ts
git commit -m "feat: add last_used_at, play_count to Track type and recordPlay to api interface"
```

---

### Task 5: Add Sort Method Dropdown UI to MusicLibrary

**Files:**
- Modify: `music-tagger/src/pages/MusicLibrary.tsx`

This is the largest change. We replace the column-header-click sort mechanism with a dedicated dropdown + direction toggle in the toolbar.

- [ ] **Step 1: Expand `SortField` type and add sort label mapping**

The `SortField` type (line 14) currently only has fields that are columns in the table headers. Change it to include the three new sort methods:

```ts
type SortField = 'title' | 'artist' | 'album' | 'duration' | 'format' | 'added_at' | 'last_used_at' | 'play_count';
```

Add a constant above the component for display labels:

```ts
const SORT_LABELS: Record<SortField, string> = {
  title: '标题',
  artist: '艺术家',
  album: '专辑',
  duration: '时长',
  format: '格式',
  added_at: '添加时间',
  last_used_at: '最后使用时间',
  play_count: '使用次数',
};
```

- [ ] **Step 2: Add dropdown state and toggle handlers**

Replace the existing `sortBy`/`sortDir`/`handleSort` (lines 20-21, 41-48) with expanded logic that supports the three new sort methods and their natural direction defaults.

Replace lines 20-21:

```ts
  const [sortBy, setSortBy] = useState<SortField>('artist');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
```

With:

```ts
  const [sortBy, setSortBy] = useState<SortField>('added_at');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
```

Natural defaults: `added_at` defaults to DESC (newest first), `last_used_at` defaults to DESC (most recent first), `play_count` defaults to DESC (most played first). All others default to ASC.

Replace the existing `handleSort` (lines 41-48):

```ts
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortDir('ASC');
    }
  };
```

With:

```ts
  const handleSortChange = (field: SortField) => {
    if (sortBy === field) {
      // Toggle direction on same field
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      // Natural defaults: time-based and count sorts default to DESC, others to ASC
      if (field === 'added_at' || field === 'last_used_at' || field === 'play_count') {
        setSortDir('DESC');
      } else {
        setSortDir('ASC');
      }
    }
  };

  const toggleSortDir = () => {
    setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
  };
```

- [ ] **Step 3: Add sort dropdown UI to toolbar**

Replace the search bar area toolbar (the `<div className="flex items-center gap-3">` starting at line 131) to include the sort dropdown and direction toggle. The new toolbar:

```tsx
      {/* Search + sort + batch actions */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="搜索音乐库..."
            className="input pl-4 pr-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Sort method dropdown */}
        <div className="flex items-center gap-1">
          <select
            className="input py-1.5 text-sm bg-surface-800 border-surface-600 text-txt-secondary cursor-pointer rounded-lg"
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortField)}
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={toggleSortDir}
            className="btn-ghost btn-sm p-1.5"
            title={sortDir === 'ASC' ? '升序' : '降序'}
          >
            {sortDir === 'ASC' ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {selectedIds.size > 0 && (
          ...
        )}
        ...
      </div>
```

Note: Keep the rest of the toolbar (batch actions, refresh button) exactly as before. The `{selectedIds.size > 0 && (...)}` and refresh button stay unchanged.

- [ ] **Step 4: Remove column-header click sorting, replace with static headers**

In the table `<thead>` (lines 174-201), remove `cursor-pointer`, `onClick`, and `<SortIcon>` from each `<th>`. Columns should no longer be clickable sort triggers.

For the `<thead>`, replace the entire block (lines 174-201) with:

```tsx
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tracks.length && tracks.length > 0}
                    onChange={selectAll}
                    className="rounded bg-surface-700 border-surface-600 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">标题</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">艺术家</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">专辑</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">时长</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">格式</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标签</th>
                <th className="w-20 px-3 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
```

- [ ] **Step 5: Remove the unused `SortIcon` component**

Delete the `SortIcon` component (lines 115-118):

```tsx
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null;
    return sortDir === 'ASC' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };
```

This component is no longer used after removing column-header sorting.

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit` from `music-tagger/`.
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add music-tagger/src/pages/MusicLibrary.tsx
git commit -m "feat: add sort method dropdown with direction toggle to MusicLibrary"
```

---

### Task 6: Trigger `recordPlay` from AudioPlayer

**Files:**
- Modify: `music-tagger/src/components/AudioPlayer.tsx`

- [ ] **Step 1: Call `recordPlay` on play event**

The `onPlay` event listener (line 37) currently only calls `setIsPlaying(true)`. We add the IPC call there. Since `track.id` is available from props, it's a one-line addition.

In the `useEffect` that sets up audio event listeners (lines 26-53), change the `onPlay` handler (line 37):

```ts
    const onPlay = () => {
      setIsPlaying(true);
      window.api.tracks.recordPlay(track.id);
    };
```

This fires once per play-start event, which is the correct behavior. `track.id` is stable from props.

- [ ] **Step 2: Verify with dev server**

Run: `npm run dev` from `music-tagger/`.
- Play a track.
- Open DevTools Network/Console to confirm no IPC errors.
- The database should now update `last_used_at` and `play_count`.

- [ ] **Step 3: Commit**

```bash
git add music-tagger/src/components/AudioPlayer.tsx
git commit -m "feat: record play stats via IPC on audio play event"
```

---

### Task 7: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the app in dev mode**

Run: `npm run dev` from `music-tagger/`.

- [ ] **Step 2: Test the sort dropdown**

1. MusicLibrary page loads. Verify the sort dropdown shows "添加时间" by default.
2. Click the direction toggle button (up/down chevron). Verify the track list re-orders.
3. Change to "标题" in the dropdown. Verify direction defaults to ASC.
4. Change to "使用次数" -- direction should default to DESC (most played first).
5. Change to "最后使用时间" -- direction should default to DESC (most recent first).

- [ ] **Step 3: Test play tracking**

1. Play a track from MusicLibrary.
2. Stop it and play another track.
3. Switch sort to "使用次数" -- the tracks you played should show `play_count` > 0.
4. Switch sort to "最后使用时间" -- the most recently played track should be first.

- [ ] **Step 4: Test migration on existing database**

If you have an existing `music-tagger.db` from before this change:
1. Start the app. It should load without errors.
2. Play a track. No crash.
3. Sort by play_count or last_used_at -- works even with NULL values (COALESCE handles it).

- [ ] **Step 5: Test edge cases**

1. Play a track, then close and reopen the app. The sort by "使用次数" should still reflect previous plays (persisted to DB).
2. Sort by "最后使用时间" with tracks that have never been played (NULL last_used_at). They should sort to the end in DESC order (NULLs sort last in SQLite ASC, first in DESC).

- [ ] **Step 6: Final commit (if any tweaks needed)**

```bash
git add -A
git commit -m "chore: final verification tweaks for sort selector feature"
```

---

## Rollback Plan

If issues arise:
1. **Database**: The ALTER TABLE is additive only. No data is destroyed. Reverting the code leaves the new columns in place harmlessly.
2. **Frontend**: The sort dropdown is purely additive. Old column-header sort is replaced but behavior is a superset.

---

## Testing Strategy

| Layer | Method | What to Verify |
|-------|--------|---------------|
| Database migration | Manual: start with old DB, check `PRAGMA table_info('tracks')` | New columns exist, old data intact |
| trackService.recordPlay | Manual: call from Node REPL | `last_used_at` set to current time, `play_count` increments |
| IPC channel | Manual: invoke from DevTools console | Handler registered, returns `{ success: true }` |
| AudioPlayer trigger | Manual: play a track, check DB | `play_count` = 1 after first play, = 2 after second |
| Sort dropdown UI | Manual: cycle through all 8 options | Correct order, direction toggle works |
| Sort by NULL handling | Manual: sort by play_count before any plays | No crash, NULLs grouped consistently |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ALTER TABLE fails on old sql.js version | Low | Medium | `PRAGMA table_info` is standard SQL; sql.js supports it. Tested via manual verification. |
| `COALESCE(play_count, 0)` returns 0 for legacy NULLs but sort puts NULLs at edges | Low | Low | NULL sort order is well-defined in SQLite. ASC puts NULLs first, DESC puts NULLs last. This is acceptable UX -- unplayed tracks at the bottom of "most played" sort is correct. |
| `recordPlay` IPC called rapidly (user clicks play/pause/play quickly) | Low | Low | Each call is a single UPDATE. sql.js is synchronous; no race condition. At most the count increments by 1 per play-start event, which is correct. |
| Sort dropdown styling doesn't match theme | Medium | Low | Use existing `input` and `btn-ghost` classes that already respect the CSS custom property theme. Verified by visual check. |

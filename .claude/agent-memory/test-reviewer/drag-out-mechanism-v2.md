---
name: drag-out-mechanism-v2
description: Updated drag-out uses proper dragstart event + sync IPC (ipcMain.on + send), replacing the old mousedown+mousemove workaround
metadata:
  type: project
---

The drag-out mechanism was updated from a mousedown+mousemove workaround to the proper dragstart event approach:

1. **Main process**: `file:dragStart` uses `ipcMain.on` (not `ipcMain.handle`) for synchronous IPC. The handler calls `event.sender.startDrag()` directly — no return value needed.
2. **Preload**: `dragStart` uses `ipcRenderer.send` (not `ipcRenderer.invoke`) — fire-and-forget, returns void.
3. **TypeScript**: `dragStart` typed as `void` return, not `Promise<void>`.
4. **Hook**: Single `useDragOutTrack()` hook returns `{ handleDragStart }`. Calls `e.preventDefault()`, sets `e.dataTransfer.effectAllowed = 'copy'`, then synchronously calls `window.api.file.dragStart()`.
5. **Pages**: MusicLibrary, TagManager, SearchPage all use `draggable` + `onDragStart` on `<tr>` elements. No more cursor:grab style.

**Why**: Electron's `webContents.startDrag()` must be called during the `dragstart` event context. Using `ipcRenderer.invoke` (async) breaks this — by the time the Promise resolves, the event context is gone. Using `ipcRenderer.send` + `ipcMain.on` keeps the call chain synchronous.

Related: [[audit-drag-drop-fix-review-20260613]] is superseded — that review confirmed the old mousedown+mousemove approach which is now replaced.

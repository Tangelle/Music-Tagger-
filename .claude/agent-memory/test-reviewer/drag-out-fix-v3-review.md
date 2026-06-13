---
name: drag-out-fix-v3-review
description: 3rd review of drag-out fix — v2 dragstart approach. Bug 1/2/3 all fixed. One minor finding: async in ipcMain.on callback.
metadata:
  type: feedback
---

## Drag-Out Fix v3 (dragstart + ipcMain.on/send) — Review Result

**Date**: 2026-06-13
**Verdict**: Conditional pass — 1 code-quality issue, no functional blockers

**Why**: Third attempt at drag-out. First two (mousedown+mousemove, then dragstart with bugs) both failed. This v3 correctly implements the dragstart approach.

### What's Correct

1. `useDragDrop.ts` (exported as `useDragOutTrack`): No `preventDefault()`, has `setData()`, has `effectAllowed='copy'`, IPC call in `setTimeout(0)` — all correct
2. `main.js`: `createWindow()` → `registerIpcHandlers(mainWindow)` order is correct now
3. `ipcHandlers.js`: `app` imported, `getFileIcon` with fallback, uses `ipcMain.on` (not handle) — matches preload's `ipcRenderer.send`

### One Finding: `async` in `ipcMain.on` callback

```js
ipcMain.on('file:dragStart', async (event, filePath) => { ... });
```

This works but an unhandled rejection in the catch block could leak. Low risk in practice because:
- `startDrag` rarely throws
- `getFileIcon` errors are already caught
- The try/catch around `getFileIcon` handles the common failure case

**How to apply**: When reviewing drag-out code, check that the `async` IIFE pattern is eventually adopted for `ipcMain.on`. Until then, the current code works fine for local files.

Related memories:
- [[drag-out-mechanism-v2]] — documented design of the dragstart + sync IPC approach
- [[audit-drag-drop-fix-review-20260613]] — superseded review of old mousedown+mousemove approach

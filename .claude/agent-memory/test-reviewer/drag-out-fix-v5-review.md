---
name: drag-out-fix-v5-review
description: 5th review: sync handler no async, zero findings, pass
metadata:
  type: project
---

5th review of drag-out feature. Handler at `ipcHandlers.js:190-205` is now fully synchronous — `startDrag` called directly in the `ipcMain.on` callback with `nativeImage.createEmpty()` instead of async `app.getFileIcon()`. Entire call chain from React `dragstart` through `ipcRenderer.send` to `event.sender.startDrag()` has zero async operations. Zero findings, pass.

See [[drag-out-fix-v4-review]] for the previous async IIFE approach that this replaces.

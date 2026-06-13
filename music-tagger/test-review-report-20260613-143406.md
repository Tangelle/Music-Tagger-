# 测试审核报告

**日期时间**: 2026-06-13 14:34:06
**审核范围**: "删除曲目时可同时删除音乐本体文件"功能实现 — 涉及 trackService.js、ipcHandlers.js、preload.js、types.ts、MusicLibrary.tsx
**审核结果**: 通过

## 一、审核概要

- 审核结果: 通过
- 审核文件数: 5
- 发现问题数: 1
  - 严重: 0
  - 一般: 0
  - 建议: 1

## 二、审核文件清单

| 文件 | 说明 |
|------|------|
| `main-process/trackService.js` | `removeTrack(id)` 函数：先 SELECT 获取 file_path/title，再 DELETE，返回 track 信息 |
| `main-process/ipcHandlers.js` | `tracks:remove` handler：完整流程编排（获取信息、对话框、删 DB、删文件） |
| `main-process/preload.js` | `tracks.remove` 透传 `deleteFile` 参数 |
| `src/types.ts` | `remove` 类型声明：`deleteFile` 可选参数 + 返回类型含 `cancelled`/`fileDeleted`/`fileError` |
| `src/pages/MusicLibrary.tsx` | `handleRemoveTrack`：调用 remove、处理 cancelled、处理 fileError |

## 三、需求符合性检查

| 需求项 | 状态 | 说明 |
|--------|------|------|
| 删除曲目时弹出原生对话框 | 通过 | `dialog.showMessageBox` 调用正确，使用 `mainWindow` 作为 parent |
| 对话框三个按钮：仅删除记录 / 删除记录和文件 / 取消 | 通过 | `buttons: ['仅删除记录', '删除记录和文件', '取消']`，`cancelId: 2` |
| "仅删除记录" — 只删 DB | 通过 | `response === 0` 时 `deleteFile = false`，只执行 `removeTrack(id)` |
| "删除记录和文件" — 删 DB + 物理文件 | 通过 | `response === 1` 时 `deleteFile = true`，执行 `fs.unlinkSync` |
| "取消" — 不操作 | 通过 | `response === 2` 时返回 `{ cancelled: true }`，前端跳过后续操作 |
| 返回值包含操作结果 | 通过 | 返回 `success`、`cancelled`、`fileDeleted`、`fileError` |
| 删除操作在 DB 记录删除之后执行 | 通过 | 先 `removeTrack(id)` + `saveNow()`，再删除文件（正确顺序：DB 先删，文件删除失败不影响 DB 操作） |
| 参数可选，允许外部指定 deleteFile | 通过 | `deleteFile === undefined \|\| null` 时弹框，否则使用传入值 |

## 四、发现的问题

### 严重问题 (必须修复)

无。

### 一般问题 (建议修复)

无。

### 改进建议 (可选)

**R1 — handleRemoveTrack 未向用户展示 fileError**

- **文件**: `src/pages/MusicLibrary.tsx`，第 67-69 行
- **描述**: 当物理文件删除失败时（如文件被占用），`fileError` 仅通过 `console.error` 输出，用户不会看到任何提示。由于 DB 记录已被删除，文件却仍留在磁盘上，用户可能以为文件已删除。
- **建议**: 添加一个 toast/notification 向用户展示错误信息，例如 "文件删除失败: [错误信息]"。考虑到应用目前没有 toast 组件，可以先简单地 `alert()` 或保持现状，在后续添加通知系统时补上。
- **影响**: 轻微。DB 操作正常，核心功能不受影响，仅是用户体验细节。

## 五、代码质量评估

### trackService.js — `removeTrack(id)`（第 76-82 行）

- **正确性**: 通过。先 SELECT `file_path, title` 再 DELETE，如果 track 不存在则返回 `null`。SELECT 仅取需要的两列而非 `*`，效率良好。
- **返回值**: 通过。不存在返回 `null`，存在返回 `{ file_path, title }`。注意这里返回的是原始 SELECT 结果（未经过 `parseTrackTags`），但对于 handler 中的用途（拿 `file_path` 和 `title` 做对话框消息）完全够用。

### ipcHandlers.js — `tracks:remove` handler（第 28-69 行）

- **handler 声明**: 通过。标记为 `async`，因为需要 `await dialog.showMessageBox`。
- **mainWindow 闭包**: 通过。handler 定义在 `registerIpcHandlers(mainWindow)` 闭包内，`mainWindow` 可访问。
- **前置检查**: 通过。在删除前通过 `getTrackById` 获取 track 信息；track 不存在时返回 `{ success: false, error: '曲目不存在' }`。
- **对话框逻辑**: 通过。
  - `deleteFile === undefined || deleteFile === null` 判断正确，覆盖了 `remove(id)`（无第二参数）和 `remove(id, null)` 两种情况。
  - `response === 2` 检查取消，`cancelId: 2` 与第三个按钮"取消"对应——正确。
  - `deleteFile = (response === 1)` 布尔赋值——正确。按钮索引 0="仅删记录"、1="删记录和文件"、2="取消"。
- **DB 删除**: 通过。`trackService.removeTrack(id)` + `saveNow()` 在文件删除之前执行，这是正确的设计——即使文件删除失败，DB 记录也应先删除。
- **文件删除**: 通过。
  - `deleteFile && track.file_path` 双重 guard——正确。
  - `fs.existsSync` 前置检查——文件不存在时静默跳过，不报错。
  - `fs.unlinkSync` 在 try/catch 中——异常被捕获并记录到 `fileError`。
  - `console.error` 记录了完整上下文——方便调试。
- **返回值**: 通过。`{ success: true, fileDeleted, fileError: fileError || null }` 确保 `fileError` 始终为 string 或 null（非 undefined）。

### preload.js — `tracks.remove`（第 10 行）

- **参数透传**: 通过。`remove: (id, deleteFile) => ipcRenderer.invoke('tracks:remove', id, deleteFile)`，两个参数都正确传递给 invoke。

### types.ts — `remove` 签名（第 61-66 行）

- **参数**: 通过。`deleteFile?: boolean` 可选参数。
- **返回类型**: 通过。`Promise<{ success: boolean; cancelled?: boolean; fileDeleted?: boolean; fileError?: string | null }>` 完整覆盖所有返回值字段。

### MusicLibrary.tsx — `handleRemoveTrack`（第 64-72 行）

- **cancelled 处理**: 通过。`if (result.cancelled) return;` — 取消时跳过 refresh。
- **fileError 处理**: 通过。`console.error` 记录错误，但未向用户展示（见改进建议 R1）。
- **后续操作**: 通过。无论文件删除成功或失败，都调用 `onDataChange()` + `loadTracks()` — 正确。

## 六、IPC 边界检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 前端调用路径 | 通过 | `window.api.tracks.remove(id)` → preload → `ipcRenderer.invoke('tracks:remove', id, undefined)` → ipcMain.handle |
| 无直接 Node API 调用 | 通过 | 前端代码未直接使用 fs、dialog、path 等 Node 模块 |
| 类型声明一致 | 通过 | `types.ts` 中 `Window.api.tracks.remove` 的签名与 preload 暴露的签名一致 |

## 七、边界条件测试

| 场景 | 预期行为 | 实际 | 结果 |
|------|----------|------|------|
| 正常删除（仅删记录） | 弹框 → 点"仅删除记录" → DB 删除，文件保留 | `response=0` → `deleteFile=false` → 跳过文件删除 | 通过 |
| 正常删除（记录+文件） | 弹框 → 点"删除记录和文件" → DB 删除 + 文件删除 | `response=1` → `deleteFile=true` → unlinkSync | 通过 |
| 用户取消 | 弹框 → 点"取消" → 无操作 | `response=2` → `return { cancelled: true }` → 前端 `return` | 通过 |
| 文件已被占用（如播放中） | DB 删除成功，文件删除失败，返回 fileError | try/catch 捕获 EPERM/EBUSY，记录到 fileError，DB 已删除 | 通过 |
| 文件已不存在（已手动删除） | DB 删除成功，跳过文件删除，无报错 | `existsSync` 返回 false，跳过 unlinkSync | 通过 |
| track 在 DB 中不存在 | 返回 `{ success: false, error: '曲目不存在' }` | `getTrackById` 返回 null → 提前返回 error | 通过 |
| track 的 file_path 为空/null | 不执行文件删除 | `deleteFile && track.file_path` — file_path 假值时短路 | 通过（但生产环境 file_path 有 NOT NULL 约束，不会发生） |
| 外部传入 deleteFile=true（跳过对话框） | 直接删除记录和文件，不弹框 | `deleteFile !== undefined` — 跳过 if 块 | 通过 |

## 八、总结

本次审查的功能实现质量良好，代码逻辑严谨，覆盖了所有需求和边界条件：

- DB 操作（先查后删、saveNow）顺序正确
- 对话框参数、按钮顺序、cancelId 配置正确
- 文件删除有完整的守卫逻辑（existsSync + try/catch）
- 前端对 cancelled 和 fileError 都有处理
- IPC 边界清晰，类型声明一致

唯一可改进的细节是文件删除失败时前端仅 console.error 而未向用户展示提示（建议 R1），但这不构成功能缺陷。

**结论**: 通过。代码可以合并，无需修复的问题。

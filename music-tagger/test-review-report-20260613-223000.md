# 测试审核报告

**日期时间**: 2026-06-13 22:30:00
**审核范围**: 拖出功能从异步 IPC 模式重构为正确的同步 IPC 模式（dragstart 事件 + ipcMain.on/send）。涉及 7 个文件。

## 一、审核概要
- 审核结果: 通过
- 审核文件数: 7
- 发现问题数: 2
  - 严重: 0
  - 一般: 1
  - 建议: 1

## 二、审核文件清单

| 文件 | 描述 |
|------|------|
| `main-process/ipcHandlers.js` | `file:dragStart` handler，核心变更：ipcMain.handle -> ipcMain.on |
| `main-process/preload.js` | `dragStart` 方法，核心变更：ipcRenderer.invoke -> ipcRenderer.send |
| `src/types.ts` | `dragStart` 类型声明，核心变更：Promise<void> -> void |
| `src/hooks/useDragDrop.ts` | `useDragOutTrack` hook，核心变更：mousedown/move/up 模式 -> dragstart 事件 |
| `src/pages/MusicLibrary.tsx` | 音乐库页面，核心变更：tr 添加 draggable + onDragStart |
| `src/pages/TagManager.tsx` | 标签管理页面，核心变更：tr 添加 draggable + onDragStart |
| `src/pages/SearchPage.tsx` | 搜索页面，核心变更：tr 添加 draggable + onDragStart |

## 三、需求符合性检查

### IPC 同步性

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `file:dragStart` 从 `ipcMain.handle` 改为 `ipcMain.on` | 通过 | 第 193 行，使用 `ipcMain.on('file:dragStart', ...)` |
| handler 内无 `return` 返回 Promise | 通过 | 第 193-203 行，无 return 语句，直接调用 `event.sender.startDrag()` |
| `preload.js` 从 `invoke` 改为 `send` | 通过 | 第 52 行，`ipcRenderer.send('file:dragStart', filePath)` |
| `send` 调用不返回 Promise | 通过 | 箭头函数体用花括号包裹，隐式返回 `undefined`/void，正确 |

### TypeScript 类型

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `dragStart` 类型从 `Promise<...>` 改为 `void` | 通过 | 第 93 行，`dragStart: (filePath: string) => void;` |

### Hook 逻辑

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 使用 `dragstart` 事件（非 mousedown/mousemove） | 通过 | 整个 hook 重写为 `useDragOutTrack`，仅包含 `handleDragStart` |
| 调用 `e.preventDefault()` | 通过 | 第 6 行 |
| 设置 `e.dataTransfer.effectAllowed = 'copy'` | 通过 | 第 7 行 |
| 同步调用 `window.api.file.dragStart()` | 通过 | 第 8 行，无 await，同步调用 send |

### 三个页面修改一致性

| 检查项 | MusicLibrary | TagManager | SearchPage |
|--------|:-----------:|:----------:|:----------:|
| 从 hook 解构 `{ handleDragStart }` | 通过（第24行） | 通过（第23行） | 通过（第21行） |
| `<tr>` 添加 `draggable` 属性 | 通过（第194行） | 通过（第199行） | 通过（第202行） |
| `<tr>` 使用 `onDragStart={(e) => handleDragStart(e, track)}` | 通过（第195行） | 通过（第200行） | 通过（第203行） |
| 移除 `style={{ cursor: 'grab' }}` | 通过（无此样式） | 通过（无此样式） | 通过（无此样式） |
| 无 onMouseDown/Move/Up handler | 通过 | 通过 | 通过 |

### 边界条件

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 文件不存在时处理 | 通过 | 第 194-196 行，`fs.existsSync` 检查，打印 `console.error`，提前 return |
| `startDrag` icon 合理 | 通过 | 使用 `nativeImage.createEmpty()`，合理（拖出时不需图标） |

### 无退化

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 其他 IPC handler 未受影响 | 通过 | 所有 `ipcMain.handle` 保持不变，仅新增/修改 `file:dragStart` |
| `preload.js` 其他方法未受影响 | 通过 | 仅第 52 行修改为 send，其他 invoke 调用不变 |
| 拖入功能未受影响 | 通过 | `file:importFiles`（第212行）、`file:isSupportedAudio`（第206行）仍是 `ipcMain.handle` |
| App.tsx 拖入逻辑未受影响 | 通过 | `handleDragEnter/Leave/Drop` 仍使用 `isSupportedAudio` + `importFiles` |
| SettingsPage 拖入逻辑未受影响 | 通过 | `handleDirDrop` 仍使用 `isSupportedAudio` + `importFiles` |

## 四、发现的问题

### 严重问题 (必须修复)

无。

### 一般问题 (建议修复)

**#1: `getByTags` 的 `useEffect` 缺少依赖项**

- **文件**: `src/pages/SearchPage.tsx`
- **行号**: 第 60-68 行
- **描述**: `useEffect` 的依赖数组仅包含 `[selectedTagIds]`，但内部使用了 `window.api.tracks.getByTags`。React 严格模式下，`window.api` 在每次渲染时引用不变，因此实际无运行时问题。但 ESLint exhaustive-deps 规则会报 warning。
- **影响**: 轻微。仅 lint 警告，不影响运行行为。
- **建议修复**: 不需要修改，但若将来启用 ESLint，需添加 eslint-disable 注释。

### 改进建议 (可选)

**#1: `useDragOutTrack` hook 提供的回调缺少文件存在性校验**

- **文件**: `src/hooks/useDragDrop.ts`
- **描述**: 前端 `handleDragStart` 直接调用 `window.api.file.dragStart(track.file_path)`，未在前端检查 `track.file_path` 是否非空。虽然后端有检查，但前端提前校验可避免不必要的 IPC 调用。
- **建议**: 可添加 `if (!track.file_path) return;` 保护，但非必须（后端已有检查）。

## 五、代码质量评估

- **代码规范**: 8/10。文件结构清晰，命名一致（`useDragOutTrack`、`handleDragStart`），从 hook 统一导出。旧 mousedown/move/up 代码已完全清理。
- **类型安全**: 9/10。TypeScript 类型已从 `Promise<void>` 正确改为 `void`，与 `preload.js` 的 fire-and-forget 行为一致。
- **错误处理**: 8/10。后端有文件存在性校验和错误日志。前端无额外错误处理（send 不支持回调），但架构上合理——send 是 fire-and-forget，用户感知到的拖放行为本身即是反馈。
- **性能考量**: 9/10。从异步 invoke（涉及 Promise 序列化/反序列化）改为同步 send，延迟更低。`useCallback` 依赖为空数组，hook 稳定不重复创建。

## 六、IPC 边界检查

| 通道 | 主进程注册方式 | 预加载调用方式 | 是否正确 |
|------|:-----------:|:-----------:|:------:|
| `tracks:getAll` ~ `tracks:remove` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `tags:getAll` ~ `tags:setTrackTags` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `scan:start` ~ `scan:selectAndAddDir` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `search:all` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `stats:get` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `file:open` ~ `file:exists` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| **`file:dragStart`** | **`ipcMain.on`** | **`ipcRenderer.send`** | **正确（同步通道）** |
| `file:isSupportedAudio` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `file:importFiles` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |
| `app:getDbPath` ~ `app:setDbPath` | `ipcMain.handle` | `ipcRenderer.invoke` | 正确 |

- 前端代码中**无**任何 `require('electron')`、`require('fs')` 等直接 Node API 调用。
- 所有 renderer 进程的数据访问均通过 `window.api.*` 类型化接口。

## 七、测试建议

### 必测项

1. **拖出到文件管理器（高优先级）**
   - 在 MusicLibrary 页面的 `<tr>` 行上按住并拖出到 Windows 文件管理器
   - 验证：文件成功复制/移动到目标位置
   - 验证：拖拽过程中光标显示复制图标（`effectAllowed = 'copy'`）

2. **三个页面拖出一致性**
   - 在 TagManager 的标签关联曲目中拖出
   - 在 SearchPage 的搜索结果中拖出
   - 验证：三处行为一致，均可成功拖出

3. **拖拽与点击不冲突**
   - 点击 MusicLibrary 行的播放按钮、复选框、标签、操作按钮
   - 验证：普通点击操作不受影响（checkbox 可勾选、播放按钮可用、标签可增删）

4. **文件不存在情况**
   - 在数据库中保留一条 file_path 指向已删除文件的记录
   - 尝试拖出该行
   - 验证：应用不崩溃，控制台输出 `file:dragStart - 文件不存在:` 错误日志

### 回归测试

5. **拖入功能正常**
   - 从文件管理器拖音乐文件到应用窗口
   - 验证：App.tsx 的 drop overlay 显示，文件成功导入

6. **SettingsPage 拖入到扫描目录**
   - 在 SettingsPage 拖文件到特定扫描目录条目
   - 验证：文件导入到正确目录

7. **其他 IPC 功能正常**
   - 标签 CRUD、曲目播放、搜索、设置修改
   - 验证：无任何功能退化

## 八、总结

本次修改将拖出功能从 mousedown/mousemove + `ipcRenderer.invoke` 的错误异步 IPC 模式，彻底重构为 `dragstart` 事件 + `ipcRenderer.send` + `ipcMain.on` 的正确同步 IPC 模式。修改覆盖了完整的调用链（hook -> preload -> main process）和全部三个使用页面。

核心设计决策正确：
- `ipcMain.on` + `event.sender.startDrag()` 确保 `startDrag` 在 dragstart 事件上下文中**同步**执行（Electron 的硬性要求）
- `ipcRenderer.send` 是 fire-and-forget，不产生 Promise，不会导致异步上下文丢失
- 三个页面一致使用 `draggable` + `onDragStart`，代码模式统一
- 拖入相关代码（isSupportedAudio、importFiles）完全未受影响

无严重问题。建议在真实 Windows 环境下进行上述 7 项手动测试验证后合并。

**结论：通过。**

# 测试审核报告

**日期时间**: 2026-06-13 23:00:00
**审核范围**: 拖出功能第 5 次修复 — 去除 `file:dragStart` handler 中的异步 IIFE，改为纯同步调用

## 一、审核概要
- 审核结果: 有bug
- 审核文件数: 3
- 发现问题数: 4
  - 严重: 1
  - 一般: 2
  - 建议: 1

## 二、审核文件清单

| 文件 | 描述 | 是否已修改 |
|------|------|-----------|
| `main-process/ipcHandlers.js` | 主进程 IPC handler，含 `file:dragStart` 逻辑 | **未修改** — 仍含 async IIFE |
| `src/hooks/useDragDrop.ts` | 渲染进程 dragstart hook | 未修改（第4轮已确认正确） |
| `main-process/preload.js` | contextBridge 暴露 `window.api.file.dragStart` | 未修改（第4轮已确认正确） |

## 三、需求符合性检查

| 需求 | 状态 | 说明 |
|------|------|------|
| 去除 async IIFE `(async () => { ... })()` | **未满足** | 第 198-210 行仍保留 async IIFE |
| 不再使用 `await app.getFileIcon()` | **未满足** | 第 200 行仍调用 `await app.getFileIcon()` |
| `startDrag` 在同步代码路径中直接调用 | **未满足** | 仍在 async IIFE 内部异步调用 |
| icon 使用 `nativeImage.createEmpty()` 或其他同步方式 | **未满足** | 仍使用异步 `getFileIcon`，仅 catch 中回退 |
| 保留 `fs.existsSync` 检查 | 满足 | 第 194 行先做同步检查 |
| 仍是 `ipcMain.on`（非 `handle`） | 满足 | 第 193 行确认 `ipcMain.on` |
| 渲染进程 hook 同步调用 `window.api.file.dragStart()` | 满足 | 第 10 行无 setTimeout/setData，直接同步调用 |
| preload.js 仍用 `ipcRenderer.send` | 满足 | 第 52 行确认 `ipcRenderer.send` |

## 四、发现的问题

### 严重问题 (必须修复)

**1. 修复未实际应用到代码中**

- **文件**: `e:\vs_project2\music-tagger\main-process\ipcHandlers.js`
- **行号**: 191-211
- **描述**: `file:dragStart` handler 的代码与第 4 轮审核时的代码完全相同。第 198-210 行仍然使用 `(async () => { ... })()` IIFE 包裹，第 200 行仍调用 `await app.getFileIcon(filePath, { size: 'small' })`。`startDrag()` 调用仍在异步微任务中执行，脱离 dragstart 事件的同步调用链，导致拖出到资源管理器后文件无法被复制。
- **影响**: 拖出功能完全不可用 — 拖拽预览出现，但文件不会被复制到目标位置。这是本次修复要解决的根因，但修复代码未被提交/应用。
- **建议修复**:

```js
// 替换第 192-211 行为：
ipcMain.on('file:dragStart', (event, filePath) => {
    if (!fs.existsSync(filePath)) {
      console.error('file:dragStart - 文件不存在:', filePath);
      return;
    }
    // 必须同步调用 startDrag，不能用 async/await 或 setTimeout
    // 使用空的 nativeImage 作为图标（同步操作），避免异步 getFileIcon
    try {
      event.sender.startDrag({ file: filePath, icon: nativeImage.createEmpty() });
    } catch (err) {
      console.error('file:dragStart - startDrag 失败:', filePath, err);
    }
  });
```

### 一般问题 (建议修复)

**2. 缺少错误日志中的异常详情**

- **文件**: `e:\vs_project2\music-tagger\main-process\ipcHandlers.js`
- **行号**: 207
- **描述**: 外层 catch 打印失败信息时没有包含 err 对象，debug 困难。
- **影响**: 无法从控制台日志定位 startDrag 失败的具体原因。
- **建议修复**: `console.error('file:dragStart - startDrag 失败:', filePath, err);`

**3. `nativeImage` 已 import 但可能不需要异步获取图标**

- **文件**: `e:\vs_project2\music-tagger\main-process\ipcHandlers.js`
- **行号**: 1, 204
- **描述**: 已经 import 了 `nativeImage`（第1行），且在 catch 回退中使用 `nativeImage.createEmpty()`（第204行）。修复后可直接使用空图标，无需异步获取真实图标。如果未来需要显示真实图标，可考虑在渲染进程 dragstart 前预加载图标并通过 IPC 传递，但这属于优化范畴。
- **影响**: 低 — 空图标功能正常，仅缺少视觉上的文件类型图标预览。

### 改进建议 (可选)

**4. 考虑用 `fs.accessSync` 代替 `fs.existsSync`**

- **文件**: `e:\vs_project2\music-tagger\main-process\ipcHandlers.js`
- **行号**: 194
- **描述**: `fs.existsSync` 仅检查文件是否存在，不检查是否可读。用 `fs.accessSync(filePath, fs.constants.R_OK)` 可以同时检查存在性和可读性，减少后续 `startDrag` 因权限问题失败的概率。
- **理由**: 增强健壮性，提前捕获权限问题。

## 五、代码质量评估

- **代码规范**: 良好 — 缩进、命名、注释风格一致，符合项目约定。
- **类型安全**: N/A — main process 是 JavaScript，无类型检查。
- **错误处理**: 中等 — 有 existsSync 前置检查、try-catch 包裹 startDrag，但 catch 中的 error 对象未被记录。
- **性能考量**: 良好 — sync 路径无阻塞操作（移除 getFileIcon 后更是如此），fs.existsSync 开销可忽略。

## 六、IPC边界检查

- `preload.js` 第 52 行：`dragStart: (filePath) => { ipcRenderer.send('file:dragStart', filePath); }` — 正确使用 `ipcRenderer.send`（fire-and-forget），非 `invoke`
- `ipcHandlers.js` 第 193 行：`ipcMain.on('file:dragStart', ...)` — 正确使用 `on`（非 `handle`），配对一致
- `useDragDrop.ts` 第 10 行：`window.api.file.dragStart(track.file_path)` — 通过 contextBridge 调用，未直接使用 Node API
- 整个 IPC 边界无泄漏，前后端正确隔离。

**IPC 警告**：虽然协议正确（send/on 配对），但由于 handler 内部使用了 async IIFE，`startDrag()` 不是在 IPC 消息处理的同步阶段调用，而是在后续微任务中调用 — 此时渲染进程的 drag 上下文已关闭，导致拖放失败。

## 七、测试建议

修复后需验证以下场景：

1. **基本拖出**：从音乐库列表拖拽一行到 Windows 资源管理器，确认文件被复制到目标位置
2. **拖出到桌面**：拖拽文件到桌面，确认文件出现在桌面上
3. **文件不存在**：如果某首歌曲的源文件已被删除，拖拽应静默失败（不崩溃）
4. **多文件拖拽**：如果未来实现多选拖出，验证多文件同时拖出
5. **边界情况**：长路径（>260 字符）、含特殊字符的路径、网络路径（UNC path）

## 八、总结

**修复代码未被应用到文件中**。`ipcHandlers.js` 第 191-211 行与前一轮审核时的代码完全相同，仍然使用 `(async () => { ... })()` 包裹 `await app.getFileIcon()` + `startDrag()`。这是拖出功能失效的根因 — `startDrag()` 必须在 `dragstart` 事件 → `ipcRenderer.send` → `ipcMain.on` 的同步调用链中被调用，任何异步操作（await/Promise/setTimeout）都会使 drag 会话在 `startDrag` 执行前关闭。

修复方案已在上方"严重问题"中给出：去除 async IIFE，使用 `nativeImage.createEmpty()` 作为 icon，直接在 handler 的同步代码路径中调用 `event.sender.startDrag()`。

**建议**：应用修复后重新提交，然后运行 `npm run dev` 手动验证拖出功能。

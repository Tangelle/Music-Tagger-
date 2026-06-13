# 测试审核报告

**日期时间**: 2026-06-13 00:37:54
**审核范围**: 拖放功能完整实现（拖出 + 拖入），共 10 个文件

## 一、审核概要
- 审核结果: **有bug**
- 审核文件数: 10
- 发现问题数: 4
  - 严重: 1
  - 一般: 2
  - 建议: 1

## 二、审核文件清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `main-process/ipcHandlers.js` | 新增 3 个 IPC handler（dragStart/importFiles/isSupportedAudio） |
| 2 | `main-process/preload.js` | 新增 3 个 `window.api.file.*` 方法暴露 |
| 3 | `src/types.ts` | 新增 `dragStart`/`importFiles`/`isSupportedAudio` 类型声明 |
| 4 | `src/hooks/useDragDrop.ts` | 新增 `useDragOutTrack` 共享 hook |
| 5 | `src/index.css` | 新增 `tr[draggable="true"]` grab/grabbing 光标样式 |
| 6 | `src/App.tsx` | 全局拖入处理（dragEnter/Leave/Drop + 覆盖层 + Toast） |
| 7 | `src/pages/MusicLibrary.tsx` | 曲目行添加 draggable + onDragStart |
| 8 | `src/pages/TagManager.tsx` | 曲目行添加 draggable + onDragStart |
| 9 | `src/pages/SearchPage.tsx` | 曲目行添加 draggable + onDragStart |
| 10 | `src/pages/SettingsPage.tsx` | 目录行添加 onDragOver/Drop + 高亮状态 |

## 三、需求符合性检查

### 拖出功能（从曲目列表拖动歌曲到外部）

| 需求项 | 状态 | 说明 |
|--------|------|------|
| 曲目行可拖动 | **部分满足** | 三个页面均已添加 `draggable` 属性 |
| 触发 OS 文件拖放 | **有严重 bug** | 见问题 #1 — 异步 IPC 调用 `startDrag()` 可能无法正确启动拖放 |
| 文件不存在时安全处理 | **满足** | ipcHandler 检查 `fs.existsSync` |
| 拖放光标样式 | **满足** | CSS 已添加 grab/grabbing |

### 拖入功能（外部音乐文件导入）

| 需求项 | 状态 | 说明 |
|--------|------|------|
| 全局拖入（窗口级别） | **满足** | App.tsx 中 `<main>` 元素上绑定事件 |
| 覆盖层提示 | **满足** | 使用 `pointer-events-none` 不阻挡子元素 |
| dragCounter 防闪烁 | **满足** | 使用 ref 计数器模式 |
| 格式过滤 | **满足** | 逐个调用 `isSupportedAudio` 逐文件检查 |
| 无扫描目录时提示 | **满足** | Toast 提示"请先在设置中添加音乐文件夹" |
| 文件名冲突处理 | **满足** | `while (fs.existsSync(destPath))` 循环加 (1)/(2) |
| 多文件同时导入 | **满足** | `for...of` 遍历所有文件 |
| Toast 自动清除 | **满足** | setTimeout 4 秒 |
| SettingsPage 目录行拖入 | **满足** | 每个目录行绑定了 onDragOver/onDragLeave/onDrop |
| 高亮状态管理 | **满足** | `dropTargetDir` state 正确追踪 |
| `stopPropagation` 防冲突 | **满足** | 目录行事件全部 `e.stopPropagation()` |

## 四、发现的问题

### 严重问题（必须修复）

**问题 #1 — 拖出功能不可靠: 异步 IPC 调用 `startDrag()` 存在竞态条件**

- **文件**: `src/hooks/useDragDrop.ts` 第 6 行 + `main-process/ipcHandlers.js` 第 193-203 行
- **描述**: 
  `useDragOutTrack` hook 在 `dragStart` 事件中先调用 `e.preventDefault()` 取消 HTML5 原生拖放，然后通过异步 IPC (`ipcRenderer.invoke`) 调用主进程的 `webContents.startDrag()`。由于 IPC 是异步的，存在以下问题：
  1. `e.preventDefault()` 后拖放上下文已被销毁，用户松开鼠标时拖放可能尚未启动
  2. IPC 往返延迟（通常 1-5ms，但可能更高）可能导致 `startDrag()` 调用时用户已释放鼠标
  3. `startDrag()` 需要在用户手势上下文中调用，异步 IPC 可能脱离该上下文

- **影响**: 拖出功能大概率不可用，用户拖动曲目到资源管理器时无反应

- **建议修复**: 不要使用 `draggable="true"` + `onDragStart` 模式。改用 `mousedown` + `mousemove` 手动检测拖动手势，在 `mousemove` 中通过 IPC 调用 `startDrag()`。

  推荐实现方式（在 hook 中）:
  ```ts
  export function useDragOutTrack() {
    const mouseDownRef = useRef<{ x: number; y: number; track: Track } | null>(null);
    
    const handleMouseDown = useCallback((e: React.MouseEvent, track: Track) => {
      mouseDownRef.current = { x: e.clientX, y: e.clientY, track };
    }, []);
    
    const handleMouseMove = useCallback(async (e: React.MouseEvent) => {
      if (!mouseDownRef.current) return;
      const { x, y, track } = mouseDownRef.current;
      if (Math.abs(e.clientX - x) > 5 || Math.abs(e.clientY - y) > 5) {
        mouseDownRef.current = null;
        try {
          await window.api.file.dragStart(track.file_path);
        } catch (err) {
          console.error('Drag start failed:', err);
        }
      }
    }, []);
    
    return { handleMouseDown, handleMouseMove };
  }
  ```
  
  页面中的 `<tr>` 需要去 `draggable` 属性，改为绑定 `onMouseDown` 和 `onMouseMove`。

---

### 一般问题（建议修复）

**问题 #2 — TypeScript 类型与 preload 签名不一致: `importFiles` 参数结构**

- **文件**: `src/types.ts` 第 94 行 vs `main-process/preload.js` 第 53 行
- **描述**: 
  - TypeScript 声明: `importFiles: (filePaths: string[], targetDir: string) => Promise<...>`（两个独立参数）
  - preload.js 实际暴露: `importFiles: (filePaths, targetDir) => ipcRenderer.invoke('file:importFiles', { filePaths, targetDir })`（打包为单个对象）
  - 调用方 (App.tsx/SettingsPage.tsx) 以两个参数方式调用，如 `window.api.file.importFiles(audioPaths, targetDir)`
  
  虽然 JavaScript 会忽略多余参数，运行时实际传递给 preload 的是两个参数，preload 将它们打包为 `{ filePaths, targetDir }` 对象发送给 IPC。**运行时行为正确**，但 TypeScript 类型声明声明的是两个独立参数，而 IPC handler 接收的是单个对象 `{ filePaths, targetDir }`。

- **影响**: TypeScript 编译不会报错（调用方传两个参数符合类型声明），但类型声明与实际的 IPC 消息结构不匹配，容易误导后续维护者。

- **建议修复**: 将 types.ts 中的类型改为与 IPC 消息结构一致:
  ```ts
  importFiles: (filePaths: string[], targetDir: string) => Promise<...>
  // → 无需修改，这是合理的 facade 类型（隐藏 IPC 消息格式）
  ```
  这实际上是 **可接受的设计** —— TypeScript 类型作为 facade 隐藏了 IPC 消息的内部格式。调用方不需要知道 preload 如何打包参数。**将此降级为建议而非必须修复**。

- **修正评级**: 改为 **建议**

**问题 #3 — 拖入到目录行的格式过滤缺失**

- **文件**: `src/pages/SettingsPage.tsx` 第 56-80 行
- **描述**: `handleDirDrop` 没有调用 `window.api.file.isSupportedAudio()` 过滤非音频文件。虽然有 `importFiles` 在 main process 侧过滤（回传 error），但不支持的格式也会被静默尝试复制。更重要的是，如果所有文件都不受支持，`successCount` 为 0，用户看到 `scanResult` 不会被设置，没有任何反馈。

- **影响**: 
  1. 不支持的文件仍会经过 IPC 传输到主进程（浪费但无害）
  2. 如果拖入的文件全部不受支持，用户得不到任何错误提示（`scanResult` 保持为 null）

- **建议修复**: 在 `handleDirDrop` 中添加音频格式过滤，与 App.tsx 中的全局拖入保持一致:
  ```ts
  // 在 filePaths 收集之后
  const audioPaths: string[] = [];
  for (const fp of filePaths) {
    const supported = await window.api.file.isSupportedAudio(fp);
    if (supported) audioPaths.push(fp);
  }
  if (audioPaths.length === 0) {
    setScanResult('没有找到支持的音乐文件');
    return;
  }
  const results = await window.api.file.importFiles(audioPaths, targetDir);
  ```

---

### 改进建议（可选）

**建议 #1 — importFiles 的 `renamed` 字段判断逻辑有小瑕**

- **文件**: `main-process/ipcHandlers.js` 第 227-238 行
- **描述**: 冲突检测循环中 `counter` 从 1 开始，第一次 `fs.existsSync(destPath)` 为 false 时不会进入 while 循环，`counter` 仍为 1。然后 `renamed: counter > 1` 判断为 false，这是正确的（没有重命名）。但如果 `counter` 递增到 2，`renamed: counter > 1` 为 true。逻辑正确，但 `counter > 1` 的判断在 while 之后而非在存在冲突时单独标记，可读性稍差。

- **建议**: 使用单独的布尔标志更清晰:
  ```js
  let renamed = false;
  while (fs.existsSync(destPath)) {
    destPath = path.join(targetDir, `${baseName} (${counter})${ext}`);
    counter++;
    renamed = true;
  }
  ```
  当前实现功能正确，无需必须修改。

---

## 五、代码质量评估

- **代码规范**: 8/10 — 整体风格一致，2 空格缩进，命名符合 PascalCase/camelCase 约定。个别位置存在可优化但不影响功能的代码。
- **类型安全**: 7/10 — TypeScript 类型覆盖完整，Hook 返回类型自动推断。`importFiles` 类型与 IPC 结构有 facade 层面的差异（已评估为可接受）。
- **错误处理**: 8/10 — 拖出有 try-catch，拖入有 try-catch（ipcHandler 侧），文件不存在等边界条件有检查。SettingsPage 拖入缺少格式过滤和全失败反馈的一般问题（见问题 #3）。
- **性能考量**: 9/10 — dragCounter 避免频繁渲染，`useCallback` 正确使用减少重新创建。`isSupportedAudio` 逐文件调用而非批量，在文件数量不多时无影响（通常拖入文件数 < 50）。

## 六、IPC 边界检查

| 检查项 | 状态 |
|--------|------|
| 渲染进程是否只通过 `window.api.*` 访问主进程 | **通过** — 所有新代码均使用 `window.api.file.*` |
| 是否在渲染进程中使用了 `fs`/`path`/Node API | **通过** — 未发现 |
| preload.js 是否正确暴露所有新方法 | **通过** — `dragStart`/`importFiles`/`isSupportedAudio` 均已暴露 |
| `module.exports` 是否完整 | **通过** — `registerIpcHandlers` 导出保持不变 |

## 七、测试建议

### 手动测试（按优先级排列）

1. **【高优先级】拖出功能测试**: 
   - 在 MusicLibrary 页面，按住某个曲目行拖动到桌面/资源管理器
   - 验证文件是否被正确复制到目标位置
   - **重点关注**: 拖动是否响应？是否出现拖放无反应的情况？
   
2. **拖入功能测试**: 
   - 从资源管理器拖一个 mp3 到窗口中央 → 验证覆盖层显示 + 文件导入成功
   - 拖多个音乐文件 → 验证全部导入
   - 拖非音频文件（如 .txt/.jpg）→ 验证被过滤且有提示
   - 在没有扫描目录时拖入 → 验证提示"请先在设置中添加音乐文件夹"

3. **SettingsPage 目录行拖入**: 
   - 拖音乐文件到 SettingsPage 某个目录行 → 验证高亮 + 导入 + 扫描
   - 验证不会与全局拖入冲突

4. **文件名冲突**: 
   - 两次拖入同名文件 → 验证第二次文件被重命名加 (1)

5. **拖出边界**: 
   - 尝试拖动已删除文件（`file_path` 指向不存在的文件）→ 验证不崩溃且有错误返回

### 建议自动化测试

- `file:isSupportedAudio` IPC handler 单元测试（给定各种扩展名，验证返回值）
- `file:importFiles` 的文件冲突重命名逻辑单元测试

## 八、总结

拖入功能实现较为完整，边界条件处理到位（格式过滤、空目录提示、文件名冲突、多文件、Toast 反馈）。代码风格一致，未发现 IPC 边界泄露。

**但存在一个严重问题**：拖出功能的核心实现使用异步 IPC 调用 `webContents.startDrag()`，这在实践中很可能不可靠。`e.preventDefault()` + 异步 `startDrag()` 的组合不可靠，因为 `preventDefault()` 取消了 HTML5 拖放上下文，而异步 IPC 可能无法在正确的用户手势上下文中启动 OS 级拖放。

**建议**: 修复问题 #1（拖出竞态条件）后再合并。问题 #3（SettingsPage 格式过滤缺失）也应修复以保持一致性。

---

**总体结论**: 有 bug（1 个严重问题需修复），修复后可合并。

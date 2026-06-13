# Music Tagger

一款 Windows Electron 桌面应用，用于为本地音乐文件打标签。浏览、搜索并用自定义彩色标签管理你的音乐收藏。

## 截图

> 启动应用后运行 `npm run dev` 即可查看界面。

## 功能特性

- **音乐库管理** — 可排序/可筛选的曲目表格，支持批量标签分配、批量删除、拖出复制文件
- **标签管理** — 标签 CRUD、按标签查看曲目、批量删除标签
- **搜索** — 统一文本搜索 + 标签筛选交集
- **设置** — 扫描目录管理、数据库位置配置、明暗主题切换
- **拖放支持** — 从外部拖入音乐文件导入、从曲目拖出文件到资源管理器
- **播放器** — 底部音频播放栏，支持进度/音量拖动、顺序/乱序播放、上一首/下一首
- **播放统计** — 记录播放次数和最后使用时间，支持按统计排序

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 28 |
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 数据库 | sql.js (SQLite 编译为 WASM) |
| 图标 | lucide-react |
| 音频解析 | music-metadata |
| 构建 | Vite + electron-builder (NSIS) |

## 快速开始

```bash
cd music-tagger
npm install
npm run dev
```

## 项目结构

```
music-tagger/
├── main-process/        # Electron 主进程 (CommonJS)
│   ├── main.js          # 入口 — BrowserWindow 创建
│   ├── preload.js       # contextBridge IPC 暴露
│   ├── ipcHandlers.js   # ipcMain.handle 注册
│   ├── database.js      # sql.js 封装 + schema 迁移
│   ├── scanner.js       # 音乐文件扫描器
│   ├── trackService.js  # 曲目 CRUD 服务
│   ├── tagService.js    # 标签 CRUD 服务
│   └── searchService.js # 搜索服务
├── src/                 # 渲染进程 (React + TypeScript)
│   ├── components/      # 共享组件
│   │   ├── AudioPlayer.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TagBadge.tsx
│   │   └── TagSelector.tsx
│   ├── hooks/           # 自定义 hooks
│   │   ├── useTheme.ts
│   │   └── useDragDrop.ts
│   ├── pages/           # 页面组件
│   │   ├── MusicLibrary.tsx
│   │   ├── TagManager.tsx
│   │   ├── SearchPage.tsx
│   │   └── SettingsPage.tsx
│   ├── App.tsx          # 根组件
│   ├── types.ts         # TypeScript 类型定义
│   ├── index.css        # Tailwind + CSS 变量主题
│   └── main.tsx         # React 入口
├── index.html           # HTML 入口
├── package.json
└── tsconfig.json
```

## 数据库 Schema

| 表 | 字段 |
|----|------|
| `tracks` | id, file_path (UNIQUE), title, artist, album, duration, format, file_size, added_at, last_used_at, play_count |
| `tags` | id, name (UNIQUE), color, created_at |
| `track_tags` | track_id, tag_id, created_at (FK 级联删除) |
| `scan_dirs` | id, dir_path (UNIQUE), added_at |

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 — Vite + Electron 同时启动 |
| `npm run vite:dev` | 仅 Vite 开发服务器 |
| `npm run electron:dev` | 仅 Electron（需 Vite 在 5173 端口运行） |
| `npm run build` | 生产构建 — Vite + electron-builder (NSIS 安装包) |

## 架构

```
渲染进程 (React SPA)
  ↕ window.api.* (TypeScript 接口)
preload.js (contextBridge)
  ↕ ipcRenderer.invoke / send / sendSync
ipcMain.handle / on
  ↕
主进程服务 (trackService / tagService / searchService / scanner)
  ↕
sql.js (SQLite WASM)
```

**IPC 边界**：前端从不直接访问 fs、db 或 Node API。所有操作通过 `window.api.*` → preload → ipcMain handler 完成。

## License

MIT

# 🎵 Music Tagger

<div align="center">

一款精致的 **Windows 桌面应用**，用于为本地音乐收藏打标签和管理——基于 Electron、React 和 SQLite 构建。

[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> 🧑‍💻 本项目由 **16 岁初中生** 全程使用 **Claude Code** 搭配 **DeepSeek V4 Pro** 编写，0 行手写代码。

</div>

---

## ✨ 功能特性

| 分类 | 说明 |
|------|------|
| 🎶 **音乐库** | 可排序表格，支持搜索、批量标签、批量删除、拖出复制文件 |
| 🏷️ **标签管理** | 彩色标签的完整增删改查，按标签查看曲目，批量删除 |
| 🔍 **搜索** | 统一文本搜索（曲目元数据 + 标签名交集） |
| ⚙️ **设置** | 扫描目录管理、更换数据库位置、明暗主题切换 |
| 📥 **拖放** | 拖入音频文件导入，拖出曲目到资源管理器 |
| 🔊 **播放器** | 底部播放栏，支持进度/音量拖动、顺序/乱序播放 |
| 📊 **播放统计** | 记录播放次数和最后使用时间，可按使用情况排序 |

## 🚀 快速开始

```bash
git clone <仓库地址> && cd music-tagger
npm install
npm run dev          # 同时启动 Vite + Electron
```

应用窗口在 `http://localhost:5173` 打开，支持热更新。

```bash
npm run build        # 生成便携版 .exe 到 release/ 目录
```

> **前置要求：** Node.js ≥ 18（Windows）。

## 🧱 架构

```
┌─────────────────────────────────┐
│  渲染进程 (React 18 + TS)        │
│  window.api.*   ◀──────────────▶│  contextBridge
├─────────────────────────────────┤
│  主进程 (Node.js / CJS)          │
│  ipcMain handlers               │
│    ▶ trackService / tagService  │
│    ▶ searchService / scanner    │
├─────────────────────────────────┤
│  sql.js (SQLite → WASM)         │
└─────────────────────────────────┘
```

**严格的 IPC 边界**——渲染进程绝不直接访问 `fs`、`db` 或 Node API。

## 📁 项目结构

```
music-tagger/
├── main-process/           # Electron 主进程 (CommonJS)
│   ├── main.js             # BrowserWindow + 应用生命周期
│   ├── preload.js          # contextBridge API 暴露
│   ├── ipcHandlers.js      # ipcMain.handle 注册
│   ├── database.js         # sql.js 封装 + schema 迁移
│   ├── scanner.js          # 递归音乐文件扫描器
│   ├── trackService.js     # 曲目增删改查
│   ├── tagService.js       # 标签增删改查
│   └── searchService.js    # 搜索 + 统计
├── src/                    # 渲染进程 (React + TypeScript)
│   ├── components/         # Sidebar, AudioPlayer, TagBadge, TagSelector
│   ├── hooks/              # useTheme, useDragDrop
│   ├── pages/              # MusicLibrary, TagManager, SearchPage, SettingsPage
│   ├── App.tsx             # 根组件
│   ├── types.ts            # Window.api 类型声明
│   ├── index.css           # Tailwind + CSS 变量主题
│   └── main.tsx            # React 入口
├── index.html              # HTML 外壳
├── package.json
└── tsconfig.json
```

## 🗄️ 数据库结构

| 表 | 字段 |
|----|------|
| `tracks` | `id`, `file_path`（唯一）, `title`, `artist`, `album`, `duration`, `format`, `file_size`, `added_at`, `last_used_at`, `play_count` |
| `tags` | `id`, `name`（唯一）, `color`, `created_at` |
| `track_tags` | `track_id` → tracks, `tag_id` → tags（外键级联删除） |
| `scan_dirs` | `id`, `dir_path`（唯一）, `added_at` |

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron 28 |
| 前端 | React 18 · TypeScript 5 · Tailwind CSS 3 |
| 数据库 | sql.js（SQLite 编译为 WASM） |
| 图标 | lucide-react |
| 音频元数据 | music-metadata |
| 构建 | Vite 5 · electron-builder（便携版） |

## 📦 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式——Vite + Electron 同时启动 |
| `npm run vite:dev` | 仅启动 Vite 开发服务器（端口 5173） |
| `npm run electron:dev` | 仅启动 Electron（需 Vite 已在运行） |
| `npm run build` | 生产构建 → 便携版 `.exe` |
| `npm run vite:build` | 仅前端构建 → `dist/` |

## 🎨 主题

默认深色模式。通过侧边栏按钮切换——偏好保存在 `localStorage` 中，并通过内联 `<script>` **在渲染前**应用，消除闪烁。主题使用 CSS 自定义属性（`--s-*` 控制表面颜色，`--tx-*` 控制文字颜色），由 `<html>` 上的 `.dark` 类切换。

## 📄 License

MIT

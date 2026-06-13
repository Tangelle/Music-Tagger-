const { ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const trackService = require('./trackService');
const tagService = require('./tagService');
const searchService = require('./searchService');
const scanner = require('./scanner');
const { saveNow } = require('./database');

function registerIpcHandlers(mainWindow) {
  // ── Track APIs ──
  ipcMain.handle('tracks:getAll', (_event, opts) => {
    return trackService.getAllTracks(opts);
  });

  ipcMain.handle('tracks:getById', (_event, id) => {
    return trackService.getTrackById(id);
  });

  ipcMain.handle('tracks:getByTag', (_event, tagId, opts) => {
    return trackService.getTracksByTag(tagId, opts);
  });

  ipcMain.handle('tracks:getByTags', (_event, tagIds, opts) => {
    return trackService.getTracksByTags(tagIds, opts);
  });

  ipcMain.handle('tracks:recordPlay', (_event, trackId) => {
    trackService.recordPlay(trackId);
    saveNow();
    return { success: true };
  });

  ipcMain.handle('tracks:remove', async (_event, id, deleteFile) => {
    // 先获取 track 信息（删除前）
    const track = trackService.getTrackById(id);
    if (!track) return { success: false, error: '曲目不存在' };

    // 如果调用方未明确指定 deleteFile，弹出确认对话框
    if (deleteFile === undefined || deleteFile === null) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '删除曲目',
        message: `确定要删除「${track.title || track.file_path}」吗？`,
        detail: '请选择删除方式。删除文件本体后无法恢复。',
        buttons: ['仅删除记录', '删除记录和文件', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (response === 2) return { success: false, cancelled: true };
      deleteFile = (response === 1);
    }

    // 删除数据库记录
    trackService.removeTrack(id);
    saveNow();

    // 如果需要，删除物理文件
    let fileDeleted = false;
    let fileError = null;
    if (deleteFile && track.file_path) {
      try {
        if (fs.existsSync(track.file_path)) {
          fs.unlinkSync(track.file_path);
          fileDeleted = true;
        }
      } catch (err) {
        fileError = err.message;
        console.error(`删除文件失败: ${track.file_path}`, err);
      }
    }

    return { success: true, fileDeleted, fileError: fileError || null };
  });

  // ── Batch remove ──
  ipcMain.handle('tracks:removeBatch', async (_event, ids, deleteFile) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: '无效的曲目 ID 列表' };
    }

    // 预获取曲目信息用于对话框
    const tracks = ids
      .map(id => trackService.getTrackById(id))
      .filter(Boolean);

    // 如果未指定 deleteFile，弹出一次确认对话框
    if (deleteFile === undefined || deleteFile === null) {
      const titleList = tracks.slice(0, 5).map(t => t.title || t.file_path).join(', ');
      const suffix = tracks.length > 5 ? ` 等 ${tracks.length} 首` : '';
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '批量删除曲目',
        message: `确定要删除 ${tracks.length} 首曲目吗？`,
        detail: `「${titleList}${suffix}」\n请选择删除方式。删除文件本体后无法恢复。`,
        buttons: ['仅删除记录', '删除记录和文件', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (response === 2) return { success: false, cancelled: true };
      deleteFile = (response === 1);
    }

    // 逐项处理
    let deleted = 0;
    let fileDeleted = 0;
    const failures = [];

    for (const id of ids) {
      try {
        const track = trackService.removeTrack(id);
        if (!track) {
          failures.push({ id, title: `ID ${id}`, error: '曲目不存在' });
          continue;
        }
        deleted++;

        if (deleteFile && track.file_path) {
          if (fs.existsSync(track.file_path)) {
            fs.unlinkSync(track.file_path);
            fileDeleted++;
          }
        }
      } catch (err) {
        failures.push({ id, title: `ID ${id}`, error: err.message });
      }
    }

    saveNow();

    return {
      success: true,
      total: ids.length,
      deleted,
      fileDeleted,
      failures: failures.length > 0 ? failures : undefined,
    };
  });

  // ── Tag APIs ──
  ipcMain.handle('tags:getAll', () => {
    return tagService.getAllTags();
  });

  ipcMain.handle('tags:getById', (_event, id) => {
    return tagService.getTagById(id);
  });

  ipcMain.handle('tags:create', (_event, name, color) => {
    const result = tagService.createTag(name, color);
    saveNow();
    return result;
  });

  ipcMain.handle('tags:update', (_event, id, data) => {
    const result = tagService.updateTag(id, data);
    saveNow();
    return result;
  });

  ipcMain.handle('tags:delete', (_event, id) => {
    tagService.deleteTag(id);
    saveNow();
    return { success: true };
  });

  ipcMain.handle('tags:deleteBatch', async (_event, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: '无效的标签 ID 列表' };
    }

    // 预获取标签信息用于对话框
    const tags = ids
      .map(id => tagService.getTagById(id))
      .filter(Boolean);

    // 弹出确认对话框
    const titleList = tags.slice(0, 5).map(t => t.name).join(', ');
    const suffix = tags.length > 5 ? ` 等 ${tags.length} 个` : '';
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '批量删除标签',
      message: `确定要删除 ${tags.length} 个标签吗？`,
      detail: `「${titleList}${suffix}」\n删除标签后，所有曲目与该标签的关联将被解除。`,
      buttons: ['删除', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response === 1) return { success: false, cancelled: true };

    // 批量删除
    const results = tagService.deleteTags(ids);
    saveNow();

    const deleted = results.filter(r => r.deleted).length;
    const failures = results.filter(r => !r.deleted);

    return {
      success: true,
      total: ids.length,
      deleted,
      failures: failures.length > 0 ? failures : undefined,
    };
  });

  ipcMain.handle('tags:search', (_event, query) => {
    return tagService.searchTags(query);
  });

  ipcMain.handle('tags:addToTrack', (_event, trackId, tagId) => {
    tagService.addTagToTrack(trackId, tagId);
    saveNow();
    return { success: true };
  });

  ipcMain.handle('tags:removeFromTrack', (_event, trackId, tagId) => {
    tagService.removeTagFromTrack(trackId, tagId);
    saveNow();
    return { success: true };
  });

  ipcMain.handle('tags:getForTrack', (_event, trackId) => {
    return tagService.getTagsForTrack(trackId);
  });

  ipcMain.handle('tags:setTrackTags', (_event, trackId, tagIds) => {
    tagService.setTrackTags(trackId, tagIds);
    saveNow();
    return { success: true };
  });

  // ── Scanner APIs ──
  ipcMain.handle('scan:start', async () => {
    try {
      const result = await scanner.scanDirectories();
      saveNow();
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('scan:getDirs', () => {
    return scanner.getScanDirs();
  });

  ipcMain.handle('scan:addDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择音乐文件夹',
    });
    if (result.canceled || result.filePaths.length === 0) return scanner.getScanDirs();
    const dirs = scanner.addScanDir(result.filePaths[0]);
    saveNow();
    return dirs;
  });

  ipcMain.handle('scan:removeDir', (_event, dirPath) => {
    const dirs = scanner.removeScanDir(dirPath);
    saveNow();
    return dirs;
  });

  ipcMain.handle('scan:progress', () => {
    // Placeholder for streaming scan progress — handled via webContents.send
    return null;
  });

  ipcMain.handle('scan:selectAndAddDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择音乐文件夹',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    scanner.addScanDir(result.filePaths[0]);
    return result.filePaths[0];
  });

  // ── Search APIs ──
  ipcMain.handle('search:all', (_event, query, opts) => {
    return searchService.search(query, opts);
  });

  // ── Stats APIs ──
  ipcMain.handle('stats:get', () => {
    return searchService.getQuickStats();
  });

  // ── File/System APIs ──
  ipcMain.handle('file:open', (_event, filePath) => {
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.handle('file:showInFolder', (_event, filePath) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });

  ipcMain.handle('file:getAudioSrc', (_event, filePath) => {
    // Return the file:// URL for the audio file
    if (fs.existsSync(filePath)) {
      return `file:///${filePath.replace(/\\/g, '/')}`;
    }
    return null;
  });

  ipcMain.handle('file:exists', (_event, filePath) => {
    return fs.existsSync(filePath);
  });

  ipcMain.handle('app:getDbPath', () => {
    const { getDbPath } = require('./database');
    return getDbPath();
  });

  ipcMain.handle('app:selectDbPath', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '选择数据库存储位置',
      defaultPath: 'music-tagger.db',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  ipcMain.handle('app:setDbPath', async (_event, { newDbPath, copyData }) => {
    const { setDbPath } = require('./database');
    await setDbPath(newDbPath, copyData);
    return { success: true, dbPath: newDbPath };
  });

  // ── Drag & Drop APIs ──

  // 拖出：触发 OS 级文件拖放（sendSync 确保 startDrag 在 dragstart 事件上下文中同步执行）
  ipcMain.on('file:dragStart', (event, filePath) => {
    if (!fs.existsSync(filePath)) {
      console.error('file:dragStart - 文件不存在:', filePath);
      event.returnValue = false;
      return;
    }
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
    try {
      event.sender.startDrag({ file: filePath, icon });
      event.returnValue = true;
    } catch (err) {
      console.error('file:dragStart - startDrag 失败:', filePath, err);
      event.returnValue = false;
    }
  });

  // 检查文件扩展名是否为支持的音乐格式
  ipcMain.handle('file:isSupportedAudio', (_event, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return scanner.SUPPORTED_FORMATS.has(ext);
  });

  // 拖入：将文件复制到扫描目录
  ipcMain.handle('file:importFiles', async (_event, { filePaths, targetDir }) => {
    const results = [];
    for (const srcPath of filePaths) {
      try {
        const ext = path.extname(srcPath);
        const baseName = path.basename(srcPath, ext);
        let destPath = path.join(targetDir, path.basename(srcPath));

        // 检查格式
        if (!scanner.SUPPORTED_FORMATS.has(ext.toLowerCase())) {
          results.push({ src: srcPath, dest: null, error: `不支持的文件格式: ${ext}` });
          continue;
        }

        // 文件名冲突处理
        let counter = 1;
        while (fs.existsSync(destPath)) {
          destPath = path.join(targetDir, `${baseName} (${counter})${ext}`);
          counter++;
        }

        fs.copyFileSync(srcPath, destPath);
        results.push({
          src: srcPath,
          dest: destPath,
          error: null,
          renamed: counter > 1,
        });
      } catch (err) {
        results.push({ src: srcPath, dest: null, error: err.message });
      }
    }
    return results;
  });
}

module.exports = { registerIpcHandlers };

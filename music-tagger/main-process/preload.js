const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Track APIs
  tracks: {
    getAll: (opts) => ipcRenderer.invoke('tracks:getAll', opts),
    getById: (id) => ipcRenderer.invoke('tracks:getById', id),
    getByTag: (tagId, opts) => ipcRenderer.invoke('tracks:getByTag', tagId, opts),
    getByTags: (tagIds, opts) => ipcRenderer.invoke('tracks:getByTags', tagIds, opts),
    recordPlay: (trackId) => ipcRenderer.invoke('tracks:recordPlay', trackId),
    remove: (id, deleteFile) => ipcRenderer.invoke('tracks:remove', id, deleteFile),
    removeBatch: (ids, deleteFile) => ipcRenderer.invoke('tracks:removeBatch', ids, deleteFile),
  },

  // Tag APIs
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    getById: (id) => ipcRenderer.invoke('tags:getById', id),
    create: (name, color) => ipcRenderer.invoke('tags:create', name, color),
    update: (id, data) => ipcRenderer.invoke('tags:update', id, data),
    delete: (id) => ipcRenderer.invoke('tags:delete', id),
    deleteBatch: (ids) => ipcRenderer.invoke('tags:deleteBatch', ids),
    search: (query) => ipcRenderer.invoke('tags:search', query),
    addToTrack: (trackId, tagId) => ipcRenderer.invoke('tags:addToTrack', trackId, tagId),
    removeFromTrack: (trackId, tagId) => ipcRenderer.invoke('tags:removeFromTrack', trackId, tagId),
    getForTrack: (trackId) => ipcRenderer.invoke('tags:getForTrack', trackId),
    setTrackTags: (trackId, tagIds) => ipcRenderer.invoke('tags:setTrackTags', trackId, tagIds),
  },

  // Scanner APIs
  scan: {
    start: () => ipcRenderer.invoke('scan:start'),
    getDirs: () => ipcRenderer.invoke('scan:getDirs'),
    addDir: () => ipcRenderer.invoke('scan:addDir'),
    removeDir: (dirPath) => ipcRenderer.invoke('scan:removeDir', dirPath),
    selectAndAddDir: () => ipcRenderer.invoke('scan:selectAndAddDir'),
  },

  // Search
  search: {
    all: (query, opts) => ipcRenderer.invoke('search:all', query, opts),
  },

  // Stats
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
  },

  // File/System
  file: {
    open: (filePath) => ipcRenderer.invoke('file:open', filePath),
    showInFolder: (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
    getAudioSrc: (filePath) => ipcRenderer.invoke('file:getAudioSrc', filePath),
    exists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
    dragStart: (filePath) => { return ipcRenderer.sendSync('file:dragStart', filePath); },
    importFiles: (filePaths, targetDir) => ipcRenderer.invoke('file:importFiles', { filePaths, targetDir }),
    isSupportedAudio: (filePath) => ipcRenderer.invoke('file:isSupportedAudio', filePath),
  },

  // App
  app: {
    getDbPath: () => ipcRenderer.invoke('app:getDbPath'),
    selectDbPath: () => ipcRenderer.invoke('app:selectDbPath'),
    setDbPath: (newDbPath, copyData) => ipcRenderer.invoke('app:setDbPath', { newDbPath, copyData }),
  },
});

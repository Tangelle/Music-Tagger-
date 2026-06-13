import { useState, useEffect, useCallback } from 'react';
import { FolderPlus, Trash2, RefreshCw, FolderOpen, Database, HardDrive, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import type { Stats } from '../types';

interface SettingsPageProps {
  stats: Stats;
  onDataChange: () => void;
}

export default function SettingsPage({ stats, onDataChange }: SettingsPageProps) {
  const [scanDirs, setScanDirs] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState('');
  const [changingDb, setChangingDb] = useState(false);
  const [dbMessage, setDbMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  const { dark, toggleTheme } = useTheme();

  const loadDirs = useCallback(async () => {
    const dirs = await window.api.scan.getDirs();
    setScanDirs(dirs);
  }, []);

  useEffect(() => {
    loadDirs();
    window.api.app.getDbPath().then(setDbPath);
  }, [loadDirs]);

  const handleAddDir = async () => {
    const dirs = await window.api.scan.addDir();
    if (dirs) setScanDirs(dirs);
    onDataChange();
  };

  const handleRemoveDir = async (dir: string) => {
    const dirs = await window.api.scan.removeDir(dir);
    setScanDirs(dirs);
    onDataChange();
  };

  const handleDirDragOver = useCallback((e: React.DragEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetDir(dir);
  }, []);

  const handleDirDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetDir(null);
  }, []);

  const handleDirDrop = useCallback(async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetDir(null);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const filePaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i) as any;
      if (f?.path) filePaths.push(f.path);
    }

    if (filePaths.length === 0) return;

    // 过滤非音频文件
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
    const successCount = results.filter(r => !r.error).length;

    if (successCount > 0) {
      await window.api.scan.start();
      onDataChange();
      setScanResult(`导入完成: 成功 ${successCount} 首到 ${targetDir}`);
    }
  }, [onDataChange]);

  const handleChangeDb = async () => {
    setChangingDb(true);
    setDbMessage(null);
    try {
      const newPath = await window.api.app.selectDbPath();
      if (!newPath) { setChangingDb(false); return; }

      const copyData = window.confirm('是否将现有数据复制到新位置？\n\n「确定」= 复制数据\n「取消」= 创建空数据库');
      await window.api.app.setDbPath(newPath, copyData);

      setDbPath(newPath);
      setDbMessage({ text: copyData ? '数据库已迁移（数据已复制）' : '数据库位置已更改（新数据库为空）', ok: true });
      onDataChange();
    } catch (err: any) {
      setDbMessage({ text: `更改失败: ${err.message}`, ok: false });
    } finally {
      setChangingDb(false);
    }
  };

  const handleShowInFolder = (filePath: string) => {
    window.api.file.showInFolder(filePath);
  };

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await window.api.scan.start();
      if (result.error) {
        setScanResult(`扫描出错: ${result.error}`);
      } else {
        setScanResult(
          `扫描完成: 新增 ${result.newCount} 首，跳过 ${result.skippedCount} 首，共 ${result.trackCount} 首`
        );
      }
      onDataChange();
    } catch (err: any) {
      setScanResult(`扫描失败: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">设置</h2>

      {/* Music directories */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">音乐文件夹</h3>
            <p className="text-xs text-slate-500 mt-0.5">添加你需要扫描的音乐文件夹</p>
          </div>
          <button onClick={handleAddDir} className="btn-primary btn-sm">
            <FolderPlus className="w-4 h-4" /> 添加文件夹
          </button>
        </div>

        <div className="card divide-y divide-surface-700/50">
          {scanDirs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FolderOpen className="w-10 h-10 text-slate-400 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">尚未添加任何音乐文件夹</p>
              <p className="text-slate-500 dark:text-slate-600 text-xs mt-1">点击「添加文件夹」选择包含音乐的目录</p>
            </div>
          ) : (
            scanDirs.map(dir => (
              <div
                key={dir}
                className={`flex items-center gap-3 px-4 py-3 group transition-all ${
                  dropTargetDir === dir ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''
                }`}
                onDragOver={(e) => handleDirDragOver(e, dir)}
                onDragLeave={handleDirDragLeave}
                onDrop={(e) => handleDirDrop(e, dir)}
              >
                <FolderOpen className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-400 dark:text-slate-700 dark:text-slate-300 truncate">{dir}</span>
                <button
                  onClick={() => handleRemoveDir(dir)}
                  className="btn-ghost btn-xs text-slate-500 dark:text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="移除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scan control */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">扫描控制</h3>
        <button
          onClick={handleScan}
          disabled={scanning || scanDirs.length === 0}
          className={`btn-primary ${scanning ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {scanning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> 扫描中...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" /> 开始扫描
            </>
          )}
        </button>

        {scanResult && (
          <p className={`text-sm animate-fade-in ${
            scanResult.includes('失败') || scanResult.includes('出错') ? 'text-red-400' : 'text-green-400'
          }`}>
            {scanResult}
          </p>
        )}
      </div>

      {/* Stats & Info */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">信息</h3>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-500 flex-shrink-0">数据库位置</span>
            <span className="flex-1 text-sm text-slate-400 dark:text-slate-700 dark:text-slate-300 truncate font-mono text-right min-w-0">{dbPath}</span>
            <button
              onClick={() => handleShowInFolder(dbPath)}
              className="btn-ghost btn-xs text-slate-500 hover:text-slate-400 dark:text-slate-700 dark:text-slate-300 flex-shrink-0"
              title="在文件夹中显示"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleChangeDb}
              disabled={changingDb}
              className={`btn-primary btn-xs flex-shrink-0 ${changingDb ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {changingDb ? '更改中...' : '更改'}
            </button>
          </div>
          {dbMessage && (
            <div className={`text-xs animate-fade-in ${dbMessage.ok ? 'text-green-400' : 'text-red-400'}`}>
              {dbMessage.text}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-500">统计</span>
            <span className="flex-1 text-sm text-slate-400 dark:text-slate-700 dark:text-slate-300 text-right">
              {stats.trackCount} 首曲目 / {stats.tagCount} 个标签 / {stats.dirCount} 个目录
            </span>
          </div>
        </div>
      </div>

      {/* 外观 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">外观</h3>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {dark ? (
                <Moon className="w-5 h-5 text-indigo-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <div>
                <p className="text-sm text-txt-body">主题模式</p>
                <p className="text-xs text-txt-muted mt-0.5">
                  当前: {dark ? '深色模式' : '浅色模式'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              style={{ backgroundColor: dark ? '#4f46e5' : '#cbd5e1' }}
              role="switch"
              aria-checked={dark}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                  dark ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

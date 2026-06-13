import { useState, useEffect, useCallback, useRef } from 'react';
import { Music } from 'lucide-react';
import Sidebar from './components/Sidebar';
import AudioPlayer from './components/AudioPlayer';
import MusicLibrary from './pages/MusicLibrary';
import TagManager from './pages/TagManager';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import type { Track, Stats } from './types';

export type Page = 'library' | 'tags' | 'search' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('library');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [stats, setStats] = useState<Stats>({ trackCount: 0, tagCount: 0, dirCount: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const dragCounterRef = useRef(0);
  const playlistRef = useRef<{ tracks: Track[]; index: number }>({ tracks: [], index: -1 });
  const [shuffleMode, setShuffleMode] = useState<boolean>(false);
  const shuffleHistoryRef = useRef<number[]>([]);

  const refreshData = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    window.api.stats.get().then(setStats).catch(console.error);
  }, [refreshKey]);

  const playTrack = useCallback(async (track: Track, playlist?: Track[], index?: number) => {
    const exists = await window.api.file.exists(track.file_path);
    if (exists) {
      setCurrentTrack(track);
      if (playlist && index !== undefined) {
        playlistRef.current = { tracks: playlist, index };
        if (shuffleMode) {
          shuffleHistoryRef.current = [index];
        }
      } else {
        playlistRef.current = { tracks: [], index: -1 };
        shuffleHistoryRef.current = [];
      }
    }
  }, [shuffleMode]);

  const playPrev = useCallback(() => {
    if (shuffleMode) {
      const history = shuffleHistoryRef.current;
      if (history.length <= 1) return;
      history.pop();
      const prevIndex = history[history.length - 1];
      const { tracks } = playlistRef.current;
      if (prevIndex >= 0 && prevIndex < tracks.length) {
        setCurrentTrack(tracks[prevIndex]);
        playlistRef.current = { tracks, index: prevIndex };
      }
      return;
    }
    const { tracks, index } = playlistRef.current;
    if (tracks.length === 0 || index <= 0) return;
    playTrack(tracks[index - 1], tracks, index - 1);
  }, [playTrack, shuffleMode]);

  const playNext = useCallback(() => {
    if (shuffleMode) {
      const { tracks } = playlistRef.current;
      if (tracks.length === 0) return;
      const playedSet = new Set(shuffleHistoryRef.current);
      const remaining = tracks
        .map((_, i) => i)
        .filter(i => !playedSet.has(i));
      if (remaining.length === 0) return;
      const randomIndex = remaining[Math.floor(Math.random() * remaining.length)];
      shuffleHistoryRef.current.push(randomIndex);
      setCurrentTrack(tracks[randomIndex]);
      playlistRef.current = { tracks, index: randomIndex };
      return;
    }
    const { tracks, index } = playlistRef.current;
    if (tracks.length === 0 || index >= tracks.length - 1 || index < 0) return;
    playTrack(tracks[index + 1], tracks, index + 1);
  }, [playTrack, shuffleMode]);

  const toggleShuffle = useCallback(() => {
    setShuffleMode(prev => {
      const next = !prev;
      if (next) {
        if (playlistRef.current.index >= 0) {
          shuffleHistoryRef.current = [playlistRef.current.index];
        }
      } else {
        shuffleHistoryRef.current = [];
      }
      return next;
    });
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current += 1;
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 不累加 dragCounterRef — 只在 dragEnter/dragLeave 中计数
    // onDragOver 仅需要 preventDefault 告知浏览器该区域接受 drop
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 确保遮罩消失 — 无论拖入什么文件类型，drop 时都要清除
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    const filePaths: string[] = [];
    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles.item(i);
      if (file) {
        const f = file as any;
        if (f.path && typeof f.path === 'string') {
          filePaths.push(f.path);
        }
      }
    }

    if (filePaths.length === 0) return;

    const audioPaths: string[] = [];
    for (const fp of filePaths) {
      const supported = await window.api.file.isSupportedAudio(fp);
      if (supported) audioPaths.push(fp);
    }

    if (audioPaths.length === 0) {
      setImportFeedback({ text: '没有找到支持的音乐文件', ok: false });
      setTimeout(() => setImportFeedback(null), 4000);
      return;
    }

    const scanDirs = await window.api.scan.getDirs();
    if (scanDirs.length === 0) {
      setImportFeedback({ text: '请先在设置中添加音乐文件夹', ok: false });
      setTimeout(() => setImportFeedback(null), 4000);
      return;
    }

    const targetDir = scanDirs[0];
    const results = await window.api.file.importFiles(audioPaths, targetDir);
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;

    if (successCount > 0) {
      setImportFeedback({
        text: `成功导入 ${successCount} 首${failCount > 0 ? `，${failCount} 首失败` : ''}`,
        ok: true,
      });
      await window.api.scan.start();
      refreshData();
    } else {
      setImportFeedback({ text: '导入失败', ok: false });
    }
    setTimeout(() => setImportFeedback(null), 4000);
  }, [refreshData]);

  const renderPage = () => {
    switch (currentPage) {
      case 'library':
        return (
          <MusicLibrary
            key={refreshKey}
            onPlayTrack={playTrack}
            currentTrack={currentTrack}
            onDataChange={refreshData}
          />
        );
      case 'tags':
        return (
          <TagManager
            key={refreshKey}
            onPlayTrack={playTrack}
            onDataChange={refreshData}
          />
        );
      case 'search':
        return (
          <SearchPage
            key={refreshKey}
            onPlayTrack={playTrack}
            currentTrack={currentTrack}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            key={refreshKey}
            stats={stats}
            onDataChange={refreshData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950">
      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          stats={stats}
        />

        {/* Page content */}
        <main
          className="flex-1 overflow-hidden flex flex-col relative"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drop zone overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/10 border-2 border-dashed border-indigo-500 rounded-lg m-4 pointer-events-none">
              <div className="text-center">
                <Music className="w-12 h-12 text-indigo-400 mx-auto mb-2" />
                <p className="text-indigo-300 font-medium text-sm">释放以导入音乐文件</p>
                <p className="text-indigo-400/60 text-xs mt-1">文件将复制到第一个扫描目录</p>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="animate-fade-in">
              {renderPage()}
            </div>
          </div>
        </main>
      </div>

      {/* Bottom audio player bar */}
      {currentTrack && (
        <AudioPlayer
          track={currentTrack}
          onClose={() => {
            setCurrentTrack(null);
            playlistRef.current = { tracks: [], index: -1 };
            shuffleHistoryRef.current = [];
          }}
          onPrev={
            playlistRef.current.tracks.length > 0 &&
            (shuffleMode || playlistRef.current.index > 0)
              ? playPrev : null
          }
          onNext={
            playlistRef.current.tracks.length > 0 &&
            (shuffleMode || (playlistRef.current.index < playlistRef.current.tracks.length - 1 && playlistRef.current.index >= 0))
              ? playNext : null
          }
          shuffleMode={shuffleMode}
          onToggleShuffle={toggleShuffle}
        />
      )}

      {/* Toast feedback */}
      {importFeedback && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in ${
            importFeedback.ok ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100'
          }`}
        >
          {importFeedback.text}
        </div>
      )}
    </div>
  );
}

export default App;

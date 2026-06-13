import { useState, useEffect, useCallback } from 'react';
import { Play, FolderOpen, Trash2, Music, Plus, ArrowUpDown } from 'lucide-react';
import TagBadge from '../components/TagBadge';
import TagSelector from '../components/TagSelector';
import { useDragOutTrack } from '../hooks/useDragDrop';
import type { Track, Tag } from '../types';

interface MusicLibraryProps {
  onPlayTrack: (track: Track, playlist?: Track[], index?: number) => void;
  currentTrack: Track | null;
  onDataChange: () => void;
}

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'format' | 'added_at' | 'last_used_at' | 'play_count';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'added_at', label: '添加时间' },
  { value: 'last_used_at', label: '最后使用时间' },
  { value: 'play_count', label: '使用次数' },
  { value: 'title', label: '标题' },
  { value: 'artist', label: '艺术家' },
  { value: 'album', label: '专辑' },
  { value: 'duration', label: '时长' },
  { value: 'format', label: '格式' },
];

// 自然排序方向：时间/计数类默认降序（新的/多的在前），其他默认升序
const getDefaultSortDir = (field: SortField): 'ASC' | 'DESC' => {
  if (field === 'added_at' || field === 'last_used_at' || field === 'play_count') {
    return 'DESC';
  }
  return 'ASC';
};

export default function MusicLibrary({ onPlayTrack, currentTrack, onDataChange }: MusicLibraryProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('added_at');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(getDefaultSortDir('added_at'));
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { handleDragStart } = useDragOutTrack();

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.tracks.getAll({ search, sortBy, sortDir, limit: 500 });
      setTracks(result.tracks);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortDir]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const handleSortFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const field = e.target.value as SortField;
    setSortBy(field);
    setSortDir(getDefaultSortDir(field));
  };

  const toggleSortDir = () => {
    setSortDir(prev => prev === 'ASC' ? 'DESC' : 'ASC');
  };

  const handleAddTag = async (tagId: number) => {
    for (const trackId of selectedIds) {
      await window.api.tags.addToTrack(trackId, tagId);
    }
    onDataChange();
    loadTracks();
  };

  const handleRemoveTag = async (trackId: number, tagId: number) => {
    await window.api.tags.removeFromTrack(trackId, tagId);
    onDataChange();
    loadTracks();
  };

  const handleRemoveTrack = async (id: number) => {
    const result = await window.api.tracks.remove(id);
    if (result.cancelled) return;
    if (result.fileError) {
      console.error('文件删除失败:', result.fileError);
    }
    onDataChange();
    loadTracks();
  };

  const handleRemoveBatch = async () => {
    const result = await window.api.tracks.removeBatch([...selectedIds]);
    if (result.cancelled) return;
    setSelectedIds(new Set());
    if (result.failures && result.failures.length > 0) {
      console.error('部分删除失败:', result.failures);
    }
    onDataChange();
    loadTracks();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === tracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tracks.map(t => t.id)));
    }
  };

  const formatDuration = (s: number | null) => {
    if (!s) return '-';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-txt-heading">音乐库</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total} 首曲目</p>
        </div>
      </div>

      {/* Search + batch actions */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="搜索音乐库..."
            className="input pl-4 pr-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 animate-fade-in">
            <span className="text-xs text-txt-label">{selectedIds.size} 首已选</span>
            <TagSelector
              selectedTagIds={[]}
              onAddTag={handleAddTag}
              onRemoveTag={() => {}}
            />
            <button
              onClick={handleRemoveBatch}
              className="btn-danger btn-sm"
              title="批量删除选中曲目"
            >
              <Trash2 className="w-3.5 h-3.5" /> 删除选中
            </button>
          </div>
        )}

        <button onClick={loadTracks} className="btn-secondary btn-sm">
          刷新
        </button>
      </div>

      {/* 排序控件 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-txt-muted">排序</span>
          <select
            value={sortBy}
            onChange={handleSortFieldChange}
            className="input py-1 px-2 text-sm w-auto"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={toggleSortDir}
          className="btn-ghost btn-xs flex items-center gap-1"
          title={sortDir === 'ASC' ? '升序' : '降序'}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="text-xs">{sortDir === 'ASC' ? '升序' : '降序'}</span>
        </button>
      </div>

      {/* Track table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tracks.length && tracks.length > 0}
                    onChange={selectAll}
                    className="rounded bg-surface-700 border-surface-600 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">
                  标题
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">
                  艺术家
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">
                  专辑
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">
                  时长
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-txt-subtle uppercase tracking-wider">
                  格式
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标签</th>
                <th className="w-20 px-3 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {tracks.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Music className="w-10 h-10 text-txt-faint mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">还没有音乐</p>
                    <p className="text-txt-label text-xs mt-1">前往「设置」添加音乐文件夹并扫描</p>
                  </td>
                </tr>
              )}
              {tracks.map((track, index) => (
                <tr
                  key={track.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, track)}
                  className={`border-b border-surface-800/50 transition-colors ${
                    currentTrack?.id === track.id
                      ? 'bg-indigo-600/10'
                      : 'hover:bg-surface-800/30'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(track.id)}
                      onChange={() => toggleSelect(track.id)}
                      className="rounded bg-surface-700 border-surface-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onPlayTrack(track, tracks, index)}
                        className={`p-1.5 rounded-md transition-colors ${
                          currentTrack?.id === track.id
                            ? 'text-indigo-400 bg-indigo-600/20'
                            : 'text-txt-label hover:text-txt-secondary hover:bg-surface-700'
                        }`}
                        title="播放"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <span className="text-sm text-slate-800 dark:text-slate-200 max-w-[200px] truncate block" title={track.title}>
                        {track.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={track.artist || undefined}>
                    {track.artist || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={track.album || undefined}>
                    {track.album || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-slate-500 tabular-nums">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-slate-500 uppercase font-mono bg-surface-800 px-1.5 py-0.5 rounded">
                      {track.format || '?'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {track.tags.map(tag => (
                        <TagBadge
                          key={tag.id}
                          tag={tag}
                          size="sm"
                          onRemove={(t) => handleRemoveTag(track.id, t.id)}
                        />
                      ))}
                      <TagSelector
                        selectedTagIds={track.tags.map(t => t.id)}
                        onAddTag={async (tagId) => {
                          await window.api.tags.addToTrack(track.id, tagId);
                          loadTracks();
                          onDataChange();
                        }}
                        onRemoveTag={async (tagId) => {
                          await window.api.tags.removeFromTrack(track.id, tagId);
                          loadTracks();
                          onDataChange();
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => window.api.file.showInFolder(track.file_path)}
                        className="btn-ghost btn-xs"
                        title="在文件夹中显示"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveTrack(track.id)}
                        className="btn-ghost btn-xs text-slate-500 dark:text-slate-600 hover:text-red-400"
                        title="从库中移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-600 text-center">
        显示 {tracks.length} / {total} 首曲目
      </p>
    </div>
  );
}

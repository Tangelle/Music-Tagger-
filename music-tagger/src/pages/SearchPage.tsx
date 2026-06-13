import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Play, FolderOpen, Tag as TagIcon, Music, X } from 'lucide-react';
import TagBadge from '../components/TagBadge';
import { useDragOutTrack } from '../hooks/useDragDrop';
import type { Track, Tag } from '../types';

interface SearchPageProps {
  onPlayTrack: (track: Track, playlist?: Track[], index?: number) => void;
  currentTrack: Track | null;
}

export default function SearchPage({ onPlayTrack, currentTrack }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tagFilteredTracks, setTagFilteredTracks] = useState<Track[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { handleDragStart } = useDragOutTrack();

  useEffect(() => {
    inputRef.current?.focus();
    window.api.tags.getAll().then(setAllTags);
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim() && selectedTagIds.size === 0) {
      setTracks([]);
      setTags([]);
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.search.all(query.trim(), { limit: 100 });
      setTracks(result.tracks);
      setTags(result.tags);
    } finally {
      setLoading(false);
    }
  }, [query, selectedTagIds]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      doSearch();
    }
  };

  const toggleTagFilter = useCallback(async (tagId: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  // When tag filters change, fetch tracks by those tags
  useEffect(() => {
    if (selectedTagIds.size > 0) {
      window.api.tracks.getByTags([...selectedTagIds]).then(tracks => {
        setTagFilteredTracks(tracks);
      });
    } else {
      setTagFilteredTracks(null);
    }
  }, [selectedTagIds]);

  // If query also searches tracks, merge results
  const displayTracks = (() => {
    if (selectedTagIds.size > 0 && tagFilteredTracks) {
      if (tracks.length > 0 && query.trim()) {
        // Intersection: tracks that match both tag filter AND text search
        const textTrackIds = new Set(tracks.map(t => t.id));
        return tagFilteredTracks.filter(t => textTrackIds.has(t.id));
      }
      return tagFilteredTracks;
    }
    return tracks;
  })();

  const showTagFilteredOnly = selectedTagIds.size > 0 && !query.trim();
  const selectedTags = allTags.filter(t => selectedTagIds.has(t.id));

  return (
    <div className="p-6 space-y-5">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">搜索</h2>

      {/* Search input */}
      <div className="relative max-w-2xl">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索音乐或标签..."
          className="input pl-11 pr-4 py-3 text-base rounded-xl"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={doSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary btn-sm rounded-lg"
        >
          搜索
        </button>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-600 uppercase tracking-wider">按标签筛选</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id)}
                className={`badge cursor-pointer transition-all ${
                  selectedTagIds.has(tag.id)
                    ? 'ring-2 ring-white/30'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  border: `1px solid ${tag.color}30`,
                }}
              >
                {tag.name}
                {selectedTagIds.has(tag.id) && <X className="w-2.5 h-2.5 ml-1" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm">搜索中...</span>
        </div>
      )}

      {/* Results */}
      {!loading && (displayTracks.length > 0 || tags.length > 0 || showTagFilteredOnly) && (
        <div className="space-y-6 animate-fade-in">
          {/* Tag results */}
          {tags.length > 0 && query.trim() && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <TagIcon className="w-4 h-4" /> 标签 ({tags.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTagFilter(tag.id)}
                    className="card px-3 py-2 flex items-center gap-2 hover:bg-surface-800 transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm text-slate-400 dark:text-slate-700 dark:text-slate-300">{tag.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-600">{tag.track_count ?? 0} 首</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Track results */}
          {(displayTracks.length > 0 || showTagFilteredOnly) && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <Music className="w-4 h-4" />
                音乐 ({displayTracks.length})
                {selectedTags.length > 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-600">
                    — 标签: {selectedTags.map(t => t.name).join(', ')}
                  </span>
                )}
              </h3>

              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-700/50">
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标题</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">艺术家</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">专辑</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标签</th>
                      <th className="w-16 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayTracks.map((track, index) => (
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
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onPlayTrack(track, displayTracks, index)}
                              className={`p-1 rounded ${
                                currentTrack?.id === track.id
                                  ? 'text-indigo-400 bg-indigo-600/20'
                                  : 'text-slate-500 dark:text-slate-600 hover:text-slate-400 dark:text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                            <span className="text-sm text-slate-800 dark:text-slate-200 truncate max-w-[200px] block">{track.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{track.artist || '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{track.album || '-'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {track.tags.map(t => (
                              <TagBadge key={t.id} tag={t} size="sm" />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => window.api.file.showInFolder(track.file_path)}
                            className="btn-ghost btn-xs"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && query.trim() && displayTracks.length === 0 && tags.length === 0 && !showTagFilteredOnly && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-slate-400 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">没有找到匹配的结果</p>
        </div>
      )}

      {!loading && !query.trim() && selectedTagIds.size === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-slate-400 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">输入关键词或选择标签来搜索</p>
        </div>
      )}
    </div>
  );
}

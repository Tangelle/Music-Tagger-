import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, Play, FolderOpen, Tags, Check, X } from 'lucide-react';
import TagBadge from '../components/TagBadge';
import { useDragOutTrack } from '../hooks/useDragDrop';
import type { Tag, Track } from '../types';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#c026d3', '#d946ef',
  '#ec4899', '#f43f5e', '#78716c', '#6b7280',
];

interface TagManagerProps {
  onPlayTrack: (track: Track) => void;
  onDataChange: () => void;
}

export default function TagManager({ onPlayTrack, onDataChange }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [tagTracks, setTagTracks] = useState<Track[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const { handleDragStart } = useDragOutTrack();

  // Modal state — shared for create & edit
  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    name: string;
    color: string;
    tagId?: number;
  }>({ open: false, mode: 'create', name: '', color: '#6366f1' });

  const loadTags = useCallback(async () => {
    const data = await window.api.tags.getAll();
    setTags(data);
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (selectedTag) {
      window.api.tracks.getByTag(selectedTag.id).then(setTagTracks);
    }
  }, [selectedTag]);

  // ── Modal actions ──

  const openCreate = () => {
    setModal({ open: true, mode: 'create', name: '', color: '#6366f1' });
  };

  const openEdit = (tag: Tag) => {
    setModal({ open: true, mode: 'edit', name: tag.name, color: tag.color, tagId: tag.id });
  };

  const closeModal = () => {
    setModal(prev => ({ ...prev, open: false }));
  };

  const handleModalConfirm = async () => {
    const name = modal.name.trim();
    if (!name) return;

    if (modal.mode === 'create') {
      await window.api.tags.create(name, modal.color);
    } else if (modal.tagId != null) {
      await window.api.tags.update(modal.tagId, { name, color: modal.color });
    }

    closeModal();
    onDataChange();
    loadTags();
  };

  const handleDelete = async (id: number) => {
    await window.api.tags.delete(id);
    if (selectedTag?.id === id) setSelectedTag(null);
    onDataChange();
    loadTags();
  };

  const toggleTagSelect = (id: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = tags.map(t => t.id);
    if (allIds.every(id => selectedTagIds.has(id))) {
      setSelectedTagIds(new Set());
    } else {
      setSelectedTagIds(new Set(allIds));
    }
  };

  const handleDeleteBatch = async () => {
    const result = await window.api.tags.deleteBatch([...selectedTagIds]);
    if (result.cancelled) return;
    setSelectedTagIds(new Set());
    setSelectedTag(null);
    onDataChange();
    loadTags();
  };

  const handleRemoveTagFromTrack = async (trackId: number, tagId: number) => {
    await window.api.tags.removeFromTrack(trackId, tagId);
    if (selectedTag) {
      window.api.tracks.getByTag(selectedTag.id).then(setTagTracks);
    }
    onDataChange();
    loadTags();
  };

  // ── Keyboard shortcut for modal ──
  const handleModalKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleModalConfirm();
    if (e.key === 'Escape') closeModal();
  };

  return (
    <div className="p-6 space-y-4 flex gap-6">
      {/* ═══ Left: Tag list ═══ */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">标签管理</h2>
          <button onClick={openCreate} className="btn-primary btn-xs">
            <Plus className="w-3 h-3" /> 新建
          </button>
        </div>

        {/* Tag list */}
        <div className="space-y-1">
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={tags.length > 0 && tags.every(t => selectedTagIds.has(t.id))}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded accent-indigo-500"
              />
              <span className="text-xs text-slate-500 dark:text-slate-600 flex-1">全选</span>
              {selectedTagIds.size > 0 && (
                <button
                  onClick={handleDeleteBatch}
                  className="btn-danger btn-xs"
                  title="删除选中标签"
                >
                  <Trash2 className="w-3 h-3" /> 删除 ({selectedTagIds.size})
                </button>
              )}
            </div>
          )}
          {tags.length === 0 && (
            <div className="text-center py-10">
              <Tags className="w-8 h-8 text-slate-400 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-600">还没有标签</p>
              <p className="text-xs text-slate-400 dark:text-slate-700 mt-0.5">点击「新建」创建第一个标签</p>
            </div>
          )}
          {tags.map(tag => (
            <div
              key={tag.id}
              onClick={() => setSelectedTag(tag)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer group ${
                selectedTag?.id === tag.id
                  ? 'bg-surface-800 border border-surface-600'
                  : 'hover:bg-surface-800/50 border border-transparent'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedTagIds.has(tag.id)}
                onChange={() => toggleTagSelect(tag.id)}
                className="w-3.5 h-3.5 rounded accent-indigo-500 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 text-left text-slate-400 dark:text-slate-700 dark:text-slate-300 truncate">{tag.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-600 bg-surface-700 px-1.5 py-0.5 rounded-full">
                {tag.track_count ?? 0}
              </span>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(tag);
                  }}
                  className="btn-ghost btn-xs"
                  title="编辑"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(tag.id);
                  }}
                  className="btn-ghost btn-xs text-slate-500 dark:text-slate-600 hover:text-red-400"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Right: Tracks for selected tag ═══ */}
      <div className="flex-1 min-w-0">
        {selectedTag ? (
          <div className="space-y-3 animate-slide-in-right">
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedTag.color }}
              />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{selectedTag.name}</h3>
              <span className="text-sm text-slate-500">{tagTracks.length} 首</span>
            </div>

            {tagTracks.length === 0 ? (
              <div className="card p-8 text-center">
                <Tags className="w-10 h-10 text-slate-400 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">该标签下没有音乐</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-700/50">
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标题</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">艺术家</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">专辑</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">标签</th>
                      <th className="w-16 px-3 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagTracks.map(track => (
                      <tr
                        key={track.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, track)}
                        className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onPlayTrack(track)}
                              className="p-1 rounded text-slate-500 dark:text-slate-600 hover:text-slate-400 dark:text-slate-700 dark:text-slate-300 hover:bg-surface-700"
                            >
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                            <span className="text-sm text-slate-800 dark:text-slate-200 truncate max-w-[180px] block">{track.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{track.artist || '-'}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{track.album || '-'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {track.tags.map(t => (
                              <TagBadge
                                key={t.id}
                                tag={t}
                                size="sm"
                                onRemove={(tag) => handleRemoveTagFromTrack(track.id, tag.id)}
                              />
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
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full py-20">
            <div className="text-center">
              <Tags className="w-12 h-12 text-slate-400 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">选择一个标签查看关联的音乐</p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Modal: Create / Edit tag ═══ */}
      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={closeModal}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

          {/* Dialog */}
          <div
            className="relative w-[380px] max-w-[95vw] card shadow-2xl shadow-black/40 border-surface-600 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKey}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Tags className="w-4 h-4 text-indigo-400" />
                {modal.mode === 'create' ? '新建标签' : '编辑标签'}
              </h3>
              <button onClick={closeModal} className="btn-ghost btn-xs text-slate-500 hover:text-slate-400 dark:text-slate-700 dark:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-5 space-y-4">
              {/* Name input + live preview */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">名称</label>
                  <input
                    type="text"
                    placeholder="输入标签名称..."
                    className="input py-2.5 text-sm"
                    value={modal.name}
                    onChange={(e) => setModal(prev => ({ ...prev, name: e.target.value }))}
                    onKeyDown={handleModalKey}
                    autoFocus
                  />
                </div>

                {/* Live preview */}
                {modal.name.trim() && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="text-xs text-slate-500">预览:</span>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${modal.color}20`,
                        color: modal.color,
                        border: `1px solid ${modal.color}40`,
                      }}
                    >
                      {modal.name.trim()}
                    </span>
                  </div>
                )}
              </div>

              {/* Color picker */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 block">颜色</label>
                <div className="grid grid-cols-4 gap-2">
                  {TAG_COLORS.map(c => {
                    const isSelected = modal.color === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setModal(prev => ({ ...prev, color: c }))}
                        className={`relative h-10 rounded-lg transition-all duration-150 flex items-center justify-center ${
                          isSelected
                            ? 'ring-2 ring-white/40 scale-105'
                            : 'hover:scale-105 hover:ring-1 hover:ring-white/20'
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      >
                        {isSelected && (
                          <Check
                            className="w-5 h-5 text-slate-900 dark:text-white drop-shadow-md"
                            strokeWidth={3}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5 pt-1">
              <button
                onClick={handleModalConfirm}
                disabled={!modal.name.trim()}
                className={`btn-primary flex-1 ${!modal.name.trim() ? 'opacity-40 pointer-events-none' : ''}`}
              >
                {modal.mode === 'create' ? (
                  <><Plus className="w-4 h-4" /> 创建标签</>
                ) : (
                  <><Check className="w-4 h-4" /> 保存修改</>
                )}
              </button>
              <button onClick={closeModal} className="btn-secondary">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

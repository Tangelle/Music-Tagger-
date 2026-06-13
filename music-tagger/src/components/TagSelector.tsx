import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, Search } from 'lucide-react';
import type { Tag } from '../types';

interface TagSelectorProps {
  selectedTagIds: number[];
  onAddTag: (tagId: number) => void;
  onRemoveTag: (tagId: number) => void;
}

export default function TagSelector({ selectedTagIds, onAddTag, onRemoveTag }: TagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, openUpward: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 320; // max-h-48 (192px) + header/footer ~128px 估算
      const spaceBelow = window.innerHeight - rect.bottom;
      // 如果下方空间不足且上方空间更大，则向上弹出
      const openUpward = spaceBelow < dropdownHeight && rect.top > spaceBelow;
      setPosition({
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - 280),
        openUpward,
      });
    }
    window.api.tags.getAll().then(setAllTags);
    setSearch('');
    setNewTagName('');
    setIsOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };
    // 关闭由外部滚动引起，但忽略下拉面板自身内部的滚动
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, closeDropdown]);

  const unselectedTags = allTags.filter(t => !selectedTagIds.includes(t.id));
  const filteredTags = search
    ? unselectedTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : unselectedTags;

  const handleCreateAndAdd = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    const tag = await window.api.tags.create(name);
    onAddTag(tag.id);
    setNewTagName('');
    setAllTags(prev => [...prev, tag]);
  }, [newTagName, onAddTag]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateAndAdd();
    }
    if (e.key === 'Escape') {
      closeDropdown();
    }
  }, [handleCreateAndAdd, closeDropdown]);

  const dropdown = isOpen && (
    <div
      ref={dropdownRef}
      className={`fixed z-[9999] w-64 card shadow-2xl shadow-black/50 border-surface-600 animate-fade-in ${
        position.openUpward ? 'translate-y-[-100%]' : ''
      }`}
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-2 border-b border-surface-700/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="搜索或创建标签..."
            className="input pl-8 py-1.5 text-xs"
            value={search || newTagName}
            onChange={(e) => {
              setSearch(e.target.value);
              setNewTagName(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto p-1.5">
        {filteredTags.length === 0 && !newTagName.trim() && (
          <p className="text-xs text-slate-500 px-2 py-3 text-center">输入关键词创建新标签</p>
        )}

        {newTagName.trim() && !allTags.find(t => t.name.toLowerCase() === newTagName.trim().toLowerCase()) && (
          <button
            onClick={handleCreateAndAdd}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs text-indigo-400 hover:bg-indigo-600/10 transition-colors"
          >
            <Plus className="w-3 h-3" />
            创建标签「{newTagName.trim()}」
          </button>
        )}

        {filteredTags.map(tag => (
          <button
            key={tag.id}
            onClick={() => onAddTag(tag.id)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs hover:bg-surface-800 transition-colors"
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <span className="flex-1 text-left text-txt-body">{tag.name}</span>
            <span className="text-txt-muted">{tag.track_count ?? 0}</span>
          </button>
        ))}
      </div>

      {selectedTagIds.length > 0 && (
        <div className="p-2 border-t border-surface-700/50">
          <p className="text-[10px] text-txt-muted mb-1.5 uppercase tracking-wider">已选标签</p>
          <div className="flex flex-wrap gap-1">
            {allTags.filter(t => selectedTagIds.includes(t.id)).map(tag => (
              <button
                key={tag.id}
                onClick={() => onRemoveTag(tag.id)}
                className="badge cursor-pointer hover:opacity-70 transition-opacity"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  border: `1px solid ${tag.color}30`,
                }}
              >
                {tag.name}
                <Check className="w-2.5 h-2.5 ml-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openDropdown}
        className="btn-secondary btn-xs flex-shrink-0"
      >
        <Plus className="w-3 h-3" />
        标签
      </button>

      {createPortal(dropdown, document.body)}
    </>
  );
}

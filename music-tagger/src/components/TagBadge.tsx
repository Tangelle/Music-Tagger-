import { X } from 'lucide-react';
import type { Tag } from '../types';

interface TagBadgeProps {
  tag: Tag;
  onRemove?: (tag: Tag) => void;
  onClick?: (tag: Tag) => void;
  size?: 'sm' | 'md';
}

export default function TagBadge({ tag, onRemove, onClick, size = 'sm' }: TagBadgeProps) {
  return (
    <span
      className={`badge cursor-pointer select-none transition-all duration-150 hover:opacity-80 ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}30`,
      }}
      onClick={() => onClick?.(tag)}
      title={onClick ? `查看「${tag.name}」标签` : tag.name}
    >
      {tag.name}
      {onRemove && (
        <span
          className="inline-flex items-center ml-0.5 hover:opacity-60"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
        >
          <X className="w-3 h-3" />
        </span>
      )}
    </span>
  );
}

import { Music, Tags, Search, Settings, Disc3 } from 'lucide-react';
import type { Page } from '../App';
import type { Stats } from '../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  stats: Stats;
}

const navItems: { page: Page; label: string; icon: typeof Music }[] = [
  { page: 'library', label: '音乐库', icon: Music },
  { page: 'tags', label: '标签管理', icon: Tags },
  { page: 'search', label: '搜索', icon: Search },
  { page: 'settings', label: '设置', icon: Settings },
];

export default function Sidebar({ currentPage, onNavigate, stats }: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-surface-900 border-r border-surface-700/50 flex flex-col select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-700/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Disc3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-txt-heading tracking-wide">Music Tagger</h1>
            <p className="text-[10px] text-slate-500">本地音乐标签管理</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              currentPage === page
                ? 'bg-indigo-600/15 text-indigo-400 shadow-sm'
                : 'text-txt-subtle hover:text-txt-body hover:bg-surface-800/60'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* Stats footer */}
      <div className="px-4 py-4 border-t border-surface-700/30 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">曲目</span>
          <span className="text-txt-secondary font-medium">{stats.trackCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">标签</span>
          <span className="text-txt-secondary font-medium">{stats.tagCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">目录</span>
          <span className="text-txt-secondary font-medium">{stats.dirCount}</span>
        </div>
      </div>
    </aside>
  );
}

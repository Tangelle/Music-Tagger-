import { useCallback } from 'react';
import type { Track } from '../types';

export function useDragOutTrack() {
  const handleDragStart = useCallback((e: React.DragEvent, track: Track) => {
    // 不调用 preventDefault — 让浏览器的拖放状态机启动
    // setData 确保浏览器进入有效的拖放状态
    e.dataTransfer.setData('text/plain', track.file_path);
    e.dataTransfer.effectAllowed = 'copy';
    // sendSync 在同一个事件 tick 中调用 startDrag 接管为原生文件拖放
    window.api.file.dragStart(track.file_path);
  }, []);

  return { handleDragStart };
}

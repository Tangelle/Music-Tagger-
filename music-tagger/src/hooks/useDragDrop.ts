import { useCallback } from 'react';
import type { Track } from '../types';

export function useDragOutTrack() {
  const handleDragStart = useCallback((e: React.DragEvent, track: Track) => {
    // preventDefault 阻止浏览器默认拖放（HTML 内容/文本拖放）
    e.preventDefault();
    // sendSync 同步阻塞渲染进程，在 dragstart 事件上下文中完成 startDrag 调用
    // 主进程的 event.sender.startDrag() 接管为原生 OS 文件拖放
    window.api.file.dragStart(track.file_path);
  }, []);

  return { handleDragStart };
}

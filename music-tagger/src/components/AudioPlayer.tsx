import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, X, Volume2, VolumeX, SkipBack, SkipForward, FolderOpen, Shuffle, Repeat } from 'lucide-react';
import type { Track } from '../types';

interface AudioPlayerProps {
  track: Track;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  shuffleMode: boolean;
  onToggleShuffle: () => void;
}

export default function AudioPlayer({ track, onClose, onPrev, onNext, shuffleMode, onToggleShuffle }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  const isDraggingSeek = useRef(false);
  const isDraggingVolume = useRef(false);

  useEffect(() => {
    window.api.file.getAudioSrc(track.file_path).then(setAudioSrc);
    setCurrentTime(0);
    setDuration(track.duration || 0);
    setIsPlaying(false);
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    audio.volume = volume;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !track.duration) setDuration(audio.duration);
    };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => {
      setIsPlaying(true);
      window.api.tracks.recordPlay(track.id).catch(err => {
        console.error('记录播放失败:', err);
      });
    };
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [audioSrc, track.duration, volume, track.id]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const calcSeek = useCallback((clientX: number) => {
    const bar = document.getElementById('progress-bar');
    if (!bar || !duration) return undefined;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const seekTo = useCallback((clientX: number) => {
    const time = calcSeek(clientX);
    if (audioRef.current && time !== undefined) {
      audioRef.current.currentTime = time;
    }
  }, [calcSeek]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingSeek.current = true;
    seekTo(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingSeek.current) seekTo(ev.clientX);
    };
    const onMouseUp = () => {
      isDraggingSeek.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [seekTo]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

  const calcVolume = useCallback((clientX: number) => {
    const bar = document.getElementById('volume-bar');
    if (!bar) return undefined;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const setVolumeTo = useCallback((clientX: number) => {
    const ratio = calcVolume(clientX);
    if (audioRef.current && ratio !== undefined) {
      audioRef.current.volume = ratio;
      setVolume(ratio);
      setIsMuted(ratio === 0);
    }
  }, [calcVolume]);

  const handleVolumeMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingVolume.current = true;
    setVolumeTo(e.clientX);

    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingVolume.current) setVolumeTo(ev.clientX);
    };
    const onMouseUp = () => {
      isDraggingVolume.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [setVolumeTo]);

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleShowInFolder = () => {
    window.api.file.showInFolder(track.file_path);
  };

  return (
    <div className="flex-shrink-0 bg-surface-900 border-t border-surface-700/50 animate-slide-up">
      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto" />
      )}

      {/* Progress bar */}
      <div
        id="progress-bar"
        className="h-1 bg-surface-700 cursor-pointer group"
        onMouseDown={handleSeekMouseDown}
      >
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-100 relative"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
        </div>
      </div>

      <div className="px-4 py-2.5 flex items-center gap-4">
        {/* Track info */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-400">
              {track.format?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-txt-heading truncate">{track.title}</p>
            <p className="text-xs text-txt-muted truncate">
              {track.artist || '未知艺术家'}
              {track.album && ` · ${track.album}`}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-txt-muted w-10 text-right tabular-nums">
            {formatTime(currentTime)}
          </span>

          <div className="flex items-center gap-1">
            {shuffleMode ? (
              <button
                className="btn-ghost btn-xs text-indigo-400"
                title="乱序播放中 — 点击切换为顺序播放"
                onClick={onToggleShuffle}
              >
                <Shuffle className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="btn-ghost btn-xs"
                title="顺序播放中 — 点击切换为乱序播放"
                onClick={onToggleShuffle}
              >
                <Repeat className="w-4 h-4" />
              </button>
            )}
            <button
              className="btn-ghost btn-xs"
              title="上一首"
              onClick={onPrev || undefined}
              disabled={!onPrev}
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button
              className="btn-ghost btn-xs"
              title="下一首"
              onClick={onNext || undefined}
              disabled={!onNext}
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs text-txt-muted w-10 tabular-nums">
            {formatTime(duration)}
          </span>

          {/* Volume */}
          <div className="flex items-center gap-1.5 ml-2">
            <button onClick={toggleMute} className="btn-ghost btn-xs" title={isMuted ? '取消静音' : '静音'}>
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <div
              id="volume-bar"
              className="w-20 h-1.5 bg-surface-700 rounded-full cursor-pointer"
              onMouseDown={handleVolumeMouseDown}
            >
              <div
                className="h-full bg-slate-500 dark:bg-slate-400 rounded-full"
                style={{ width: `${isMuted ? 0 : volume * 100}%` }}
              />
            </div>
          </div>

          <button onClick={handleShowInFolder} className="btn-ghost btn-xs ml-1" title="在文件夹中显示">
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          <button onClick={onClose} className="btn-ghost btn-xs" title="关闭播放器">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

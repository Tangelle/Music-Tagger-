export interface Tag {
  id: number;
  name: string;
  color: string;
  track_count?: number;
  created_at?: string;
}

export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  file_size: number | null;
  added_at: string;
  last_used_at: string | null;
  play_count: number | null;
  tags: Tag[];
}

export interface TracksResult {
  tracks: Track[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResult {
  tracks: Track[];
  tags: Tag[];
}

export interface Stats {
  trackCount: number;
  tagCount: number;
  dirCount: number;
}

export interface ScanResult {
  trackCount: number;
  newCount: number;
  skippedCount: number;
  error?: string;
}

declare global {
  interface Window {
    api: {
      tracks: {
        getAll: (opts?: {
          search?: string;
          sortBy?: string;
          sortDir?: string;
          limit?: number;
          offset?: number;
        }) => Promise<TracksResult>;
        getById: (id: number) => Promise<Track | null>;
        getByTag: (tagId: number, opts?: { sortBy?: string; sortDir?: string }) => Promise<Track[]>;
        getByTags: (tagIds: number[], opts?: { sortBy?: string; sortDir?: string }) => Promise<Track[]>;
        remove: (id: number, deleteFile?: boolean) => Promise<{
          success: boolean;
          cancelled?: boolean;
          fileDeleted?: boolean;
          fileError?: string | null;
        }>;
        removeBatch: (ids: number[], deleteFile?: boolean) => Promise<{
          success: boolean;
          cancelled?: boolean;
          total?: number;
          deleted?: number;
          fileDeleted?: number;
          failures?: Array<{ id: number; title: string; error: string }>;
        }>;
        recordPlay: (trackId: number) => Promise<{ success: boolean }>;
      };
      tags: {
        getAll: () => Promise<Tag[]>;
        getById: (id: number) => Promise<Tag | null>;
        create: (name: string, color?: string) => Promise<Tag>;
        update: (id: number, data: { name?: string; color?: string }) => Promise<Tag>;
        delete: (id: number) => Promise<{ success: boolean }>;
        deleteBatch: (ids: number[]) => Promise<{
          success: boolean;
          cancelled?: boolean;
          total?: number;
          deleted?: number;
          failures?: Array<{ id: number; name: string; deleted: boolean; error: string | null }>;
        }>;
        search: (query: string) => Promise<Tag[]>;
        addToTrack: (trackId: number, tagId: number) => Promise<{ success: boolean }>;
        removeFromTrack: (trackId: number, tagId: number) => Promise<{ success: boolean }>;
        getForTrack: (trackId: number) => Promise<Tag[]>;
        setTrackTags: (trackId: number, tagIds: number[]) => Promise<{ success: boolean }>;
      };
      scan: {
        start: () => Promise<ScanResult>;
        getDirs: () => Promise<string[]>;
        addDir: () => Promise<string[]>;
        removeDir: (dirPath: string) => Promise<string[]>;
        selectAndAddDir: () => Promise<string | null>;
      };
      search: {
        all: (query: string, opts?: { limit?: number }) => Promise<SearchResult>;
      };
      stats: {
        get: () => Promise<Stats>;
      };
      file: {
        open: (filePath: string) => Promise<void>;
        showInFolder: (filePath: string) => Promise<void>;
        getAudioSrc: (filePath: string) => Promise<string | null>;
        exists: (filePath: string) => Promise<boolean>;
        dragStart: (filePath: string) => boolean;
        importFiles: (filePaths: string[], targetDir: string) => Promise<Array<{
          src: string;
          dest: string | null;
          error: string | null;
          renamed: boolean;
        }>>;
        isSupportedAudio: (filePath: string) => Promise<boolean>;
      };
      app: {
        getDbPath: () => Promise<string>;
        selectDbPath: () => Promise<string | null>;
        setDbPath: (newDbPath: string, copyData: boolean) => Promise<{ success: boolean; dbPath: string }>;
      };
      onDbReady: (callback: () => void) => () => void;
    };
  }
}

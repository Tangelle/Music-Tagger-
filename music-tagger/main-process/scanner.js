const fs = require('fs');
const path = require('path');
const { getDb } = require('./database');
const { insertTrack, removeTrackByPath, getTrackByPath } = require('./trackService');

const SUPPORTED_FORMATS = new Set([
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.wma',
  '.m4a', '.opus', '.wv', '.ape', '.aiff', '.aif',
]);

const SCAN_BATCH_SIZE = 50;

function getScanDirs() {
  const db = getDb();
  const rows = db.prepare('SELECT dir_path FROM scan_dirs ORDER BY id').all();
  return rows.map(r => r.dir_path);
}

function addScanDir(dirPath) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO scan_dirs (dir_path) VALUES (?)').run(dirPath);
  return getScanDirs();
}

function removeScanDir(dirPath) {
  const db = getDb();
  db.prepare('DELETE FROM scan_dirs WHERE dir_path = ?').run(dirPath);
  return getScanDirs();
}

async function scanDirectories(onProgress) {
  const dirs = getScanDirs();
  let allFiles = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = collectMusicFiles(dir);
    allFiles = allFiles.concat(files);
  }

  // Clean up tracks whose files no longer exist
  const db = getDb();
  const existingTracks = db.prepare('SELECT id, file_path FROM tracks').all();
  for (const track of existingTracks) {
    if (!fs.existsSync(track.file_path)) {
      db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
    }
  }

  // Scan and add/update tracks
  let processed = 0;
  const total = allFiles.length;
  const newTracks = [];
  const skippedTracks = [];

  const existingPaths = new Set(
    db.prepare('SELECT file_path FROM tracks').all().map(r => r.file_path)
  );

  for (const filePath of allFiles) {
    if (!existingPaths.has(filePath)) {
      newTracks.push(filePath);
    } else {
      skippedTracks.push(filePath);
    }
  }

  for (let i = 0; i < newTracks.length; i += SCAN_BATCH_SIZE) {
    const batch = newTracks.slice(i, i + SCAN_BATCH_SIZE);
    for (const filePath of batch) {
      try {
        const metadata = await readMusicMetadata(filePath);
        insertTrack({
          file_path: filePath,
          title: metadata.title || path.basename(filePath, path.extname(filePath)),
          artist: metadata.artist || null,
          album: metadata.album || null,
          duration: metadata.duration || null,
          format: path.extname(filePath).toLowerCase().replace('.', ''),
          file_size: metadata.fileSize || null,
        });
      } catch (err) {
        // Skip files that can't be read
      }
    }
    processed += batch.length;
    if (onProgress) {
      onProgress({
        type: 'progress',
        processed: Math.min(processed, total),
        total,
        phase: 'scanning',
        newCount: newTracks.length,
        skippedCount: skippedTracks.length,
      });
    }
  }

  const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;

  if (onProgress) {
    onProgress({
      type: 'complete',
      processed: total,
      total,
      trackCount,
      newCount: newTracks.length,
      skippedCount: skippedTracks.length,
    });
  }

  return { trackCount, newCount: newTracks.length, skippedCount: skippedTracks.length };
}

function collectMusicFiles(dirPath) {
  const files = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectMusicFiles(fullPath));
      } else if (entry.isFile() && SUPPORTED_FORMATS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Skip directories that can't be read
  }
  return files;
}

async function readMusicMetadata(filePath) {
  // Dynamic import for ESM module
  const { parseFile } = await import('music-metadata');
  try {
    const meta = await parseFile(filePath);
    return {
      title: meta.common.title || null,
      artist: meta.common.artist || null,
      album: meta.common.album || null,
      duration: meta.format.duration || null,
      fileSize: fs.statSync(filePath).size,
    };
  } catch {
    // Return basic info if metadata parsing fails
    return {
      title: null,
      artist: null,
      album: null,
      duration: null,
      fileSize: fs.statSync(filePath).size,
    };
  }
}

module.exports = {
  scanDirectories,
  collectMusicFiles,
  getScanDirs,
  addScanDir,
  removeScanDir,
  SUPPORTED_FORMATS,
};

const { getDb } = require('./database');

function getAllTracks({ search = '', sortBy = 'title', sortDir = 'ASC', limit = 500, offset = 0 } = {}) {
  const db = getDb();
  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
  if (!validSortCols.includes(sortBy)) sortBy = 'title';
  if (!['ASC', 'DESC'].includes(sortDir.toUpperCase())) sortDir = 'ASC';

  let where = '';
  const params = [];
  if (search) {
    where = 'WHERE (t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.file_path LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const countSql = `SELECT COUNT(*) as total FROM tracks t ${where}`;
  const { total } = db.prepare(countSql).get(...params);

  const sql = `
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names, GROUP_CONCAT(tg.id) as tag_ids, GROUP_CONCAT(tg.color) as tag_colors
    FROM tracks t
    LEFT JOIN track_tags tt ON t.id = tt.track_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    ${where}
    GROUP BY t.id
    ORDER BY t.${sortBy} ${sortDir}
    LIMIT ? OFFSET ?
  `;

  const tracks = db.prepare(sql).all(...params, limit, offset);

  return {
    tracks: tracks.map(parseTrackTags),
    total,
    limit,
    offset,
  };
}

function getTrackById(id) {
  const db = getDb();
  const track = db.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names, GROUP_CONCAT(tg.id) as tag_ids, GROUP_CONCAT(tg.color) as tag_colors
    FROM tracks t
    LEFT JOIN track_tags tt ON t.id = tt.track_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id);
  return track ? parseTrackTags(track) : null;
}

function getTrackByPath(filePath) {
  const db = getDb();
  return db.prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath);
}

function insertTrack(track) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tracks (file_path, title, artist, album, duration, format, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    track.file_path,
    track.title || null,
    track.artist || null,
    track.album || null,
    track.duration || null,
    track.format || null,
    track.file_size || null
  );
}

function removeTrack(id) {
  const db = getDb();
  const track = db.prepare('SELECT file_path, title FROM tracks WHERE id = ?').get(id);
  if (!track) return null;
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  return track; // { file_path, title }
}

function removeTrackByPath(filePath) {
  const db = getDb();
  db.prepare('DELETE FROM tracks WHERE file_path = ?').run(filePath);
}

function getTracksByTag(tagId, { sortBy = 'title', sortDir = 'ASC' } = {}) {
  const db = getDb();
  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
  if (!validSortCols.includes(sortBy)) sortBy = 'title';
  if (!['ASC', 'DESC'].includes(sortDir.toUpperCase())) sortDir = 'ASC';

  const tracks = db.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names, GROUP_CONCAT(tg.id) as tag_ids, GROUP_CONCAT(tg.color) as tag_colors
    FROM tracks t
    INNER JOIN track_tags tt ON t.id = tt.track_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id IN (SELECT track_id FROM track_tags WHERE tag_id = ?)
    GROUP BY t.id
    ORDER BY t.${sortBy} ${sortDir}
  `).all(tagId);

  return tracks.map(parseTrackTags);
}

function getTracksByTags(tagIds, { sortBy = 'title', sortDir = 'ASC' } = {}) {
  const db = getDb();
  if (!tagIds || tagIds.length === 0) return [];

  const validSortCols = ['title', 'artist', 'album', 'duration', 'format', 'added_at', 'last_used_at', 'play_count'];
  if (!validSortCols.includes(sortBy)) sortBy = 'title';
  if (!['ASC', 'DESC'].includes(sortDir.toUpperCase())) sortDir = 'ASC';

  const placeholders = tagIds.map(() => '?').join(',');
  const tracks = db.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names, GROUP_CONCAT(tg.id) as tag_ids, GROUP_CONCAT(tg.color) as tag_colors
    FROM tracks t
    INNER JOIN track_tags tt ON t.id = tt.track_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.id IN (
      SELECT track_id FROM track_tags
      WHERE tag_id IN (${placeholders})
      GROUP BY track_id
      HAVING COUNT(DISTINCT tag_id) = ?
    )
    GROUP BY t.id
    ORDER BY t.${sortBy} ${sortDir}
  `).all(...tagIds, tagIds.length);

  return tracks.map(parseTrackTags);
}

function getTrackCount() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;
}

function parseTrackTags(track) {
  if (!track) return null;
  const tags = [];
  if (track.tag_names) {
    const names = track.tag_names.split(',');
    const ids = (track.tag_ids || '').split(',').map(Number);
    const colors = (track.tag_colors || '').split(',');
    for (let i = 0; i < names.length; i++) {
      if (names[i]) {
        tags.push({ id: ids[i], name: names[i], color: colors[i] || '#6366f1' });
      }
    }
  }
  return {
    ...track,
    tag_names: undefined,
    tag_ids: undefined,
    tag_colors: undefined,
    tags,
  };
}

function recordPlay(trackId) {
  const db = getDb();
  db.prepare(`
    UPDATE tracks
    SET last_used_at = datetime('now', 'localtime'),
        play_count = COALESCE(play_count, 0) + 1
    WHERE id = ?
  `).run(trackId);
}

module.exports = {
  getAllTracks,
  getTrackById,
  getTrackByPath,
  insertTrack,
  removeTrack,
  removeTrackByPath,
  getTracksByTag,
  getTracksByTags,
  getTrackCount,
  recordPlay,
};

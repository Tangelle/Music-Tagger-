const { getDb } = require('./database');

function search(query, { limit = 50 } = {}) {
  const db = getDb();
  const q = `%${query}%`;

  // Search tracks
  const tracks = db.prepare(`
    SELECT t.*, GROUP_CONCAT(tg.name) as tag_names, GROUP_CONCAT(tg.id) as tag_ids, GROUP_CONCAT(tg.color) as tag_colors
    FROM tracks t
    LEFT JOIN track_tags tt ON t.id = tt.track_id
    LEFT JOIN tags tg ON tt.tag_id = tg.id
    WHERE t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.file_path LIKE ?
    GROUP BY t.id
    ORDER BY t.title ASC
    LIMIT ?
  `).all(q, q, q, q, limit);

  // Search tags
  const tags = db.prepare(`
    SELECT t.*, COUNT(tt.track_id) as track_count
    FROM tags t
    LEFT JOIN track_tags tt ON t.id = tt.tag_id
    WHERE t.name LIKE ?
    GROUP BY t.id
    ORDER BY track_count DESC
    LIMIT ?
  `).all(q, limit);

  return {
    tracks: tracks.map(row => {
      if (!row) return null;
      const tags = [];
      if (row.tag_names) {
        const names = row.tag_names.split(',');
        const ids = (row.tag_ids || '').split(',').map(Number);
        const colors = (row.tag_colors || '').split(',');
        for (let i = 0; i < names.length; i++) {
          if (names[i]) tags.push({ id: ids[i], name: names[i], color: colors[i] || '#6366f1' });
        }
      }
      return {
        ...row,
        tag_names: undefined,
        tag_ids: undefined,
        tag_colors: undefined,
        tags,
      };
    }),
    tags,
  };
}

function getQuickStats() {
  const db = getDb();
  const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;
  const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
  const dirCount = db.prepare('SELECT COUNT(*) as count FROM scan_dirs').get().count;
  return { trackCount, tagCount, dirCount };
}

module.exports = { search, getQuickStats };

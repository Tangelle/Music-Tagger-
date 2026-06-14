const { getDb, markDirty } = require('./database');

function getAllTags() {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, COUNT(tt.track_id) as track_count
    FROM tags t
    LEFT JOIN track_tags tt ON t.id = tt.tag_id
    GROUP BY t.id
    ORDER BY t.name ASC
  `).all();
}

function getTagById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, COUNT(tt.track_id) as track_count
    FROM tags t
    LEFT JOIN track_tags tt ON t.id = tt.tag_id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id);
}

function getTagByName(name) {
  const db = getDb();
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
}

function createTag(name, color = '#6366f1') {
  const db = getDb();
  const result = db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)').run(name, color);
  markDirty();
  if (result.changes > 0) {
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
  }
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
}

function updateTag(id, { name, color }) {
  const db = getDb();
  if (name !== undefined) {
    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id);
    markDirty();
  }
  if (color !== undefined) {
    db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, id);
    markDirty();
  }
  return getTagById(id);
}

function deleteTag(id) {
  const db = getDb();
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  markDirty();
}

function deleteTags(ids) {
  const db = getDb();
  const results = [];
  for (const id of ids) {
    try {
      const tag = db.prepare('SELECT id, name FROM tags WHERE id = ?').get(id);
      if (!tag) {
        results.push({ id, name: `ID ${id}`, deleted: false, error: '标签不存在' });
        continue;
      }
      db.prepare('DELETE FROM tags WHERE id = ?').run(id);
      results.push({ id, name: tag.name, deleted: true, error: null });
    } catch (err) {
      results.push({ id, name: `ID ${id}`, deleted: false, error: err.message });
    }
  }
  markDirty();
  return results;
}

function addTagToTrack(trackId, tagId) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)').run(trackId, tagId);
  markDirty();
}

function removeTagFromTrack(trackId, tagId) {
  const db = getDb();
  db.prepare('DELETE FROM track_tags WHERE track_id = ? AND tag_id = ?').run(trackId, tagId);
  markDirty();
}

function getTagsForTrack(trackId) {
  const db = getDb();
  return db.prepare(`
    SELECT t.* FROM tags t
    INNER JOIN track_tags tt ON t.id = tt.tag_id
    WHERE tt.track_id = ?
    ORDER BY t.name ASC
  `).all(trackId);
}

function setTrackTags(trackId, tagIds) {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM track_tags WHERE track_id = ?').run(trackId);
    const stmt = db.prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      stmt.run(trackId, tagId);
    }
  });
  transaction();
  markDirty();
}

function searchTags(query) {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, COUNT(tt.track_id) as track_count
    FROM tags t
    LEFT JOIN track_tags tt ON t.id = tt.tag_id
    WHERE t.name LIKE ?
    GROUP BY t.id
    ORDER BY track_count DESC
    LIMIT 20
  `).all(`%${query}%`);
}

function getTagCount() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
}

module.exports = {
  getAllTags,
  getTagById,
  getTagByName,
  createTag,
  updateTag,
  deleteTag,
  deleteTags,
  addTagToTrack,
  removeTagFromTrack,
  getTagsForTrack,
  setTrackTags,
  searchTags,
  getTagCount,
};

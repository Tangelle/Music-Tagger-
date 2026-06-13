const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let db = null;
let dbPath = null;
let configPath = null;

// ── Statement wrapper that mimics better-sqlite3 API ──
class Statement {
  constructor(sqlDb, sql) {
    this.sqlDb = sqlDb;
    this.sql = sql;
  }

  run(...params) {
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? Object.values(params[0])
      : params;
    this.sqlDb.run(this.sql, flatParams);
    // Get last insert rowid and rows modified
    const result = this.sqlDb.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
    const changes = this.sqlDb.getRowsModified();
    return { changes, lastInsertRowid };
  }

  get(...params) {
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? Object.values(params[0])
      : params;
    const result = this.sqlDb.exec(this.sql, flatParams);
    if (!result.length || !result[0].values.length) return undefined;
    const { columns, values } = result[0];
    const row = {};
    columns.forEach((col, i) => { row[col] = values[0][i]; });
    return row;
  }

  all(...params) {
    const flatParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? Object.values(params[0])
      : params;
    const result = this.sqlDb.exec(this.sql, flatParams);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }
}

// ── Database wrapper ──
class Database {
  constructor(sqlDb, filePath) {
    this.db = sqlDb;
    this.filePath = filePath;
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  exec(sql) {
    this.db.run(sql);
  }

  transaction(fn) {
    return (...args) => {
      this.db.run('BEGIN');
      try {
        fn(...args);
        this.db.run('COMMIT');
      } catch (err) {
        this.db.run('ROLLBACK');
        throw err;
      }
    };
  }

  save() {
    const data = this.db.export();
    fs.writeFileSync(this.filePath, Buffer.from(data));
  }
}

// ── Config management (stored in fixed location, read before DB) ──
function readConfig() {
  configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (_) {
    // Corrupted config — ignore, fall back to defaults
  }
  return {};
}

function writeConfig(config) {
  if (!configPath) {
    configPath = path.join(app.getPath('userData'), 'config.json');
  }
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// ── Init ──
async function initDb() {
  const config = readConfig();
  dbPath = config.dbPath || path.join(app.getPath('userData'), 'music-tagger.db');
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new Database(sqlDb, dbPath);

  // PRAGMAs
  db.db.run('PRAGMA foreign_keys = ON');

  // Init tables
  db.db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL,
      format TEXT,
      file_size INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      play_count INTEGER DEFAULT 0
    )
  `);

  // 迁移：为旧数据库添加新列
  const trackCols = db.prepare("PRAGMA table_info(tracks)").all().map(r => r.name);
  if (!trackCols.includes('last_used_at')) {
    db.exec('ALTER TABLE tracks ADD COLUMN last_used_at DATETIME');
  }
  if (!trackCols.includes('play_count')) {
    db.exec('ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0');
  }

  db.db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.db.run(`
    CREATE TABLE IF NOT EXISTS track_tags (
      track_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (track_id, tag_id),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.db.run(`
    CREATE TABLE IF NOT EXISTS scan_dirs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dir_path TEXT UNIQUE NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Save after init
  db.save();
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function getDbPath() {
  return dbPath;
}

function closeDb() {
  if (db) {
    db.save();
    db.db.close();
    db = null;
  }
}

// Save on a regular interval and on key operations
let saveTimer = null;
function autoSave(intervalMs = 30000) {
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    if (db) db.save();
  }, intervalMs);
}

function saveNow() {
  if (db) db.save();
}

// ── Change database location ──
async function setDbPath(newPath, copyData) {
  if (!db) throw new Error('Database not initialized.');
  if (newPath === dbPath) return dbPath;

  // Ensure target directory exists
  const dir = path.dirname(newPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save current DB state
  db.save();

  // Copy data if requested
  if (copyData) {
    fs.copyFileSync(dbPath, newPath);
  }

  // Close current DB
  db.db.close();

  // Update config
  writeConfig({ dbPath: newPath });

  // Re-open from new location
  const SQL = await initSqlJs();
  let sqlDb;
  if (fs.existsSync(newPath)) {
    const buffer = fs.readFileSync(newPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }
  sqlDb.run('PRAGMA foreign_keys = ON');

  // Ensure tables exist in the new database
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL,
      format TEXT,
      file_size INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      play_count INTEGER DEFAULT 0
    )
  `);
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS track_tags (
      track_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (track_id, tag_id),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS scan_dirs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dir_path TEXT UNIQUE NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 迁移：为旧数据库添加新列
  const trackCols = [];
  const colResult = sqlDb.exec("PRAGMA table_info(tracks)");
  if (colResult.length > 0 && colResult[0] && colResult[0].values) {
    for (const row of colResult[0].values) {
      trackCols.push(row[1]); // column name is the second field
    }
  }
  if (!trackCols.includes('last_used_at')) {
    sqlDb.run('ALTER TABLE tracks ADD COLUMN last_used_at DATETIME');
  }
  if (!trackCols.includes('play_count')) {
    sqlDb.run('ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0');
  }

  db = new Database(sqlDb, newPath);
  dbPath = newPath;

  return dbPath;
}

module.exports = { initDb, getDb, closeDb, getDbPath, autoSave, saveNow, setDbPath };

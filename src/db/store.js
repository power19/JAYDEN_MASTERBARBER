/**
 * Lightweight JSON file store — zero native dependencies.
 *
 * JsonCollection  → array of records with auto-increment integer IDs
 * JsonKVStore     → flat key→value object
 *
 * Both are synchronous and write-through (every mutation saves to disk).
 * Perfectly adequate for a small barbershop with a few hundred records.
 */
const fs   = require('fs');
const path = require('path');

// ── Resilient JSON persistence ──────────────────────────────────────────────────

/**
 * Read JSON from disk, resilient to corruption: try the live file, then a .bak
 * (previous good copy), then the fallback. A present-but-corrupt file is never
 * silently treated as empty without first trying its .bak.
 */
function loadJson(file, fallback) {
  for (const f of [file, `${file}.bak`]) {
    try {
      if (!fs.existsSync(f)) continue;
      const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (f.endsWith('.bak')) console.error(`⚠️  ${file} unreadable — recovered from .bak`);
      return parsed;
    } catch (e) {
      console.error(`⚠️  Failed to parse ${f}: ${e.message}`);
    }
  }
  return fallback;
}

/**
 * Atomic write: serialize to a temp file, keep the previous file as .bak, then
 * rename into place. rename() is atomic, so a concurrent reader — or a crash
 * mid-write — can never observe a truncated or empty file. This is the fix for
 * the wipe that happened when two processes wrote the same file at once.
 */
function saveJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`); } catch (_) {}
  fs.renameSync(tmp, file);
}

// ── JsonCollection ────────────────────────────────────────────────────────────

class JsonCollection {
  constructor(filePath) {
    this.file = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this._data = this._load();
    // Bootstrap auto-increment counter
    const ids = this._data.map(r => (typeof r.id === 'number' ? r.id : 0));
    this._nextId = ids.length ? Math.max(...ids) + 1 : 1;
  }

  // ── persistence ─────────────────────────────────────────────────────────────

  _load() { return loadJson(this.file, []); }

  _save() { saveJson(this.file, this._data); }

  // ── helpers ──────────────────────────────────────────────────────────────────

  _match(record, predicate) {
    if (typeof predicate === 'function') return predicate(record);
    return Object.entries(predicate).every(([k, v]) => record[k] === v);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /** Insert a document. If doc.id is already set (string/number), use it; otherwise auto-assign. */
  insert(doc) {
    const id = doc.id !== undefined ? doc.id : this._nextId++;
    // Keep nextId beyond any numeric id we just assigned or already had
    if (typeof id === 'number' && id >= this._nextId) this._nextId = id + 1;
    const record = { ...doc, id, created_at: doc.created_at || new Date().toISOString() };
    this._data.push(record);
    this._save();
    return { lastInsertRowid: id, changes: 1 };
  }

  /** Find all records matching predicate (function or plain object). Omit for all records. */
  find(predicate) {
    if (!predicate) return [...this._data];
    return this._data.filter(r => this._match(r, predicate));
  }

  /** Find first matching record or null. */
  findOne(predicate) {
    return this._data.find(r => this._match(r, predicate)) || null;
  }

  /** Update all matching records with `updates`. Returns { changes }. */
  update(predicate, updates) {
    let changes = 0;
    this._data = this._data.map(r => {
      if (this._match(r, predicate)) { changes++; return { ...r, ...updates }; }
      return r;
    });
    if (changes) this._save();
    return { changes };
  }

  /** Convenience: update by numeric or string id. */
  updateById(id, updates) {
    return this.update(r => String(r.id) === String(id), updates);
  }

  /**
   * Upsert: update matching record if it exists, otherwise insert.
   * `matchPredicate` can be a plain object or function.
   */
  upsert(matchPredicate, doc) {
    const existing = this.findOne(matchPredicate);
    if (existing) {
      this.update(r => r.id === existing.id, doc);
      return { lastInsertRowid: existing.id, changes: 1, wasInsert: false };
    } else {
      return { ...this.insert(doc), wasInsert: true };
    }
  }

  /** Remove all matching records. Returns { changes }. */
  remove(predicate) {
    const before = this._data.length;
    this._data = this._data.filter(r => !this._match(r, predicate));
    const changes = before - this._data.length;
    if (changes) this._save();
    return { changes };
  }

  /** Remove by id. */
  removeById(id) {
    return this.remove(r => String(r.id) === String(id));
  }

  /** Count matching records. */
  count(predicate) {
    return predicate ? this.find(predicate).length : this._data.length;
  }

  /** Toggle a boolean-ish field (0/1) by id. */
  toggle(id, field) {
    return this.updateById(id, {
      [field]: (this.findOne(r => String(r.id) === String(id))?.[field] ? 0 : 1),
    });
  }
}

// ── JsonKVStore ───────────────────────────────────────────────────────────────

class JsonKVStore {
  constructor(filePath) {
    this.file = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this._data = this._load();
  }

  _load() { return loadJson(this.file, {}); }

  _save() { saveJson(this.file, this._data); }

  get(key)         { return this._data[key]; }
  set(key, value)  { this._data[key] = value; this._save(); }
  setMany(obj)     { Object.assign(this._data, obj); this._save(); }
  getAll()         { return { ...this._data }; }
  has(key)         { return key in this._data; }
}

module.exports = { JsonCollection, JsonKVStore };

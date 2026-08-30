/**
 * A minimal Mongoose-compatible layer backed by SQLite (Node's built-in
 * node:sqlite — no native module, no download, no external DB service).
 *
 * Why a shim instead of a real relational rewrite: this codebase has ~20
 * Mongoose models and ~60 call sites across controllers/services using
 * Mongoose's document-store API (find/populate/lean/aggregate/pre-save
 * hooks). Reimplementing every one of those call sites against a relational
 * schema would touch nearly every backend file for no functional gain here.
 * Instead, each "collection" is a SQLite table with one JSON column per
 * document — a real SQLite file on disk, with Mongoose's exact API surface
 * (as actually used in this codebase) implemented on top of it. Swap
 * `require('mongoose')` for `require('./miniMongoose')` (already done
 * throughout models/controllers/scripts) and everything else is unchanged.
 *
 * Known intentional gaps vs. real Mongoose (not used by this codebase, so
 * not implemented): schema validation (required/enum/min/max), virtuals,
 * true BSON ObjectId, transactions, change streams, geo queries (this app
 * already computes distance manually via services/geo.js).
 */
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'nagarai.sqlite');

let db = null;
const modelRegistry = {}; // name -> Model class

// ---------------------------------------------------------------------------
// ObjectId — just a string id wrapper so `new mongoose.Types.ObjectId(x)`
// and `String(doc.field)` comparisons keep working unchanged.
// ---------------------------------------------------------------------------
function ObjectId(id) {
  if (!(this instanceof ObjectId)) return new ObjectId(id);
  this.id = id != null ? String(id) : crypto.randomUUID();
}
ObjectId.prototype.toString = function () { return this.id; };
ObjectId.prototype.toJSON = function () { return this.id; };
const isValidObjectId = () => true; // permissive — this app never round-trips real BSON ObjectIds

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
class Schema {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.statics = {};
    this.pres = {};
    this.refs = {}; // fieldName -> { ref, isArray }
    this.uniques = [];
    this._scan(definition);
  }

  _scan(def) {
    for (const [key, val] of Object.entries(def)) {
      if (!val) continue;
      if (Array.isArray(val)) {
        const inner = val[0];
        if (inner && inner.ref) this.refs[key] = { ref: inner.ref, isArray: true };
      } else if (typeof val === 'object' && val.ref) {
        this.refs[key] = { ref: val.ref, isArray: false };
      }
      if (typeof val === 'object' && val.unique) this.uniques.push(key);
    }
  }

  pre(hook, fn) {
    (this.pres[hook] = this.pres[hook] || []).push(fn);
    return this;
  }

  index() { return this; } // no-op — SQLite doesn't need Mongo-style index declarations here

  virtual(name) {
    const self = this;
    self._virtuals = self._virtuals || {};
    const entry = { get: null, set: null };
    self._virtuals[name] = entry;
    return {
      get(fn) { entry.get = fn; return this; },
      set(fn) { entry.set = fn; return this; },
    };
  }
}
Schema.Types = { ObjectId, Mixed: Symbol('Mixed'), String, Number, Boolean, Date, Array };

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function ensureDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

function ensureTable(name) {
  ensureDb().exec(`CREATE TABLE IF NOT EXISTS "${name}" (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);
}

const reviveDoc = (jsonStr) => {
  const obj = JSON.parse(jsonStr, (k, v) => {
    if (v && typeof v === 'object' && v.__isDate) return new Date(v.value);
    return v;
  });
  return obj;
};

const serializeDoc = (obj) => JSON.stringify(obj, (k, v) => {
  if (v instanceof Date) return { __isDate: true, value: v.toISOString() };
  if (v instanceof ObjectId) return v.toString();
  return v;
});

// ---------------------------------------------------------------------------
// Query matching (the small subset of Mongo query language this app uses)
// ---------------------------------------------------------------------------
const idStr = (v) => (v == null ? v : (typeof v === 'object' && 'id' in v ? v.id : String(v)));

const valueMatches = (docVal, cond) => {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
    return Object.entries(cond).every(([op, opVal]) => {
      switch (op) {
        case '$in': return (opVal || []).some((v) => idStr(v) === idStr(docVal));
        case '$nin': return !(opVal || []).some((v) => idStr(v) === idStr(docVal));
        case '$ne': return opVal === null ? (docVal !== null && docVal !== undefined) : idStr(docVal) !== idStr(opVal);
        case '$gte': return docVal != null && new Date(docVal) >= new Date(opVal) || (typeof docVal === 'number' && docVal >= opVal);
        case '$lte': return docVal != null && new Date(docVal) <= new Date(opVal) || (typeof docVal === 'number' && docVal <= opVal);
        case '$gt': return (typeof docVal === 'number' ? docVal > opVal : new Date(docVal) > new Date(opVal));
        case '$lt': return (typeof docVal === 'number' ? docVal < opVal : new Date(docVal) < new Date(opVal));
        case '$exists': return opVal ? docVal !== undefined && docVal !== null : (docVal === undefined || docVal === null);
        default: return true;
      }
    });
  }
  if (cond === null) return docVal === null || docVal === undefined;
  return idStr(docVal) === idStr(cond);
};

// True when a filter is exactly `{ _id: <scalar> }` — the shape findById /
// findByIdAndUpdate / findByIdAndDelete all reduce to, and the one case
// where an indexed lookup (instead of a full-table scan) is worth having.
const isPlainIdFilter = (filter) => {
  const keys = Object.keys(filter || {});
  if (keys.length !== 1 || keys[0] !== '_id') return false;
  const v = filter._id;
  return v == null || typeof v !== 'object' || v instanceof Date;
};

const matchFilter = (doc, filter = {}) => {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond || []).some((sub) => matchFilter(doc, sub));
    if (key === '$and') return (cond || []).every((sub) => matchFilter(doc, sub));
    return valueMatches(doc[key], cond);
  });
};

const getSortCmp = (sortSpec) => {
  const entries = Object.entries(sortSpec || {});
  return (a, b) => {
    for (const [field, dir] of entries) {
      const av = a[field], bv = b[field];
      let cmp = 0;
      if (av == null && bv != null) cmp = -1;
      else if (av != null && bv == null) cmp = 1;
      else if (av > bv) cmp = 1;
      else if (av < bv) cmp = -1;
      if (cmp !== 0) return dir < 0 ? -cmp : cmp;
    }
    return 0;
  };
};

const applySelect = (obj, select) => {
  if (!select) return obj;
  const tokens = select.trim().split(/\s+/).filter(Boolean);
  const exclude = tokens.filter((t) => t.startsWith('-')).map((t) => t.slice(1));
  const include = tokens.filter((t) => !t.startsWith('-'));
  const out = { ...obj };
  if (include.length) {
    const kept = { _id: out._id };
    for (const f of include) kept[f] = out[f];
    return kept;
  }
  for (const f of exclude) delete out[f];
  return out;
};

// ---------------------------------------------------------------------------
// Query — thenable + chainable, mirrors the subset of Mongoose's Query API
// this codebase actually calls.
// ---------------------------------------------------------------------------
class Query {
  constructor(model, filter, multi) {
    this.model = model;
    this.filter = filter || {};
    this.multi = multi;
    this._sort = null;
    this._limit = null;
    this._lean = false;
    this._populates = [];
    this._select = null;
  }
  sort(s) { this._sort = s; return this; }
  limit(n) { this._limit = n; return this; }
  skip(n) { this._skip = n; return this; }
  lean() { this._lean = true; return this; }
  select(s) { this._select = s; return this; }
  populate(field, sel) { this._populates.push({ field, sel }); return this; }

  async exec() {
    let rows;
    if (!this.multi && isPlainIdFilter(this.filter)) {
      const row = this.model._getById(this.filter._id);
      rows = row ? [row] : [];
    } else {
      rows = this.model._all().filter((r) => matchFilter(r, this.filter));
    }
    if (this._sort) rows = rows.slice().sort(getSortCmp(this._sort));
    if (this._skip) rows = rows.slice(this._skip);
    if (this._limit != null) rows = rows.slice(0, this._limit);

    for (const p of this._populates) {
      const refInfo = this.model.schema.refs[p.field];
      if (!refInfo) continue;
      const RefModel = modelRegistry[refInfo.ref];
      if (!RefModel) continue;
      for (const row of rows) {
        if (refInfo.isArray) {
          const ids = row[p.field] || [];
          row[p.field] = ids.map((id) => {
            const found = RefModel._all().find((r) => r._id === idStr(id));
            return found ? applySelect(found, p.sel) : null;
          }).filter(Boolean);
        } else {
          const id = row[p.field];
          if (id == null) continue;
          const found = RefModel._all().find((r) => r._id === idStr(id));
          row[p.field] = found ? applySelect(found, p.sel) : null;
        }
      }
    }

    let docs = rows.map((r) => (this._select ? applySelect(r, this._select) : r));
    if (!this._lean) docs = docs.map((r) => this.model._hydrate(r));
    return this.multi ? docs : (docs[0] || null);
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
}

// ---------------------------------------------------------------------------
// Aggregate — supports exactly the pipeline shapes used in this codebase:
// $match, $sort, $group (with $sum/$first/$avg/$max/$min accumulators).
// ---------------------------------------------------------------------------
const runAggregate = (rows, pipeline) => {
  let data = rows.slice();
  for (const stage of pipeline) {
    if (stage.$match) data = data.filter((r) => matchFilter(r, stage.$match));
    else if (stage.$sort) data = data.slice().sort(getSortCmp(stage.$sort));
    else if (stage.$group) {
      const { _id: idExpr, ...accs } = stage.$group;
      const groups = new Map();
      for (const row of data) {
        const key = typeof idExpr === 'string' && idExpr.startsWith('$') ? row[idExpr.slice(1)] : idExpr;
        const keyStr = String(key);
        if (!groups.has(keyStr)) groups.set(keyStr, { _id: key, __rows: [] });
        groups.get(keyStr).__rows.push(row);
      }
      const out = [];
      for (const g of groups.values()) {
        const result = { _id: g._id };
        for (const [field, accExpr] of Object.entries(accs)) {
          const [op, arg] = Object.entries(accExpr)[0];
          const vals = g.__rows.map((r) => (typeof arg === 'string' && arg.startsWith('$') ? r[arg.slice(1)] : arg));
          if (op === '$sum') result[field] = vals.reduce((a, v) => a + (typeof v === 'number' ? v : 1), 0);
          else if (op === '$first') result[field] = vals[0];
          else if (op === '$last') result[field] = vals[vals.length - 1];
          else if (op === '$avg') result[field] = vals.reduce((a, v) => a + (v || 0), 0) / (vals.length || 1);
          else if (op === '$max') result[field] = Math.max(...vals.filter((v) => v != null));
          else if (op === '$min') result[field] = Math.min(...vals.filter((v) => v != null));
        }
        out.push(result);
      }
      data = out;
    }
  }
  return data;
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
function makeModel(name, schema) {
  const table = name;
  ensureTable(table);

  class Model {
    constructor(data = {}) {
      Object.assign(this, JSON.parse(JSON.stringify(data)));
      if (!this._id) this._id = crypto.randomUUID();
      this._initial = null; // null = new/unsaved doc — every field counts as modified, matching Mongoose
    }

    isModified(field) {
      if (this._initial == null) return true; // new document: everything is "modified"
      try {
        const before = JSON.parse(this._initial);
        return JSON.stringify(before[field]) !== JSON.stringify(this[field]);
      } catch { return true; }
    }

    isNew() { return !Model._all().some((r) => r._id === this._id); }

    async save() {
      for (const fn of (schema.pres.save || [])) await fn.call(this);
      const now = new Date().toISOString();
      if (schema.options.timestamps) {
        if (!this.createdAt) this.createdAt = now;
        this.updatedAt = now;
      }
      const plain = { ...this };
      delete plain._initial;
      Model._saveRow(plain);
      this._initial = JSON.stringify(plain);
      return this;
    }

    toObject() { const { _initial, ...rest } = this; return rest; }

    toJSON() {
      if (schema.methods.toJSON) return schema.methods.toJSON.call(this);
      return this.toObject();
    }

    static get schema() { return schema; }

    static _all() {
      ensureTable(table);
      const rows = ensureDb().prepare(`SELECT doc FROM "${table}"`).all();
      return rows.map((r) => reviveDoc(r.doc));
    }

    static _getById(id) {
      ensureTable(table);
      const row = ensureDb().prepare(`SELECT doc FROM "${table}" WHERE _id = ?`).get(String(id));
      return row ? reviveDoc(row.doc) : null;
    }

    static _saveRow(obj) {
      ensureTable(table);
      ensureDb().prepare(`INSERT OR REPLACE INTO "${table}" (_id, doc) VALUES (?, ?)`).run(obj._id, serializeDoc(obj));
    }

    static _deleteRow(id) {
      ensureDb().prepare(`DELETE FROM "${table}" WHERE _id = ?`).run(id);
    }

    static _hydrate(row) {
      const doc = Object.create(Model.prototype);
      Object.assign(doc, row);
      doc._initial = JSON.stringify(row);
      return doc;
    }

    static find(filter = {}) { return new Query(Model, filter, true); }
    static findOne(filter = {}) { return new Query(Model, filter, false); }
    static findById(id) { return new Query(Model, { _id: idStr(id) }, false); }

    static async create(data) {
      if (Array.isArray(data)) return Promise.all(data.map((d) => Model.create(d)));
      for (const field of schema.uniques) {
        if (data[field] != null && Model._all().some((r) => idStr(r[field]) === idStr(data[field]))) {
          throw new Error(`E11000 duplicate key error: ${field} "${data[field]}" already exists`);
        }
      }
      const doc = new Model(data);
      await doc.save();
      return doc;
    }

    static async insertMany(arr) {
      const out = [];
      for (const d of arr) out.push(await Model.create(d));
      return out;
    }

    static async deleteMany(filter = {}) {
      const rows = Model._all().filter((r) => matchFilter(r, filter));
      for (const r of rows) Model._deleteRow(r._id);
      return { deletedCount: rows.length };
    }
    static async deleteOne(filter = {}) {
      const row = isPlainIdFilter(filter)
        ? Model._getById(filter._id)
        : Model._all().find((r) => matchFilter(r, filter));
      if (row) Model._deleteRow(row._id);
      return { deletedCount: row ? 1 : 0 };
    }

    static async countDocuments(filter = {}) {
      return Model._all().filter((r) => matchFilter(r, filter)).length;
    }

    static async exists(filter = {}) {
      const row = Model._all().find((r) => matchFilter(r, filter));
      return row ? { _id: row._id } : null;
    }

    static async findOneAndUpdate(filter, update = {}, opts = {}) {
      const existing = isPlainIdFilter(filter)
        ? Model._getById(filter._id)
        : Model._all().find((r) => matchFilter(r, filter));
      const applyOps = (base) => {
        const out = { ...base };
        for (const [op, fields] of Object.entries(update)) {
          if (op === '$set') Object.assign(out, fields);
          else if (op === '$inc') for (const [k, v] of Object.entries(fields)) out[k] = (out[k] || 0) + v;
          else if (op === '$push') for (const [k, v] of Object.entries(fields)) out[k] = [...(out[k] || []), v];
          else if (!op.startsWith('$')) out[op] = fields;
        }
        return out;
      };
      if (!existing) {
        if (!opts.upsert) return null;
        const seed = {};
        for (const [k, v] of Object.entries(filter)) if (typeof v !== 'object') seed[k] = v;
        const merged = applyOps(seed);
        const doc = await Model.create(merged);
        return opts.new === false ? null : doc;
      }
      const updated = applyOps(existing);
      updated.updatedAt = new Date().toISOString();
      Model._saveRow(updated);
      return opts.new === false ? Model._hydrate(existing) : Model._hydrate(updated);
    }

    static async findByIdAndUpdate(id, update, opts) { return Model.findOneAndUpdate({ _id: idStr(id) }, update, opts); }
    static async findByIdAndDelete(id) { return Model.deleteOne({ _id: idStr(id) }); }

    static async updateMany(filter, update) {
      const rows = Model._all().filter((r) => matchFilter(r, filter));
      for (const row of rows) await Model.findOneAndUpdate({ _id: row._id }, update);
      return { modifiedCount: rows.length };
    }

    static async aggregate(pipeline) { return runAggregate(Model._all(), pipeline); }

    static async distinct(field, filter = {}) {
      const vals = Model._all().filter((r) => matchFilter(r, filter)).map((r) => r[field]);
      return [...new Set(vals.map((v) => idStr(v)))];
    }

    static async exists(filter = {}) {
      const row = Model._all().find((r) => matchFilter(r, filter));
      return row ? { _id: row._id } : null;
    }
  }

  Object.assign(Model.prototype, schema.methods);
  Object.assign(Model, schema.statics);
  // Mongoose exposes `.id` as a virtual alias for `_id` on documents.
  Object.defineProperty(Model.prototype, 'id', {
    get() { return this._id != null ? String(this._id) : this._id; },
  });
  Model.modelName = name;
  return Model;
}

const model = (name, schema) => {
  if (modelRegistry[name]) return modelRegistry[name];
  const M = makeModel(name, schema);
  modelRegistry[name] = M;
  return M;
};

module.exports = {
  Schema,
  model,
  Types: { ObjectId },
  isValidObjectId,
  connect: async () => { ensureDb(); return { connection: { host: `sqlite:${DB_PATH}` } }; },
  disconnect: async () => { if (db) { db.close(); db = null; } },
  connection: { host: `sqlite:${DB_PATH}` },
};

'use strict';

/**
 * محوّل قاعدة بيانات في الذاكرة — للتطوير والاختبار وللعرض الحي فقط.
 * نفس واجهة FirestoreDB بالضبط، فكل منطق الأعمال يُكتب مرة واحدة.
 */
class MemoryDB {
  constructor() {
    this.kind = 'memory';
    this.cols = new Map();
    this.files = new Map();
    this.fileCounter = 0;
  }

  col(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Map());
    return this.cols.get(name);
  }

  async get(c, id) {
    const doc = this.col(c).get(id);
    return doc ? { ...doc } : null;
  }

  async query(c, filters = []) {
    const out = [];
    for (const doc of this.col(c).values()) {
      let ok = true;
      for (const f of filters) {
        const op = f.op || '==';
        if (op === '==') {
          if (doc[f.field] !== f.value) { ok = false; break; }
        } else if (op === 'in') {
          if (!Array.isArray(f.value) || !f.value.includes(doc[f.field])) { ok = false; break; }
        }
      }
      if (ok) out.push({ ...doc });
    }
    return out;
  }

  async set(c, id, doc) {
    const full = { ...doc, id };
    this.col(c).set(id, full);
    return { ...full };
  }

  async update(c, id, patch) {
    const doc = this.col(c).get(id);
    if (!doc) throw new Error(`not found: ${c}/${id}`);
    Object.assign(doc, patch);
    return { ...doc };
  }

  async delete(c, id) {
    this.col(c).delete(id);
  }

    async saveImage(shopId, filename, buffer, mime) {
    const id = `f${++this.fileCounter}${Math.random().toString(36).slice(2, 8)}`;
    this.files.set(id, { buffer, mime });
    return `/api/files/${id}`;
  }

  getImage(id) {
    return this.files.get(id) || null;
  }

  async ping() {
    return { ok: true };
  }
}

module.exports = { MemoryDB };

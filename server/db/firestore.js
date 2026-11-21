'use strict';

/**
 * محوّل Firebase (Firestore + Storage) — للإنتاج.
 * كل الوصول للبيانات يتم من الخادم فقط عبر Admin SDK،
 * وقواعد أمان Firestore/Storage تقفل وصول العميل تمامًا (firestore.rules / storage.rules).
 */
class FirestoreDB {
  constructor(env = process.env) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64;
      if (!b64) {
        throw new Error(
          'FIREBASE_SERVICE_ACCOUNT_B64 مطلوب عند DB_ADAPTER=firestore (محتوى ملف service account بترميز base64)'
        );
      }
      const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      const bucket = env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.appspot.com`;
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        storageBucket: bucket,
      });
      this._bucketName = bucket;
    }
    this.kind = 'firestore';
    this.db = admin.firestore();
    this.bucket = admin.storage().bucket();
  }

  async get(c, id) {
    const snap = await this.db.collection(c).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async query(c, filters = []) {
    let q = this.db.collection(c);
    for (const f of filters) q = q.where(f.field, f.op || '==', f.value);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async set(c, id, doc) {
    const full = { ...doc, id };
    await this.db.collection(c).doc(id).set(full);
    return { ...full };
  }

  async update(c, id, patch) {
    await this.db.collection(c).doc(id).update(patch);
    return this.get(c, id);
  }

  async delete(c, id) {
    await this.db.collection(c).doc(id).delete();
  }

  /** رفع صورة إلى Firebase Storage وجعلها قراءة عامة، وإرجاع رابطها */
  async saveImage(shopId, filename, buffer, mime) {
    const path = `shops/${shopId}/${filename}`;
    const file = this.bucket.file(path);
    await file.save(buffer, {
      contentType: mime,
      resumable: false,
      public: true,
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
    return `https://storage.googleapis.com/${this._bucketName}/${path}`;
  }
}

module.exports = { FirestoreDB };

'use strict';

/** اختيار محوّل قاعدة البيانات حسب البيئة */
function createDB(env = process.env) {
  const kind = env.DB_ADAPTER || 'memory';
  if (kind === 'firestore') {
    const { FirestoreDB } = require('./firestore');
    return new FirestoreDB(env);
  }
  const { MemoryDB } = require('./memory');
  return new MemoryDB();
}

module.exports = { createDB };

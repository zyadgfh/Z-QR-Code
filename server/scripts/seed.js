'use strict';

/** بذر بيانات الديمو في قاعدة البيانات الحالية (Firestore أو الذاكرة): npm run seed */
const { createDB } = require('../db');
const { seedDemo } = require('../seed');

(async () => {
  const db = createDB(process.env);
  await seedDemo(db);
  console.log(`تمت البذر بنجاح (${db.kind}).`);
  console.log('أدمن المنصة: admin@qrmenu.app / admin123');
  console.log('مالك كافيه النيل: owner@nile.app / owner123 — موظف: staff@nile.app / staff123');
  console.log('مالك برجر سبوت: owner@burger.app / owner123');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

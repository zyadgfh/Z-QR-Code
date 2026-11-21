'use strict';

// تحميل .env إن وجد (تشغيل محلي) — في الإنتاج تُدار المتغيرات من لوحة المنصة
try { process.loadEnvFile(); } catch { /* لا يوجد ملف .env — طبيعي في الإنتاج */ }

/**
 * نقطة تشغيل الخادم كخدمة واحدة (Render / أي سيرفر Node):
 * يقدّم الـ API + ملفات العميل المبنية من client/dist.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createApp } = require('./app');

const { app } = createApp();

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  // SPA fallback لأي مسار ليس /api
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`QR Menu server listening on http://0.0.0.0:${port}`);
});

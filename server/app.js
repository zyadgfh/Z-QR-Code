'use strict';

const express = require('express');
const { createDB } = require('./db');
const { seedDemo } = require('./seed');
const { HttpError, h } = require('./lib/errors');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const db = opts.db || createDB(env);

  // وضع الذاكرة يبدأ دائمًا ببيانات الديمو.
  // عمليات محوّل الذاكرة متزامنة داخليًا فتكتمل قبل استقبال أي طلب شبكة؛
  // نحفظ الوعد في db.ready لمن يحتاج التأكد (الاختبارات).
  if (db.kind === 'memory' && opts.seed !== false && !db.seeded) {
    db.seeded = true;
    db.ready = seedDemo(db);
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // خلف بروكسي Render/Vercel ليعمل req.ip
  app.set('qm_app_id', require('crypto').randomUUID()); // هوية النسخة لعزل عدّادات تحديد المعدل
  app.use(express.json({ limit: '4mb' }));

  // ترويسات أمان أساسية على كل الردود
  app.use((req, res, next) => {
    res.set('x-content-type-options', 'nosniff');
    res.set('x-frame-options', 'SAMEORIGIN');
    res.set('referrer-policy', 'strict-origin-when-cross-origin');
    res.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
      res.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // CORS بسيط (يفيد فقط عند فصل الفرونت عن الباك على نطاقين)
  const corsOrigins = (env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('access-control-allow-credentials', 'true');
      res.set('access-control-allow-headers', 'content-type, authorization');
      res.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  const ctx = { db, env };

  app.get(
    '/api/health',
    h(async (req, res) => {
      const ping = await db.ping();
      const body = { ok: ping.ok, adapter: db.kind };
      if (!ping.ok) body.error = ping.error;
      res.status(ping.ok ? 200 : 503).json(body);
    })
  );

  // تقديم الصور المرفوعة في وضع الذاكرة (في Firestore تُقدَّم من Firebase Storage مباشرة)
  app.get('/api/files/:id', (req, res) => {
    if (db.kind !== 'memory') return res.status(404).end();
    const file = db.getImage(req.params.id);
    if (!file) return res.status(404).end();
    res.set('content-type', file.mime || 'image/jpeg');
    res.set('cache-control', 'public, max-age=31536000');
    res.send(file.buffer);
  });

  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/public', publicRoutes(ctx));
  app.use('/api/shop', shopRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'الصفحة غير موجودة' } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err && (err.type === 'entity.too.large' || err.statusCode === 413)) {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'حجم البيانات أكبر من المسموح (4MB)' } });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'صيغة البيانات غير صحيحة' } });
    }
    console.error('[server error]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'حدث خطأ غير متوقع، حاول مرة أخرى' } });
  });

  return { app, db };
}

module.exports = { createApp };

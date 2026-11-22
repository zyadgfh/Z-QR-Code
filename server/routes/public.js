'use strict';

const express = require('express');
const { h } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const { sendWithEtag } = require('../lib/etag');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');

module.exports = function publicRoutes(ctx) {
  const { db, env, notifier } = ctx;
  const r = express.Router();

  // قائمة المنيو العامة حسب المحل
  r.get(
    '/shops/:slug/menu',
    h(async (req, res) => {
      res.json(await menuService.publicMenu(db, req.params.slug));
    })
  );

  // إرسال طلب — مع تحديد معدل ضد السبام
  r.post(
    '/shops/:slug/orders',
    rateLimit({
      windowMs: 60000,
      max: 10,
      keyFn: (req) => `order:${req.ip || 'x'}`,
    }),
    h(async (req, res) => {
      const result = await ordersService.createPublicOrder(db, req.params.slug, req.body || {});
      // إشعار المالك عبر القنوات المتاحة (NOTIF-01/02/04) — fire and forget
      try {
        const shops = await db.query('shops', [{ field: 'slug', value: req.params.slug }]);
        if (shops[0]) notifier.orderCreated(shops[0], result).catch(() => {});
      } catch { /* الإشعار لا يُسقط الطلب */ }
      res.status(201).json(result);
    })
  );

  // متابعة حالة الطلب برقم غير قابل للتخمين
  r.get(
    '/orders/:id',
    rateLimit({ windowMs: 60000, max: 120, keyFn: (req) => 'status:' + (req.ip || 'x') }),
    h(async (req, res) => {
      sendWithEtag(req, res, await ordersService.publicStatus(db, req.params.id));
    })
  );

  // ---------- ويب هوك تيليجرام (NOTIF-04): الربط عبر /start {slug} ----------
  r.post(
    '/notify/telegram',
    h(async (req, res) => {
      const secret = env.TELEGRAM_WEBHOOK_SECRET;
      if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
        return res.status(401).end();
      }
      const msg = req.body && req.body.message;
      const chatId = msg && msg.chat && msg.chat.id;
      const text = String((msg && msg.text) || '');
      const m = chatId && text.match(/^\/start\s+([a-z0-9][a-z0-9-]{1,39})\s*$/i);
      if (m) {
        const rows = await db.query('shops', [{ field: 'slug', value: m[1].toLowerCase() }]);
        if (rows[0]) {
          await db.update('shops', rows[0].id, { notify_telegram_chat_id: String(chatId) });
          if (env.TELEGRAM_BOT_TOKEN) {
            fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `✅ تم ربط هذا المحادثة بمحل «${rows[0].name}» — ستصلك إشعارات الطلبات الجديدة هنا` }),
            }).catch(() => {});
          }
        }
      }
      res.json({ ok: true });
    })
  );

  return r;
};

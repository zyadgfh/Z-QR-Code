'use strict';

const express = require('express');
const { h } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const { sendWithEtag } = require('../lib/etag');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');
const aiService = require('../services/ai');

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

  // تسجيل هاتف الزبون على طلب ترابيزة (F-17) — مقيّد بالمعدل
  r.put(
    '/orders/:id/phone',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => 'ophone:' + (req.ip || 'x') }),
    h(async (req, res) => {
      res.json(await ordersService.setPhone(db, req.params.id, req.body?.phone));
    })
  );

  // تقييم الطلب (D6) — نجوم 1..5 وتعليق، مرة واحدة لكل طلب
  r.post(
    '/orders/:id/rating',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => 'rate:' + (req.ip || 'x') }),
    h(async (req, res) => {
      res.json(await ordersService.rateOrder(db, req.params.id, req.body || {}));
    })
  );

  // «اسأل المنيو» (D6) — Gemini خادمي على بيانات المنيو المتاحة فقط، محدود المعدل
  r.post(
    '/shops/:slug/ask',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => 'ask:' + (req.ip || 'x') + ':' + req.params.slug }),
    h(async (req, res) => {
      const menu = await menuService.publicMenu(db, req.params.slug);
      const catName = new Map((menu.categories || []).map((c) => [c.id, c.name]));
      const lines = (menu.items || [])
        .filter((i) => i.available !== false)
        .slice(0, 150)
        .map((i) => {
          let line = `- ${i.name}${i.name_en ? ` (${i.name_en})` : ''} | ${catName.get(i.category_id) || ''} | price ${i.price}`;
          if (i.description) line += ` | desc: ${String(i.description).slice(0, 100)}`;
          if (Array.isArray(i.allergens) && i.allergens.length) line += ` | allergens: ${i.allergens.join(', ')}`;
          if (i.sold_out) line += ' | SOLD OUT today';
          return line;
        })
        .join('\n');
      const out = await aiService.askMenu({
        question: req.body && req.body.question,
        menuContext: lines,
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL || aiService.DEFAULT_MODEL,
      });
      res.json(out);
    })
  );

  // ---------- رصيد الولاء للزبون (F-17): مسار مقيّد بالمعدل ----------
  r.get(
    '/shops/:slug/loyalty',
    rateLimit({ windowMs: 60000, max: 30, keyFn: (req) => 'loyalty:' + (req.ip || 'x') }),
    h(async (req, res) => {
      const shops = require('../services/shops');
      const loyalty = require('../services/loyalty');
      const shop = await shops.findBySlug(db, req.params.slug);
      if (!shop || shop.archived === true) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
      const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
      if (!phone) throw new HttpError(400, 'PHONE_REQUIRED', 'رقم الهاتف مطلوب');
      res.json(await loyalty.publicBalance(db, shop, phone));
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

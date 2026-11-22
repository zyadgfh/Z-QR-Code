'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { asStr, isEmail } = require('../lib/validate');
const { authenticate } = require('../lib/session');
const { sendWithEtag } = require('../lib/etag');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');
const shopsService = require('../services/shops');
const adminService = require('../services/admin');
const aiService = require('../services/ai');
const { parseDataUrl } = require('../services/ai');

module.exports = function shopRoutes(ctx) {
  const { db, env } = ctx;
  const r = express.Router();

  // ---------- بث لحظي لتغييرات الطلبات (F-01) — قبل الحارس العام لأنه يصادق بنفسه ----------
  // EventSource لا يستطيع إرسال ترويسات، فيمر التوكن في الاستعلام (توقيع HS256 موثوق به)
  r.get(
    '/orders/stream',
    h(async (req, res) => {
      const { user } = await authenticate(ctx, { headers: { authorization: `Bearer ${String(req.query.t || '')}` } }, { enforceMfa: false });
      const mems = await db.query('memberships', [{ field: 'user_id', value: user.id }]);
      if (!mems.length) throw new HttpError(403, 'NO_SHOP', 'لا يوجد محل مرتبط بهذا الحساب');
      const shopId = mems[0].shop_id;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(': connected\n\n');
      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* مقفول */ }
      }, 25000);
      const unsub = typeof db.onOrders === 'function' ? db.onOrders(shopId, () => {
        try { res.write('data: changed\n\n'); } catch { /* مقفول */ }
      }) : null;
      req.on('close', () => {
        clearInterval(ping);
        if (unsub) unsub();
        try { res.end(); } catch { /* مقفول */ }
      });
    })
  );

  // ---------- الحماية: مستخدم مسجّل + عضوية محل (+ جلسات وMFA عبر lib/session) ----------
  r.use(
    h(async (req, res, next) => {
      const { user } = await authenticate(ctx, req, { enforceMfa: true });
      const mems = await db.query('memberships', [{ field: 'user_id', value: user.id }]);
      if (!mems.length) throw new HttpError(403, 'NO_SHOP', 'لا يوجد محل مرتبط بهذا الحساب');
      req.user = user;
      req.member = mems[0]; // v1: عضوية واحدة لكل مستخدم
      next();
    })
  );

  // الأدوار: الموظف يستقبل الطلبات فقط — كل ما عداها للمالك
  function ownerOnly(req) {
    if (req.member.role !== 'owner') {
      throw new HttpError(403, 'FORBIDDEN', 'هذه الصفحة لمالك المحل فقط');
    }
  }

  // ---------- ملخص المحل (الكل: مالك + موظف) ----------
  r.get(
    '/summary',
    h(async (req, res) => {
      const shop = await shopsService.byId(db, req.member.shop_id);
      if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
      const status = shopsService.statusOf(shop);
      const out = {
        shop: {
          id: shop.id,
          slug: shop.slug,
          name: shop.name,
          phone: shop.phone,
          menu_language: shop.menu_language,
          table_count: shop.table_count,
          logo_url: shop.logo_url,
          trial_ends_at: shop.trial_ends_at,
          paid_until: shop.paid_until,
          status,
          days_left: shopsService.daysLeft(shop),
        },
        my_role: req.member.role,
      };
      if (req.member.role === 'owner') {
        const settings = await adminService.getSettings(db);
        out.subscription = settings;
      }
      res.json(out);
    })
  );

  // ---------- الطلبات (مالك + موظف) ----------
  r.get(
    '/orders',
    h(async (req, res) => {
      sendWithEtag(req, res, await ordersService.listForShop(db, req.member.shop_id));
    })
  );

  // ---------- Web Push (NOTIF-01): المفتاح العام + تسجيل/إلغاء اشتراك جهاز ----------
  r.get('/push/key', h(async (req, res) => {
    res.json({ enabled: !!ctx.notifier?.pushEnabled, key: ctx.notifier?.publicKey || null });
  }));

  r.post('/push/subscribe', h(async (req, res) => {
    const sub = req.body && req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
      throw new HttpError(400, 'BAD_SUBSCRIPTION', 'اشتراك غير صالح');
    const id = require('crypto').createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 32);
    await db.set('push_subscriptions', id, {
      shop_id: req.member.shop_id,
      user_id: req.user.id,
      endpoint: sub.endpoint,
      keys: sub.keys,
      created_at: Date.now(),
    });
    res.json({ ok: true });
  }));

  r.post('/push/unsubscribe', h(async (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    if (typeof endpoint === 'string' && endpoint) {
      const id = require('crypto').createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
      await db.delete('push_subscriptions', id).catch(() => {});
    }
    res.json({ ok: true });
  }));

  r.post(
    '/orders/:id/accept',
    h(async (req, res) => {
      const updated = await ordersService.accept(db, req.member.shop_id, req.params.id, req.body && req.body.eta_minutes);
      res.json(updated);
    })
  );

  r.post(
    '/orders/:id/stage',
    h(async (req, res) => {
      const updated = await ordersService.setStage(db, req.member.shop_id, req.params.id, req.body && req.body.stage);
      res.json(updated);
    })
  );

  // ---------- المنيو (مالك فقط) ----------
  r.get(
    '/menu',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await menuService.listFull(db, req.member.shop_id));
    })
  );

  r.post(
    '/categories',
    h(async (req, res) => {
      ownerOnly(req);
      res.status(201).json(await menuService.createCategory(db, req.member.shop_id, req.body || {}));
    })
  );
  r.put(
    '/categories/:id',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await menuService.updateCategory(db, req.member.shop_id, req.params.id, req.body || {}));
    })
  );
  r.delete(
    '/categories/:id',
    h(async (req, res) => {
      ownerOnly(req);
      await menuService.deleteCategory(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  r.post(
    '/items',
    h(async (req, res) => {
      ownerOnly(req);
      res.status(201).json(await menuService.createItem(db, req.member.shop_id, req.body || {}));
    })
  );
  r.put(
    '/items/:id',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await menuService.updateItem(db, req.member.shop_id, req.params.id, req.body || {}));
    })
  );
  r.delete(
    '/items/:id',
    h(async (req, res) => {
      ownerOnly(req);
      await menuService.deleteItem(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  r.post(
    '/items/:id/groups',
    h(async (req, res) => {
      ownerOnly(req);
      res.status(201).json(await menuService.saveGroup(db, req.member.shop_id, req.params.id, null, req.body || {}));
    })
  );
  r.put(
    '/groups/:id',
    h(async (req, res) => {
      ownerOnly(req);
      const group = await menuService.mustOwn(db, 'option_groups', req.params.id, req.member.shop_id);
      res.json(await menuService.saveGroup(db, req.member.shop_id, group.item_id, req.params.id, req.body || {}));
    })
  );
  r.delete(
    '/groups/:id',
    h(async (req, res) => {
      ownerOnly(req);
      await menuService.deleteGroup(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  // ---------- الإعدادات + رفع الصور (مالك فقط) ----------
  r.put(
    '/settings',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await shopsService.updateSettings(db, req.member.shop_id, req.body || {}));
    })
  );

  r.post(
    '/uploads',
    h(async (req, res) => {
      ownerOnly(req);
      const parsed = parseDataUrl(req.body && req.body.dataUrl);
      if (!parsed) throw new HttpError(400, 'INVALID_IMAGE', 'صورة غير صالحة (JPG/PNG/WebP حتى 4MB)');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.mime.split('/')[1]}`;
      const url = await db.saveImage(req.member.shop_id, filename, parsed.data ? Buffer.from(parsed.data, 'base64') : parsed.buffer, parsed.mime);
      res.status(201).json({ url });
    })
  );

  // ---------- الموظفين (مالك فقط) ----------
  r.get(
    '/staff',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await shopsService.listStaff(db, req.member.shop_id));
    })
  );
  r.post(
    '/staff',
    h(async (req, res) => {
      ownerOnly(req);
      const body = req.body || {};
      res.status(201).json(await shopsService.addStaff(db, req.member.shop_id, { email: body.email, password: body.password }));
    })
  );
  r.delete(
    '/staff/:userId',
    h(async (req, res) => {
      ownerOnly(req);
      await shopsService.removeStaff(db, req.member.shop_id, req.params.userId);
      res.json({ ok: true });
    })
  );

  // ---------- استيراد المنيو بالـ AI (مالك فقط) ----------
  r.post(
    '/ai/extract-menu',
    h(async (req, res) => {
      ownerOnly(req);
      const draft = await aiService.extractMenu({
        images: (req.body && req.body.images) || [],
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
      });
      res.json(draft);
    })
  );

  return r;
};

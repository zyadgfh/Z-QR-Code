'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { verifyPassword, signToken, bearerToken, verifyToken } = require('../lib/auth');
const { asStr, isEmail } = require('../lib/validate');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');
const shopsService = require('../services/shops');
const adminService = require('../services/admin');
const aiService = require('../services/ai');
const { parseDataUrl } = require('../services/ai');

module.exports = function shopRoutes(ctx) {
  const { db, env } = ctx;
  const r = express.Router();

  const secret = () => env.JWT_SECRET || 'dev-secret-change-me';

  // ---------- الحماية: مستخدم مسجّل + عضوية محل ----------
  r.use(
    h(async (req, res, next) => {
      const token = bearerToken(req);
      if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'سجّل الدخول أولًا');
      const payload = verifyToken(token, secret());
      if (!payload) throw new HttpError(401, 'UNAUTHORIZED', 'انتهت الجلسة، سجّل الدخول من جديد');
      const user = await db.get('users', payload.sub);
      if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'الحساب غير موجود');
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
      res.json(await ordersService.listForShop(db, req.member.shop_id));
    })
  );

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

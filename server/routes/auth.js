'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { verifyPassword, hashPassword, signToken, bearerToken, verifyToken } = require('../lib/auth');
const { asStr, isEmail } = require('../lib/validate');
const { rateLimit } = require('../lib/ratelimit');
const shops = require('../services/shops');

module.exports = function authRoutes(ctx) {
  const { db, env } = ctx;
  const r = express.Router();

  const secret = () => env.JWT_SECRET || 'dev-secret-change-me';

  async function authUser(req) {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'سجّل الدخول أولًا');
    const payload = verifyToken(token, secret());
    if (!payload) throw new HttpError(401, 'UNAUTHORIZED', 'انتهت الجلسة، سجّل الدخول من جديد');
    const user = await db.get('users', payload.sub);
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'الحساب غير موجود');
    return user;
  }

  // ---------- تسجيل الدخول ----------
  r.post(
    '/login',
    rateLimit({
      windowMs: 60000,
      max: 10,
      keyFn: (req) => `login:${req.app.get('qm_app_id')}:${req.ip || 'x'}`,
    }),
    h(async (req, res) => {
      const email = asStr(req.body && req.body.email, { max: 120, min: 3 }).toLowerCase();
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
      if (!email || !isEmail(email)) throw new HttpError(400, 'INVALID_EMAIL', 'البريد الإلكتروني غير صحيح');
      const rows = await db.query('users', [{ field: 'email', value: email }]);
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw new HttpError(401, 'BAD_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }
      const token = signToken(user.id, secret());
      res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
      });
    })
  );

  // ---------- فحص وجود أدمن (عام — لبوابة الإعداد الأول) ----------
  r.get(
    '/admin-exists',
    h(async (req, res) => {
      const admins = await db.query('users', [{ field: 'role', value: 'platform_admin' }]);
      res.json({ exists: admins.length > 0 });
    })
  );

  // ---------- بوابة الإعداد الأول: إنشاء أول أدمن — تُغلق نهائيًا بعد أول حساب ----------
  r.post(
    '/bootstrap-admin',
    rateLimit({ windowMs: 60000, max: 5, keyFn: (req) => `boot:${req.app.get('qm_app_id')}:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const admins = await db.query('users', [{ field: 'role', value: 'platform_admin' }]);
      if (admins.length)
        throw new HttpError(403, 'ALREADY_INITIALIZED', 'يوجد حساب أدمن بالفعل — استخدم صفحة تسجيل الدخول');
      const email = asStr(req.body && req.body.email, { max: 120, min: 5 });
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
      if (!email || !isEmail(email)) throw new HttpError(400, 'INVALID_EMAIL', 'البريد الإلكتروني غير صحيح');
      if (password.length < 10)
        throw new HttpError(400, 'WEAK_PASSWORD', 'كلمة المرور 10 أحرف على الأقل (اختر كلمة قوية — أنت super admin المنصة)');
      if (await shops.emailTaken(db, email))
        throw new HttpError(400, 'EMAIL_TAKEN', 'هذا البريد مستخدم بالفعل');
      const id = 'user_platform_admin';
      await db.set('users', id, {
        email: email.toLowerCase(),
        password_hash: hashPassword(password),
        role: 'platform_admin',
        created_at: Date.now(),
      });
      const token = signToken(id, secret());
      res.status(201).json({ token, user: { id, email: email.toLowerCase(), role: 'platform_admin' } });
    })
  );

  // ---------- تغيير كلمة المرور للحساب الحالي (مالك/موظف/أدمن) ----------
  r.put(
    '/password',
    h(async (req, res) => {
      const user = await authUser(req);
      const current = typeof (req.body && req.body.current_password) === 'string' ? req.body.current_password : '';
      const next = typeof (req.body && req.body.new_password) === 'string' ? req.body.new_password : '';
      if (!verifyPassword(current, user.password_hash))
        throw new HttpError(400, 'WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة');
      if (next.length < 8)
        throw new HttpError(400, 'WEAK_PASSWORD', 'كلمة المرور الجديدة 8 أحرف على الأقل');
      await db.update('users', user.id, { password_hash: hashPassword(next) });
      res.json({ ok: true });
    })
  );

  // ---------- بيانات المستخدم الحالي + عضوياته ----------
  r.get(
    '/me',
    h(async (req, res) => {
      const user = await authUser(req);
      const mems = await db.query('memberships', [{ field: 'user_id', value: user.id }]);
      const memberships = await Promise.all(
        mems.map(async (m) => {
          const shop = await db.get('shops', m.shop_id);
          return shop
            ? {
                shop_id: m.shop_id,
                role: m.role,
                shop: {
                  id: shop.id,
                  slug: shop.slug,
                  name: shop.name,
                  phone: shop.phone,
                  menu_language: shop.menu_language,
                  table_count: shop.table_count,
                  logo_url: shop.logo_url,
                  status: shops.statusOf(shop),
                  trial_ends_at: shop.trial_ends_at,
                  paid_until: shop.paid_until,
                  days_left: shops.daysLeft(shop),
                },
              }
            : null;
        })
      );
      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        memberships: memberships.filter(Boolean),
      });
    })
  );

  return r;
};

module.exports.authUserFor = null;

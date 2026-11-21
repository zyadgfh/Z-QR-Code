'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { verifyPassword, signToken, bearerToken, verifyToken } = require('../lib/auth');
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

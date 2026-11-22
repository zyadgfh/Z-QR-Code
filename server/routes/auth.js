'use strict';

const express = require('express');
const crypto = require('crypto');
const { h, HttpError } = require('../lib/errors');
const { verifyPassword, hashPassword, signToken, bearerToken, verifyToken } = require('../lib/auth');
const { asStr, isEmail } = require('../lib/validate');
const { rateLimit } = require('../lib/ratelimit');
const { authenticate, revokeSession } = require('../lib/session');
const totp = require('../lib/totp');
const templates = require('../lib/mailTemplates');
const shops = require('../services/shops');

const ACCESS_TTL = 12 * 60 * 60 * 1000; // جلسة لوحة: 12 ساعة مطلقة
const MFA_TTL = 5 * 60 * 1000;
const RESET_TTL = 10 * 60 * 1000;
const RESET_ATTEMPTS = 5;

module.exports = function authRoutes(ctx) {
  const { db, env, redis, mailer } = ctx;
  const r = express.Router();

  const secret = () => env.JWT_SECRET || 'dev-secret-change-me';
  const pepper = () => env.JWT_SECRET || 'qm-pepper';
  const mfaEnforcedEnv = () => (env.MFA_ENFORCED || '1') !== '0';

  async function authUser(req) {
    return (await authenticate(ctx, req)).user;
  }

  /** إنشاء جلسة جديدة: توكن + سجل جهاز + علامة نشاط في Redis */
  async function createSession(req, user) {
    const jti = crypto.randomUUID();
    const token = signToken(user.id, secret(), { expiresMs: ACCESS_TTL, tv: user.token_version || 0, jti });
    const row = {
      user_id: user.id,
      ua: String((req && req.headers['user-agent']) || '').slice(0, 180),
      ip: String((req && (req.headers['x-forwarded-for'] || req.ip)) || '').split(',')[0].trim().slice(0, 60),
      created_at: Date.now(),
      last_seen: Date.now(),
      revoked_at: null,
    };
    await db.set('user_sessions', jti, row);
    if (redis) redis.safe('SETEX', `sess_seen:${jti}`, '1800', '1').catch(() => {});
    return { token, jti };
  }

  async function revokeAllSessions(userId, exceptJti = null) {
    const rows = await db.query('user_sessions', [{ field: 'user_id', value: userId }]);
    for (const row of rows) {
      if (exceptJti && row.id === exceptJti) continue;
      if (!row.revoked_at) await revokeSession(ctx, row.id, row);
    }
  }

  async function sendMail(to, tpl) {
    if (!mailer) return;
    await mailer.send({ to, ...tpl });
  }

  // ---------- تسجيل الدخول ----------
  r.post(
    '/login',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `login:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const email = asStr(req.body && req.body.email, { max: 120, min: 3 }).toLowerCase();
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
      if (!email || !isEmail(email)) throw new HttpError(400, 'INVALID_EMAIL', 'البريد الإلكتروني غير صحيح');
      const rows = await db.query('users', [{ field: 'email', value: email }]);
      const user = rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw new HttpError(401, 'BAD_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }
      // حساب مفعّل بـ 2FA → خطوة تحدٍّ ثانية بلا توكن كامل
      if (user.mfa_enabled) {
        const mfa_token = signToken(user.id, secret(), { expiresMs: MFA_TTL, tv: user.token_version || 0, kind: 'mfa' });
        return res.json({ mfa_required: true, mfa_token, user: { id: user.id, email: user.email, role: user.role } });
      }
      const { token } = await createSession(req, user);
      res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role, mfa_enabled: false, mfa_enforced: mfaEnforcedEnv() && (user.role === 'owner' || user.role === 'platform_admin') },
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
    rateLimit({ windowMs: 60000, max: 5, keyFn: (req) => `boot:${req.ip || 'x'}` }),
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
        token_version: 0,
        created_at: Date.now(),
      });
      const user = await db.get('users', id);
      const { token } = await createSession(req, user);
      res.status(201).json({
        token,
        user: { id, email: email.toLowerCase(), role: 'platform_admin', mfa_enabled: false, mfa_enforced: mfaEnforcedEnv() },
      });
    })
  );

  // ---------- تغيير كلمة المرور للحساب الحالي: يبطل كل الجلسات ويعيد توكنًا جديدًا ----------
  r.put(
    '/password',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `pw:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const { user, payload } = await authenticate(ctx, req);
      const current = typeof (req.body && req.body.current_password) === 'string' ? req.body.current_password : '';
      const next = typeof (req.body && req.body.new_password) === 'string' ? req.body.new_password : '';
      if (!verifyPassword(current, user.password_hash))
        throw new HttpError(400, 'WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة');
      if (next.length < 8)
        throw new HttpError(400, 'WEAK_PASSWORD', 'كلمة المرور الجديدة 8 أحرف على الأقل');
      await db.update('users', user.id, { password_hash: hashPassword(next), token_version: (user.token_version || 0) + 1 });
      await revokeAllSessions(user.id, payload.jti);
      const fresh = await db.get('users', user.id);
      const { token } = await createSession(req, fresh);
      sendMail(user.email, templates.passwordChanged(user.email)).catch(() => {});
      res.json({ ok: true, token });
    })
  );

  // ---------- طلب رمز إعادة تعيين كلمة المرور (SEC-01): رد موحد — بلا تعداد حسابات ----------
  r.post(
    '/request-reset',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyFn: (req) => `rr:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const email = asStr(req.body && req.body.email, { max: 120, min: 3 }).toLowerCase();
      const okResponse = { ok: true, message: 'إن كان البريد مسجلًا فستصله رسالة بالرمز خلال دقائق' };
      if (!email || !isEmail(email)) return res.json(okResponse);
      const rows = await db.query('users', [{ field: 'email', value: email }]);
      const user = rows[0];
      if (!user) return res.json(okResponse);
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await db.set('reset_codes', user.id, {
        code_hash: totp.hashWithPepper(code, pepper()),
        expires_at: Date.now() + RESET_TTL,
        attempts: 0,
      });
      sendMail(user.email, templates.passwordResetCode(user.email, code, RESET_TTL / 60000)).catch(() => {});
      res.json(okResponse);
    })
  );

  // ---------- تنفيذ إعادة التعيين: رمز + كلمة مرور جديدة ----------
  r.post(
    '/reset-password',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyFn: (req) => `rp:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const email = asStr(req.body && req.body.email, { max: 120, min: 3 }).toLowerCase();
      const code = typeof (req.body && req.body.code) === 'string' ? req.body.code.trim() : '';
      const next = typeof (req.body && req.body.new_password) === 'string' ? req.body.new_password : '';
      const rows = await db.query('users', [{ field: 'email', value: email }]);
      const user = rows[0];
      const row = user ? await db.get('reset_codes', user.id) : null;
      if (!user || !row) throw new HttpError(400, 'BAD_RESET', 'الرمز غير صحيح أو منتهي — اطلب رمزًا جديدًا');
      if (Date.now() >= row.expires_at) {
        await db.delete('reset_codes', user.id);
        throw new HttpError(400, 'BAD_RESET', 'الرمز غير صحيح أو منتهي — اطلب رمزًا جديدًا');
      }
      if (row.attempts >= RESET_ATTEMPTS) {
        await db.delete('reset_codes', user.id);
        throw new HttpError(400, 'BAD_RESET', 'الرمز غير صحيح أو منتهي — اطلب رمزًا جديدًا');
      }
      if (totp.hashWithPepper(code, pepper()) !== row.code_hash) {
        await db.update('reset_codes', user.id, { attempts: row.attempts + 1 });
        throw new HttpError(400, 'BAD_RESET', 'الرمز غير صحيح أو منتهي — اطلب رمزًا جديدًا');
      }
      if (next.length < 8) throw new HttpError(400, 'WEAK_PASSWORD', 'كلمة المرور الجديدة 8 أحرف على الأقل');
      await db.update('users', user.id, {
        password_hash: hashPassword(next),
        token_version: (user.token_version || 0) + 1,
      });
      await db.delete('reset_codes', user.id);
      await revokeAllSessions(user.id);
      sendMail(user.email, templates.passwordChanged(user.email)).catch(() => {});
      res.json({ ok: true, message: 'تم تغيير كلمة المرور — سجّل الدخول من جديد' });
    })
  );

  // ---------- خروج الجلسة الحالية ----------
  r.post(
    '/logout',
    h(async (req, res) => {
      const token = bearerToken(req);
      const payload = token ? verifyToken(token, secret()) : null;
      if (payload && payload.jti) {
        const row = await db.get('user_sessions', payload.jti);
        if (row) await revokeSession(ctx, payload.jti, row);
      }
      res.json({ ok: true });
    })
  );

  // ---------- خروج كل الأجهزة الأخرى (تبقى الجلسة الحالية) ----------
  r.post(
    '/logout-all',
    h(async (req, res) => {
      const { user, payload } = await authenticate(ctx, req);
      await revokeAllSessions(user.id, payload.jti);
      res.json({ ok: true });
    })
  );

  // ---------- قائمة الأجهزة النشطة ----------
  r.get(
    '/sessions',
    h(async (req, res) => {
      const { user, payload } = await authenticate(ctx, req);
      const rows = await db.query('user_sessions', [{ field: 'user_id', value: user.id }]);
      const sessions = rows
        .filter((s) => !s.revoked_at)
        .sort((a, b) => b.created_at - a.created_at)
        .map((s) => ({
          id: s.id,
          current: s.id === payload.jti,
          ua: s.ua,
          ip: s.ip,
          created_at: s.created_at,
          last_seen: s.last_seen,
        }));
      res.json({ sessions });
    })
  );

  // ---------- إبطال جهاز محدد ----------
  r.delete(
    '/sessions/:id',
    h(async (req, res) => {
      const { user } = await authenticate(ctx, req);
      const row = await db.get('user_sessions', req.params.id);
      if (!row || row.user_id !== user.id) throw new HttpError(404, 'NOT_FOUND', 'الجلسة غير موجودة');
      await revokeSession(ctx, row.id, row);
      res.json({ ok: true });
    })
  );

  // ---------- 2FA: بدء الإعداد (مسموح حتى قبل التفعيل — بلا فرض هنا) ----------
  r.post(
    '/2fa/setup',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `2fa:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const user = await authUser(req);
      if (user.mfa_enabled) throw new HttpError(400, 'ALREADY_ENABLED', 'التحقق بخطوتين مفعّل بالفعل');
      const secret32 = totp.generateSecret();
      await db.update('users', user.id, { mfa_pending_secret: secret32 });
      res.json({ secret: secret32, otpauth: totp.otpauthUri(user.email, secret32) });
    })
  );

  // ---------- 2FA: تأكيد الإعداد — يفعّل، يولد أكواد استرداد، يبطل كل الجلسات ----------
  r.post(
    '/2fa/verify',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `2fav:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const user = await authUser(req);
      if (user.mfa_enabled) throw new HttpError(400, 'ALREADY_ENABLED', 'التحقق بخطوتين مفعّل بالفعل');
      const pending = user.mfa_pending_secret;
      if (!pending) throw new HttpError(400, 'NO_SETUP', 'ابدأ الإعداد أولًا');
      const code = typeof (req.body && req.body.code) === 'string' ? req.body.code : '';
      if (!totp.verifyTotp(pending, code)) throw new HttpError(400, 'BAD_CODE', 'الرمز غير صحيح — تأكد من تطبيق المصادق');
      const recovery = totp.generateRecoveryCodes(8);
      await db.update('users', user.id, {
        mfa_enabled: true,
        mfa_secret: pending,
        mfa_pending_secret: null,
        recovery_hashes: recovery.map((c) => totp.hashWithPepper(c, pepper())),
        token_version: (user.token_version || 0) + 1,
      });
      await revokeAllSessions(user.id);
      const fresh = await db.get('users', user.id);
      const { token } = await createSession(req, fresh);
      sendMail(user.email, templates.mfaEnabled(user.email)).catch(() => {});
      res.json({
        ok: true,
        recovery_codes: recovery,
        token,
        user: { id: fresh.id, email: fresh.email, role: fresh.role, mfa_enabled: true, mfa_enforced: mfaEnforcedEnv() && (fresh.role === 'owner' || fresh.role === 'platform_admin') },
      });
    })
  );

  // ---------- 2FA: خطوة التحقق بعد الدخول (توكن mfa مؤقت 5 دقائق) ----------
  r.post(
    '/2fa/challenge',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `mfa:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const token = bearerToken(req);
      const payload = token ? verifyToken(token, secret()) : null;
      if (!payload || payload.kind !== 'mfa')
        throw new HttpError(401, 'UNAUTHORIZED', 'ابدأ تسجيل الدخول من جديد');
      const user = await db.get('users', payload.sub);
      if (!user || !user.mfa_enabled) throw new HttpError(401, 'UNAUTHORIZED', 'ابدأ تسجيل الدخول من جديد');
      const code = typeof (req.body && req.body.code) === 'string' ? req.body.code.trim() : '';
      let usedRecovery = false;
      let ok = totp.verifyTotp(user.mfa_secret, code);
      if (!ok && /^[0-9a-f]{4}-[0-9a-f]{4}$/i.test(code)) {
        const hash = totp.hashWithPepper(code.toLowerCase(), pepper());
        const hashes = user.recovery_hashes || [];
        const idx = hashes.indexOf(hash);
        if (idx >= 0) {
          usedRecovery = true;
          const remaining = hashes.filter((_, i) => i !== idx);
          await db.update('users', user.id, { recovery_hashes: remaining });
          if (remaining.length === 3) sendMail(user.email, templates.recoveryLow(user.email, 3)).catch(() => {});
          ok = true;
        }
      }
      if (!ok) throw new HttpError(401, 'BAD_CODE', 'الرمز غير صحيح');
      const { token: accessToken } = await createSession(req, user);
      res.json({
        token: accessToken,
        used_recovery: usedRecovery,
        recovery_left: usedRecovery ? (user.recovery_hashes || []).length - 1 : undefined,
        user: { id: user.id, email: user.email, role: user.role, mfa_enabled: true, mfa_enforced: mfaEnforcedEnv() && (user.role === 'owner' || user.role === 'platform_admin') },
      });
    })
  );

  // ---------- 2FA: الإيقاف (كلمة مرور + رمز حالي) ----------
  r.post(
    '/2fa/disable',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `2fad:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const { user } = await authenticate(ctx, req);
      if (!user.mfa_enabled) throw new HttpError(400, 'NOT_ENABLED', 'التحقق بخطوتين غير مفعّل');
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
      const code = typeof (req.body && req.body.code) === 'string' ? req.body.code : '';
      if (!verifyPassword(password, user.password_hash))
        throw new HttpError(400, 'WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة');
      if (!totp.verifyTotp(user.mfa_secret, code)) throw new HttpError(400, 'BAD_CODE', 'الرمز غير صحيح');
      await db.update('users', user.id, {
        mfa_enabled: false,
        mfa_secret: null,
        mfa_pending_secret: null,
        recovery_hashes: [],
        token_version: (user.token_version || 0) + 1,
      });
      await revokeAllSessions(user.id);
      const fresh = await db.get('users', user.id);
      const { token } = await createSession(req, fresh);
      sendMail(user.email, templates.mfaDisabled(user.email)).catch(() => {});
      res.json({ ok: true, token, user: { id: fresh.id, email: fresh.email, role: fresh.role, mfa_enabled: false, mfa_enforced: mfaEnforcedEnv() && (fresh.role === 'owner' || fresh.role === 'platform_admin') } });
    })
  );

  // ---------- 2FA: توليد مجموعة أكواد استرداد جديدة ----------
  r.post(
    '/2fa/recovery-codes',
    rateLimit({ windowMs: 60000, max: 10, keyFn: (req) => `2far:${req.ip || 'x'}` }),
    h(async (req, res) => {
      const { user } = await authenticate(ctx, req);
      if (!user.mfa_enabled) throw new HttpError(400, 'NOT_ENABLED', 'التحقق بخطوتين غير مفعّل');
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
      if (!verifyPassword(password, user.password_hash))
        throw new HttpError(400, 'WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة');
      const recovery = totp.generateRecoveryCodes(8);
      await db.update('users', user.id, {
        recovery_hashes: recovery.map((c) => totp.hashWithPepper(c, pepper())),
        token_version: (user.token_version || 0) + 1,
      });
      await revokeAllSessions(user.id);
      const fresh = await db.get('users', user.id);
      const { token } = await createSession(req, fresh);
      res.json({ ok: true, recovery_codes: recovery, token });
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
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          mfa_enabled: !!user.mfa_enabled,
          mfa_enforced: mfaEnforcedEnv() && (user.role === 'owner' || user.role === 'platform_admin'),
        },
        memberships: memberships.filter(Boolean),
      });
    })
  );

  return r;
};

module.exports.authUserFor = null;

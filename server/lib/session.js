'use strict';

/**
 * مصادقة الجلسات الموحدة (SEC-02 + SEC-03):
 * - token_version: أي تغيير أمني (كلمة مرور/2FA) يرفع العداد فيُبطل كل
 *   التوكنات القديمة فورًا (توكنات v1 القديمة بلا tv تُعامل tv=0).
 * - jti + user_sessions: سجل أجهزة + إبطال فردي (يصل عبر Redis فوريًا،
 *   وبدونه خلال ≤60 ثانية من الكاش المحلي).
 * - خمول 30 دقيقة عبر علامة Redis منزلقة (بدون Redis: يفرضه العميل).
 * - MFA: مطلوب لأدوار owner/platform_admin عندما MFA_ENFORCED≠0
 *   (مسارات /api/auth لا تفرضه ليتاح إكمال الإعداد).
 */
const { verifyToken, bearerToken } = require('./auth');
const { HttpError } = require('./errors');

const OK_TTL = 60000; // كاش صلاحية الجلسة الإيجابي
const okCache = new Map();
const revokedCache = new Map();
const lastSeenAt = new Map(); // خفض الكتابات: refresh آخر ظهور كل 60 ثانية (Redis) / 5 دقائق (db)

function cachesPrune() {
  if (okCache.size > 10000) okCache.clear();
  if (revokedCache.size > 10000) revokedCache.clear();
  if (lastSeenAt.size > 10000) lastSeenAt.clear();
}

function invalidate(jti) {
  okCache.delete(jti);
  revokedCache.set(jti, 1);
}

async function authenticate(ctx, req, { enforceMfa = false, kind = 'access' } = {}) {
  const { db, env, redis } = ctx;
  const secret = env.JWT_SECRET || 'dev-secret-change-me';
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'سجّل الدخول أولًا');
  const payload = verifyToken(token, secret);
  if (!payload || (payload.kind || 'access') !== kind)
    throw new HttpError(401, 'UNAUTHORIZED', 'انتهت الجلسة، سجّل الدخول من جديد');
  const user = await db.get('users', payload.sub);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'الحساب غير موجود');

  // 1) إبطال شامل عبر token_version
  if ((payload.tv === undefined ? 0 : payload.tv) !== (user.token_version || 0))
    throw new HttpError(401, 'SESSION_INVALIDATED', 'أُغلقت هذه الجلسة (تغيرت بيانات الأمان) — سجّل الدخول من جديد');

  // 2) فحص الجلسة الفردية (للتوكنات الجديدة التي تحمل jti)
  const now = Date.now();
  if (payload.jti) {
    cachesPrune();
    if (revokedCache.get(payload.jti) === 1)
      throw new HttpError(401, 'SESSION_INVALIDATED', 'أُغلقت هذه الجلسة — سجّل الدخول من جديد');
    let cachedUntil = okCache.get(payload.jti) || 0;
    if (cachedUntil < now) {
      const row = await db.get('user_sessions', payload.jti);
      if (!row || row.revoked_at) {
        invalidate(payload.jti);
        throw new HttpError(401, 'SESSION_INVALIDATED', 'أُغلقت هذه الجلسة — سجّل الدخول من جديد');
      }
      if (redis) {
        const flag = await redis.safe('GET', `sess_revoked:${payload.jti}`);
        if (flag === '1') {
          invalidate(payload.jti);
          throw new HttpError(401, 'SESSION_INVALIDATED', 'أُغلقت هذه الجلسة — سجّل الدخول من جديد');
        }
      }
      okCache.set(payload.jti, now + OK_TTL);
    }

    // 3) الخمول (Redis فقط — علامة منزلقة 30 دقيقة)
    if (redis) {
      let seen = '1';
      try {
        seen = await redis.cmd('GET', `sess_seen:${payload.jti}`);
      } catch {
        seen = '1'; // تعطل Redis لا يُسقط المستخدمين
      }
      if (seen === null) throw new HttpError(401, 'IDLE_TIMEOUT', 'انتهت الجلسة بسبب الخمول — سجّل الدخول من جديد');
      const last = lastSeenAt.get(payload.jti) || 0;
      if (now - last > OK_TTL) {
        lastSeenAt.set(payload.jti, now);
        redis.safe('SETEX', `sess_seen:${payload.jti}`, '1800', '1').catch(() => {});
      }
    } else {
      // بلا Redis: تحديث last_seen في السجل كل 5 دقائق (تدقيق فقط)
      const last = lastSeenAt.get(payload.jti) || 0;
      if (now - last > 300000) {
        lastSeenAt.set(payload.jti, now);
        db.update('user_sessions', payload.jti, { last_seen: now }).catch(() => {});
      }
    }
  }

  // 4) فرض MFA على المالك وأدمن المنصة
  const mfaEnforcedEnv = (env.MFA_ENFORCED || '1') !== '0';
  if (enforceMfa && mfaEnforcedEnv && (user.role === 'owner' || user.role === 'platform_admin') && !user.mfa_enabled)
    throw new HttpError(403, 'MFA_REQUIRED', 'التحقق بخطوتين مطلوب لهذا الحساب — أكمل الإعداد أولًا');

  return { user, payload };
}

/** إبطال جلسة واحدة: db + redis + كاش النسخة الحالية */
function revokeSession(ctx, jti, row) {
  invalidate(jti);
  const p = ctx.db.update('user_sessions', jti, { revoked_at: Date.now() }).catch(() => {});
  if (ctx.redis) ctx.redis.safe('SETEX', `sess_revoked:${jti}`, String(12 * 3600), '1').catch(() => {});
  return p;
}

module.exports = { authenticate, revokeSession, invalidate };

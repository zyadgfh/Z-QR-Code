'use strict';

const crypto = require('crypto');

// ---------- كلمات المرور (scrypt مدمج في Node — بدون اعتماديات خارجية) ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const actual = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- رموز الجلسة (JWT بسيط بـ HMAC-SHA256) ----------

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signToken(userId, secret, { expiresMs = 14 * 24 * 60 * 60 * 1000 } = {}) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Date.now();
  const payload = b64url(JSON.stringify({ sub: userId, iat: now, exp: now + expiresMs }));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.sub !== 'string' || typeof data.exp !== 'number') return null;
    if (Date.now() >= data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, bearerToken };

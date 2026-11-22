'use strict';

const crypto = require('crypto');

/**
 * TOTP (RFC 6238) بدون أي اعتماديات خارجية: base32 + HMAC-SHA1.
 * يُستخدم للتحقق بخطوتين (SEC-03) وأكواد الاسترداد.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCodeAtStep(secretBuf, step) {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(counter).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

/** تحقق بميزان زمني ±window خطوة (30 ثانية لكل خطوة افتراضيًا) */
function verifyTotp(secretBase32, code, { now = Date.now(), step = 30000, window = 1 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  const secretBuf = base32Decode(secretBase32);
  if (!secretBuf.length) return false;
  const current = Math.floor(now / step);
  for (let i = -window; i <= window; i++) {
    const expected = totpCodeAtStep(secretBuf, current + i);
    const a = Buffer.from(code.trim());
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function otpauthUri(email, secret) {
  const label = encodeURIComponent(`QRMenu:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=QRMenu&algorithm=SHA1&digits=6&period=30`;
}

// ---------- أكواد الاسترداد (تُستهلك مرة واحدة، تُخزن مجزأة فقط) ----------

function generateRecoveryCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const a = crypto.randomBytes(2).toString('hex');
    const b = crypto.randomBytes(2).toString('hex');
    codes.push(`${a}-${b}`);
  }
  return codes;
}

/** hash بفلفلة JWT_SECRET — يمنع قراءة الأكواد حتى من تسريب قاعدة البيانات */
function hashWithPepper(value, secret) {
  return crypto.createHmac('sha256', String(secret || 'qm-pepper')).update(String(value)).digest('hex');
}

module.exports = {
  base32Encode,
  base32Decode,
  verifyTotp,
  totpCodeAtStep,
  generateSecret,
  otpauthUri,
  generateRecoveryCodes,
  hashWithPepper,
};

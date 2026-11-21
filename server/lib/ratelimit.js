'use strict';

/**
 * تحديد معدل بسيط في الذاكرة (نافذة منزلقة لكل مفتاح).
 * يكفي لمنع سبام الطلبات في v1. على بيئات serverless متعددة النسخ
 * الحماية تقريبية لكل نسخة — يُوثّق ذلك في README.
 */
const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 10, keyFn = (req) => req.ip || 'unknown' } = {}) {
  return (req, res, next) => {
    const key = `${keyFn(req)}`;
    const now = Date.now();
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    // تنظيف القديم
    while (arr.length && now - arr[0] >= windowMs) arr.shift();
    if (arr.length >= max) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'محاولات كثيرة جدًا، انتظر قليلًا ثم أعد المحاولة' },
      });
    }
    arr.push(now);
    // منع تضخم الذاكرة
    if (buckets.size > 10000) {
      for (const [k, v] of buckets) {
        if (!v.length || now - v[v.length - 1] >= windowMs) buckets.delete(k);
      }
    }
    next();
  };
}

module.exports = { rateLimit };

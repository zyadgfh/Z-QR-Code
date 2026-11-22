'use strict';

/**
 * تحديد المعدل: نافذة ثابتة لكل مفتاح.
 * - مع Redis (Upstash REST): العدّاد مشترك بين كل نسخ الخادم — يقفل فجوة
 *   تجاوز الحدود بتوزيع الحمل على نسخ serverless متعددة.
 * - بدون Redis: عدّاد في الذاكرة لكل نسخة (سلوك v1 السابق)، مع بادئة
 *   هوية النسخة تلقائيًا.
 * - فشل Redis → تراجع فوري للذاكرة (توافر أولًا).
 */

const buckets = new Map();

function memoryAllow(req, key, windowMs, max) {
  const scoped = `${req.app.get('qm_app_id')}:${key}`;
  const now = Date.now();
  let arr = buckets.get(scoped);
  if (!arr) {
    arr = [];
    buckets.set(scoped, arr);
  }
  while (arr.length && now - arr[0] >= windowMs) arr.shift();
  if (arr.length >= max) return false;
  arr.push(now);
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] >= windowMs) buckets.delete(k);
    }
  }
  return true;
}

function blocked(res) {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'محاولات كثيرة جدًا، انتظر قليلًا ثم أعد المحاولة' },
  });
}

function rateLimit({ windowMs = 60000, max = 10, keyFn = (req) => req.ip || 'unknown' } = {}) {
  return (req, res, next) => {
    const key = `${keyFn(req)}`;
    const redis = req.app.get('qm_redis');
    if (redis && redis.safe) {
      const rk = `rl:${key}`;
      redis
        .safe('INCR', rk)
        .then((count) => {
          if (count === null) return memoryAllow(req, key, windowMs, max) ? next() : blocked(res);
          const first = Number(count) === 1;
          const p = first ? redis.safe('PEXPIRE', rk, String(windowMs)) : Promise.resolve(1);
          return p.then(() => (Number(count) > max ? blocked(res) : next()));
        })
        .catch(() => (memoryAllow(req, key, windowMs, max) ? next() : blocked(res)));
      return;
    }
    memoryAllow(req, key, windowMs, max) ? next() : blocked(res);
  };
}

module.exports = { rateLimit };

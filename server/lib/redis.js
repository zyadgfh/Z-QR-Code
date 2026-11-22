'use strict';

/**
 * عميل Upstash Redis REST — بدون اتصال دائم (مناسب لبيئات serverless).
 * يُرجع null إن لم تُضبط متغيرات البيئة فيبقى كل شيء على الوضع المحلي.
 * ARCH-02: حدود المعدل المشتركة + إبطال الجلسات الفوري عبر النسخ.
 */
function createRedis(env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  let degraded = false;

  async function cmd(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`redis_http_${res.status}`);
    const json = await res.json();
    if (json && json.error) throw new Error(String(json.error));
    return json ? json.result : null;
  }

  // غلاف آمن: عند تعطل Redis نُبلّغ مرة واحدة ونُرجع null (fail-open)
  async function safe(...args) {
    try {
      return await cmd(...args);
    } catch (e) {
      if (!degraded) {
        degraded = true;
        console.error('[redis] تعذر الوصول — تراجع للوضع المحلي:', e.message);
      }
      return null;
    }
  }

  return { cmd, safe, kind: 'upstash' };
}

module.exports = { createRedis };

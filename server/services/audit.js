'use strict';

const crypto = require('crypto');

/**
 * سجل تدقيق المحل (D8): الإجراءات الحساسة (إعدادات/موظفون/أسعار/فروع/أكواد
 * وأفعال المنصة على المحل) تُسجل خادميًا — عرض للمالك فقط عبر GET /api/shop/audit.
 * لا أسرار ولا توكنات — تفاصيل نصية قصيرة فقط.
 */

async function log(db, member, action, detail) {
  try {
    let email = (member && member.email) || null;
    const userId = (member && member.user_id) || null;
    if (!email && userId) {
      const u = await db.get('users', userId);
      email = u ? u.email : null;
    }
    const entry = {
      shop_id: (member && member.shop_id) || null,
      user_id: userId,
      email,
      role: (member && member.role) || null,
      action: String(action).slice(0, 60),
      detail: detail ? String(detail).slice(0, 300) : '',
      created_at: Date.now(),
    };
    await db.set('audit_log', 'aud_' + crypto.randomUUID(), entry);
  } catch {
    /* التدقيق لا يُسقط الإجراء الأصلي أبدًا */
  }
}

async function listForShop(db, shopId, limit = 100) {
  const rows = await db.query('audit_log', [{ field: 'shop_id', value: shopId }]);
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, Math.max(1, Math.min(200, limit)));
}

module.exports = { log, listForShop };

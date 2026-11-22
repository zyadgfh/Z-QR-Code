'use strict';

/**
 * واجهة إشعارات المالك الموحدة (NOTIF-01/02/04) — قنوات مستقلة تُفعَّل بمتغيرات
 * البيئة، وغياب أي قناة يعطلها بصمت دون التأثير على الباقي:
 * - Web Push (VAPID): اشتراكات لكل جهاز في push_subscriptions.
 * - Telegram: بوت — الربط عبر /start {slug} في ويب هوك.
 * - WhatsApp Cloud API: يُرسل لرقم المحل المسجل (shop.phone بصيغة دولية).
 */
function createNotifier(env, db) {
  const telegramToken = env.TELEGRAM_BOT_TOKEN || '';
  const waToken = env.WHATSAPP_TOKEN || '';
  const waPhoneId = env.WHATSAPP_PHONE_ID || '';
  let vapid = null;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    try {
      const webpush = require('web-push');
      webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:support@qrmenu.app', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      vapid = webpush;
    } catch (e) {
      console.error('[notifier] web-push غير متاح:', e.message);
    }
  }

  function orderText(shop, order) {
    return `🔔 ${shop.name}: طلب جديد #${String(order.id).slice(-4)} — طاولة ${order.table_number} — ${order.total} ج.م`;
  }

  async function sendTelegram(chatId, text) {
    if (!telegramToken || !chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (e) {
      console.error('[notifier] telegram:', e.message);
    }
  }

  async function sendWhatsapp(to, text) {
    if (!waToken || !waPhoneId || !to) return;
    try {
      await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${waToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
      });
    } catch (e) {
      console.error('[notifier] whatsapp:', e.message);
    }
  }

  async function sendPush(shopId, payload) {
    if (!vapid) return;
    let subs = [];
    try {
      subs = await db.query('push_subscriptions', [{ field: 'shop_id', value: shopId }]);
    } catch {
      return;
    }
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await vapid.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
        } catch (e) {
          // اشتراك ميت (404/410) → تنظيف
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            db.delete('push_subscriptions', sub.id).catch(() => {});
          }
        }
      })
    );
  }

  /** إشعار «طلب جديد» لكل القنوات المتاحة — fire and forget */
  async function orderCreated(shop, order) {
    const text = orderText(shop, order);
    await Promise.allSettled([
      sendTelegram(shop.notify_telegram_chat_id, text),
      sendWhatsapp(shop.phone, text),
      sendPush(shop.id, { title: shop.name, body: text, tag: `order:${order.id}`, url: '/dash' }),
    ]);
  }

  return {
    orderCreated,
    sendTelegram,
    pushEnabled: !!vapid,
    publicKey: env.VAPID_PUBLIC_KEY || null,
  };
}

module.exports = { createNotifier };

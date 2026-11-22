'use strict';

/**
 * مُرسل البريد (NOTIF-03): واجهة موحدة فوق مزودين.
 * - console (افتراضي): يطبع الرسالة في السجل — للتطوير والاختبار.
 * - resend: RESEND_API_KEY + MAIL_FROM → api.resend.com (خادمي حصريًا).
 * الفشل لا يُسقط الاستجابة أبدًا — يُسجل فقط.
 */
function createMailer(env) {
  const provider = env.RESEND_API_KEY && env.MAIL_FROM ? 'resend' : 'console';

  async function send({ to, subject, text, html }) {
    try {
      if (provider === 'resend') {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
            signal: ctl.signal,
          });
          if (!res.ok) console.error('[mailer] resend', res.status, (await res.text()).slice(0, 200));
        } finally {
          clearTimeout(t);
        }
      } else {
        console.log('[mail:console]', JSON.stringify({ to, subject, text }));
      }
      return { ok: true, provider };
    } catch (e) {
      console.error('[mailer] فشل الإرسال:', e.message);
      return { ok: false, provider };
    }
  }

  return { send, provider };
}

module.exports = { createMailer };

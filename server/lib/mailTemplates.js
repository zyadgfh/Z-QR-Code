'use strict';

/**
 * قوالب البريد المعاملاتي (NOTIF-03) — عربي RTL بأسلوب بسيط نظيف.
 * كل قالب يُرجع {subject, text, html}.
 */

const BRAND = '#0f766e';

function rtlWrap(title, bodyHtml, footer) {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,'Segoe UI',Tahoma,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
<div style="font-size:22px;font-weight:800;color:${BRAND};margin-bottom:16px">▦ QR Menu</div>
<h2 style="font-size:18px;color:#1c1917;margin:0 0 14px">${title}</h2>
<div style="font-size:14px;line-height:1.9;color:#44403c">${bodyHtml}</div>
<p style="font-size:11px;color:#a8a29e;margin-top:24px;border-top:1px solid #e7e5e4;padding-top:12px">${footer}</p>
</div></body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

function passwordResetCode(name, code, minutes = 10) {
  const who = esc(name) || 'أهلًا';
  const title = 'رمز إعادة تعيين كلمة المرور';
  const body = `
<p>${who}،</p>
<p>استخدم هذا الرمز لإعادة تعيين كلمة المرور:</p>
<p style="font-size:30px;font-weight:900;letter-spacing:6px;color:${BRAND};direction:ltr;text-align:center;margin:18px 0">${esc(code)}</p>
<p>الرمز صالح لمدة <b>${minutes} دقائق</b>. لو لم تطلب هذا الرمز فتجاهل الرسالة — كلمة المرور الحالية لن تتغير.</p>`;
  const text = `رمز إعادة تعيين كلمة المرور: ${code} — صالح ${minutes} دقائق. لو لم تطلبه فتجاهل هذه الرسالة.`;
  return { subject: title, text, html: rtlWrap(title, body, 'رسالة آلية من QR Menu — لا تُجب عليها') };
}

function passwordChanged(name) {
  const title = 'تم تغيير كلمة المرور';
  const body = `<p>${esc(name) || 'أهلًا'}،</p><p>تم تغيير كلمة المرور الخاصة بحسابك للتو، وأُغلقت كل الجلسات النشطة على الأجهزة الأخرى.</p>
<p style="color:#b91c1c;font-weight:700">لو لم تكن أنت من فعل ذلك، أعد تعيين كلمة المرور فورًا من صفحة تسجيل الدخول.</p>`;
  return {
    subject: title,
    text: 'تم تغيير كلمة المرور الخاصة بحسابك. لو لم تكن أنت، أعد تعيينها فورًا.',
    html: rtlWrap(title, body, 'إشعار أمني آلي — QR Menu'),
  };
}

function mfaEnabled(name) {
  const title = 'تم تفعيل التحقق بخطوتين';
  const body = `<p>${esc(name) || 'أهلًا'}،</p><p>تم تفعيل التحقق بخطوتين (TOTP) على حسابك. احفظ أكواد الاسترداد في مكان آمن — يُعرض كل كود مرة واحدة فقط.</p>`;
  return { subject: title, text: 'تم تفعيل التحقق بخطوتين على حسابك.', html: rtlWrap(title, body, 'إشعار أمني آلي — QR Menu') };
}

function mfaDisabled(name) {
  const title = 'تم إيقاف التحقق بخطوتين';
  const body = `<p>${esc(name) || 'أهلًا'}،</p><p>تم إيقاف التحقق بخطوتين على حسابك، وأُغلقت كل الجلسات النشطة.</p>
<p style="color:#b91c1c;font-weight:700">لو لم تكن أنت من فعل ذلك، غيّر كلمة المرور فورًا وأعد تفعيل التحقق.</p>`;
  return { subject: title, text: 'تم إيقاف التحقق بخطوتين على حسابك.', html: rtlWrap(title, body, 'إشعار أمني آلي — QR Menu') };
}

function recoveryLow(name, remaining) {
  const title = 'أكواد الاسترداد على وشك النفاد';
  const body = `<p>${esc(name) || 'أهلًا'}،</p><p>بقي لديك <b>${remaining}</b> أكواد استرداد فقط. ننصح بتوليد مجموعة جديدة من إعدادات الأمان في اللوحة.</p>`;
  return { subject: title, text: `بقيت ${remaining} أكواد استرداد فقط — ولّد مجموعة جديدة.`, html: rtlWrap(title, body, 'إشعار أمني آلي — QR Menu') };
}

module.exports = { passwordResetCode, passwordChanged, mfaEnabled, mfaDisabled, recoveryLow };

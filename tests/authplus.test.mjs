import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER, NILE_STAFF } from './helpers.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const totp = require('../server/lib/totp');

/** يلتقط سطور console.log أثناء نداء لاستخراج كود الاستعادة من مزود console */
async function withCapturedLog(fn, re = /الرمز غير صحيح|رمز إعادة تعيين كلمة المرور: (\d{6})/) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = orig;
  }
}

function codeFrom(lines) {
  for (const l of lines) {
    const m = l.match(/\d{6}/);
    if (m && /رمز إعادة تعيين/.test(l)) return m[0];
  }
  return null;
}

function totpNow(secret) {
  return totp.totpCodeAtStep(totp.base32Decode(secret), Math.floor(Date.now() / 30000));
}

test('TOTP: متجه RFC 6238 المعروف يتحقق', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(totp.verifyTotp(secret, '287082', { now: 59000 }), true);
  assert.equal(totp.verifyTotp(secret, '287081', { now: 59000 }), false);
  assert.equal(totp.verifyTotp(secret, '94287082', { now: 59000 }), false); // 8 خانات مرفوضة
});

test('استعادة كلمة المرور: رد موحد بدون تعداد حسابات + رمز يصل بالبريد', async () => {
  const { base, db } = await startServer();
  const ghost = await api(base, '/api/auth/request-reset', { method: 'POST', body: { email: 'ghost@nowhere.io' } });
  assert.equal(ghost.status, 200);
  assert.equal(ghost.json.ok, true);

  const { result, lines } = await withCapturedLog(() =>
    api(base, '/api/auth/request-reset', { method: 'POST', body: { email: NILE_OWNER.email } })
  );
  assert.equal(result.json.ok, true);
  assert.deepEqual(Object.keys(result.json), Object.keys(ghost.json)); // نفس الرد تمامًا
  assert.ok(codeFrom(lines), 'الكود ظهر في سجل مزود console');
  const row = await db.get('reset_codes', 'user_owner_nile');
  assert.ok(row && row.code_hash && !row.code_hash.includes(codeFrom(lines)), 'الكود مخزن مجزأً فقط');
});

test('استعادة كلمة المرور: رمز خاطئ 5 مرات يقفل، ثم رمز جديد يعيد الدخول ويبطل الجلسات القديمة', async () => {
  const { base, db } = await startServer();
  // جلسة قديمة قبل الإعادة
  const old = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(old.status, 200);

  const { lines } = await withCapturedLog(() =>
    api(base, '/api/auth/request-reset', { method: 'POST', body: { email: NILE_OWNER.email } })
  );
  const code = codeFrom(lines);
  assert.ok(code);

  // 5 محاولات خاطئة
  for (let i = 0; i < 5; i++) {
    const r = await api(base, '/api/auth/reset-password', {
      method: 'POST',
      body: { email: NILE_OWNER.email, code: '000000', new_password: 'newpass123' },
    });
    assert.equal(r.status, 400);
  }
  // الرمز الصحيح بعد القفل يُرفض أيضًا
  const locked = await api(base, '/api/auth/reset-password', {
    method: 'POST',
    body: { email: NILE_OWNER.email, code, new_password: 'newpass123' },
  });
  assert.equal(locked.status, 400);
  assert.equal(locked.json.error.code, 'BAD_RESET');
  assert.equal(await db.get('reset_codes', 'user_owner_nile'), null);

  // رمز جديد ينجح
  const { lines: l2 } = await withCapturedLog(() =>
    api(base, '/api/auth/request-reset', { method: 'POST', body: { email: NILE_OWNER.email } })
  );
  const code2 = codeFrom(l2);
  const weak = await api(base, '/api/auth/reset-password', {
    method: 'POST',
    body: { email: NILE_OWNER.email, code: code2, new_password: '123' },
  });
  assert.equal(weak.json.error.code, 'WEAK_PASSWORD');
  const good = await api(base, '/api/auth/reset-password', {
    method: 'POST',
    body: { email: NILE_OWNER.email, code: code2, new_password: 'newpass123' },
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.ok, true);

  // الجلسة القديمة بطلت + الدخول بالقديم فشل والجديد نجح
  const stale = await api(base, '/api/auth/me', { token: old.json.token });
  assert.equal(stale.status, 401);
  assert.equal(stale.json.error.code, 'SESSION_INVALIDATED');
  const oldPw = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(oldPw.status, 401);
  const newPw = await api(base, '/api/auth/login', {
    method: 'POST',
    body: { email: NILE_OWNER.email, password: 'newpass123' },
  });
  assert.equal(newPw.status, 200);
});

test('الجلسات: قائمة أجهزة + إبطال فردي + خروج الكل مع بقاء الحالية', async () => {
  const { base } = await startServer();
  const t1 = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  const t2 = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  const me2 = await api(base, '/api/auth/me', { token: t2.json.token });
  assert.equal(me2.status, 200);

  const list = await api(base, '/api/auth/sessions', { token: t1.json.token });
  assert.equal(list.status, 200);
  assert.equal(list.json.sessions.length, 2);
  assert.equal(list.json.sessions.filter((s) => s.current).length, 1);

  const other = list.json.sessions.find((s) => !s.current);
  const rev = await api(base, `/api/auth/sessions/${other.id}`, { method: 'DELETE', token: t1.json.token });
  assert.equal(rev.status, 200);
  const after = await api(base, '/api/auth/me', { token: t2.json.token });
  assert.equal(after.status, 401);
  assert.equal(after.json.error.code, 'SESSION_INVALIDATED');

  const logoutAll = await api(base, '/api/auth/logout-all', { method: 'POST', token: t1.json.token });
  assert.equal(logoutAll.status, 200);
  const me1 = await api(base, '/api/auth/me', { token: t1.json.token });
  assert.equal(me1.status, 200); // الحالية بقيت
  const list2 = await api(base, '/api/auth/sessions', { token: t1.json.token });
  assert.equal(list2.json.sessions.length, 1);
});

test('تغيير كلمة المرور: يبطل كل التوكنات القديمة ويعيد توكنًا صالحًا', async () => {
  const { base } = await startServer();
  const login = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  const change = await api(base, '/api/auth/password', {
    method: 'PUT',
    token: login.json.token,
    body: { current_password: NILE_OWNER.password, new_password: 'changed123' },
  });
  assert.equal(change.status, 200);
  assert.ok(change.json.token, 'توكن جديد يعود مع الرد');

  const oldToken = await api(base, '/api/auth/me', { token: login.json.token });
  assert.equal(oldToken.status, 401);
  assert.equal(oldToken.json.error.code, 'SESSION_INVALIDATED');
  const newToken = await api(base, '/api/auth/me', { token: change.json.token });
  assert.equal(newToken.status, 200);
  const relogin = await api(base, '/api/auth/login', {
    method: 'POST',
    body: { email: NILE_OWNER.email, password: 'changed123' },
  });
  assert.equal(relogin.status, 200);
});

test('الخروج يبطّل الجلسة الحالية على الخادم', async () => {
  const { base } = await startServer();
  const login = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  const out = await api(base, '/api/auth/logout', { method: 'POST', token: login.json.token });
  assert.equal(out.status, 200);
  const me = await api(base, '/api/auth/me', { token: login.json.token });
  assert.equal(me.status, 401);
});

test('2FA مفروضة: البوابة تمنع مسارات المحل حتى إكمال الإعداد + تدفق كامل حتى الاسترداد', async () => {
  const { base } = await startServer({ env: { MFA_ENFORCED: '1' } });

  const login = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.mfa_enforced, true);

  // مسارات المحل ممنوعة قبل الإعداد
  const blocked = await api(base, '/api/shop/summary', { token: login.json.token });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, 'MFA_REQUIRED');

  // لكن مسارات الإعداد مفتوحة
  const me = await api(base, '/api/auth/me', { token: login.json.token });
  assert.equal(me.status, 200);

  const setup = await api(base, '/api/auth/2fa/setup', { method: 'POST', token: login.json.token });
  assert.equal(setup.status, 200);
  assert.ok(setup.json.secret && setup.json.otpauth.startsWith('otpauth://totp/'));

  const badCode = await api(base, '/api/auth/2fa/verify', {
    method: 'POST',
    token: login.json.token,
    body: { code: '000000' },
  });
  assert.equal(badCode.status, 400);

  const verify = await api(base, '/api/auth/2fa/verify', {
    method: 'POST',
    token: login.json.token,
    body: { code: totpNow(setup.json.secret) },
  });
  assert.equal(verify.status, 200);
  assert.equal(verify.json.recovery_codes.length, 8);
  assert.ok(verify.json.token);

  // توكن ما قبل التفعيل بطل (رفع token_version)
  const stale = await api(base, '/api/auth/me', { token: login.json.token });
  assert.equal(stale.status, 401);

  // مسارات المحل تعمل الآن
  const ok = await api(base, '/api/shop/summary', { token: verify.json.token });
  assert.equal(ok.status, 200);

  // دخول جديد → تحدٍّ ثانٍ
  const relogin = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(relogin.json.mfa_required, true);
  assert.ok(relogin.json.mfa_token);

  const wrong = await api(base, '/api/auth/2fa/challenge', {
    method: 'POST',
    token: relogin.json.mfa_token,
    body: { code: '000000' },
  });
  assert.equal(wrong.status, 401);

  // كود استرداد يُستخدم مرة واحدة
  const rec = verify.json.recovery_codes[0];
  const viaRec = await api(base, '/api/auth/2fa/challenge', {
    method: 'POST',
    token: relogin.json.mfa_token,
    body: { code: rec },
  });
  assert.equal(viaRec.status, 200);
  assert.equal(viaRec.json.used_recovery, true);
  assert.equal(viaRec.json.recovery_left, 7);

  const relogin2 = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  const reuse = await api(base, '/api/auth/2fa/challenge', {
    method: 'POST',
    token: relogin2.json.mfa_token,
    body: { code: rec },
  });
  assert.equal(reuse.status, 401);

  // تحدٍّ صحيح بكود TOTP الحالي (السر المخزن = سر الإ-setup الأصلي بعد التفعيل)
  const setup2 = await api(base, '/api/auth/2fa/setup', { method: 'POST', token: viaRec.json.token });
  assert.equal(setup2.status, 400); // مفعّل بالفعل
  const goodChallenge = await api(base, '/api/auth/2fa/challenge', {
    method: 'POST',
    token: relogin2.json.mfa_token,
    body: { code: totpNow(setup.json.secret) },
  });
  assert.equal(goodChallenge.status, 200);
});

test('2FA: الموظف غير مُلزَم والمسارات تعمل بلا بوابة', async () => {
  const { base } = await startServer({ env: { MFA_ENFORCED: '1' } });
  const login = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  assert.equal(login.status, 200);
  const summary = await api(base, '/api/shop/summary', { token: login.json.token });
  assert.equal(summary.status, 200);
});

test('البريد: قوالب الاستعادة والأمان تحمل المحتوى المطلوب', async () => {
  const t = require('../server/lib/mailTemplates');
  const reset = t.passwordResetCode('زياد', '123456', 10);
  assert.ok(reset.html.includes('123456') && reset.html.includes('10 دقائق'));
  assert.ok(reset.html.includes('dir="rtl"'));
  const changed = t.passwordChanged('زياد');
  assert.ok(changed.subject && changed.html.includes('كلمة المرور'));
});

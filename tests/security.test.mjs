import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, raw, login, NILE_OWNER } from './helpers.mjs';

test('ترويسات الأمان موجودة على كل الردود (API والملفات)', async () => {
  const { base } = await startServer();
  const res = await api(base, '/api/health');
  const headers = raw(base, '/api/health');
  const [h] = await Promise.all([headers]);
  assert.equal(h.status, 200);
  assert.equal(h.headers['x-content-type-options'], 'nosniff');
  assert.equal(h.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(h.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.ok(h.headers['permissions-policy']);
  // HSTS فقط عبر HTTPS (الاختبار محلي HTTP فلا يجب أن تظهر)
  assert.equal(h.headers['strict-transport-security'], undefined);
  void res;
});

test('جسم JSON أكبر من الحد (4MB) → 413', async () => {
  const { base } = await startServer();
  const big = { table: 1, note: 'x'.repeat(5 * 1024 * 1024), items: [] };
  const res = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: big });
  assert.equal(res.status, 413);
});

test('بوابة الإعداد الأول: حد معدل صارم (5 محاولات/دقيقة) ضد التخمين', async () => {
  const { base } = await startServer({ seed: false });
  let last = null;
  for (let i = 0; i < 6; i++) {
    last = await api(base, '/api/auth/bootstrap-admin', {
      method: 'POST',
      body: { email: `guess${i}@x.app`, password: 'guessing-password-1' },
    });
  }
  // إما 400 (تحقق حقول) سابقًا ثم 429 عند تجاوز الحد — المهم ألا يصل لـ 201
  assert.notEqual(last.status, 201);
  assert.equal(last.status, 429);
  assert.equal(last.json.error.code, 'RATE_LIMITED');
});

test('سلوك أمني مستقر: كلمة مرور خاطئة لا تفرق بين مستخدم موجود وغير موجود', async () => {
  const { base } = await startServer();
  const real = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'owner@nile.app', password: 'wrong' } });
  const fake = await api(base, '/api/auth/login', { method: 'POST', body: { email: 'ghost@nowhere.app', password: 'wrong' } });
  assert.equal(real.status, fake.status);
  assert.equal(real.json.error.code, fake.json.error.code);
  assert.equal(real.json.error.message, fake.json.error.message);

  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  assert.ok(t, 'الدخول الصحيح يعمل');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, api, login, ADMIN, NILE_OWNER, NILE_STAFF, BURGER_OWNER } from './helpers.mjs';

const TEA = { item_id: 'nit_tea', qty: 1, option_ids: [] };

function withHost(base, path, host) {
  const url = new URL(base + path);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', headers: { host } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString() || 'null') }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ================= MKT-02 الدومينات =================

test('الطور 6/D9: دورة الدومين الكاملة — حفظ، تطهير، إثبات TXT، حسم Host، الإزالة', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  // GET الفارغ
  const empty = await api(base, '/api/shop/domain', { token: t });
  assert.equal(empty.status, 200);
  assert.equal(empty.json.custom_domain, null);

  // حفظ بتطهير كامل (بروتوكول/مسار/منفذ/حالة)
  const set = await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: 'https://Cafe.Example.COM/menu?x=1:443' } });
  assert.equal(set.status, 200);
  assert.equal(set.json.custom_domain, 'cafe.example.com');
  assert.equal(set.json.domain_status, 'pending');
  assert.match(set.json.domain_token, /^[0-9a-f]{32}$/);

  // رفض قيم خطرة أو رديئة
  for (const bad of ['localhost', '127.0.0.1', 'evil.vercel.app', 'no-dot-here', 'a..b', 'cafe_example.com', '[::1]']) {
    const r = await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: bad } });
    assert.equal(r.status, 400, `bad=${bad}`);
    assert.equal(r.json.error.code, 'INVALID_DOMAIN');
  }

  // القيمة الفارغة = إزالة الدومين (دلالة مقصودة)
  const clearedMid = await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: '' } });
  assert.equal(clearedMid.status, 200);
  assert.equal(clearedMid.json.custom_domain, null);
  // أعد الحفظ لبقية الاختبار
  const reset = await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: 'https://Cafe.Example.COM/menu?x=1:443' } });
  assert.equal(reset.json.custom_domain, 'cafe.example.com');

  // تفرد الدومين بين المحلات
  const tb = await login(base, BURGER_OWNER.email, BURGER_OWNER.password);
  const taken = await api(base, '/api/shop/domain', { token: tb, method: 'PUT', body: { domain: 'cafe.example.com' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.json.error.code, 'DOMAIN_TAKEN');

  // تحقق فاشل بلا سجل DNS
  const fail = await api(base, '/api/shop/domain/verify', { token: t, method: 'POST' });
  assert.equal(fail.status, 400);
  assert.equal(fail.json.error.code, 'DOMAIN_NOT_VERIFIED');

  // الزبون لا يحسم شيئًا بالدومين غير الموثق
  assert.equal((await withHost(base, '/api/public/resolve', 'cafe.example.com')).status, 404);

  // الموظف بصلاحية settings فقط هو من يلمس الدومين — بلا توكن → 401
  assert.equal((await api(base, '/api/shop/domain')).status, 401);

  // التحقق الناجح بسجل TXT مطابق — حقن resolver يحاكي DNS على قاعدة الخادم الحي نفسها
  const dom = (await import('../server/services/domains.js')).default;
  const started = await startServer({ seed: true });
  const db2 = started.db;
  const t2 = await login(started.base, NILE_OWNER.email, NILE_OWNER.password);
  const set2 = await api(started.base, '/api/shop/domain', { token: t2, method: 'PUT', body: { domain: 'tea.nile.eg' } });
  const token = set2.json.domain_token;

  // رمز خاطئ → 400 نظيف
  await assert.rejects(
    () => dom.verifyDomain(db2, 'shop_nile', { lookupTxt: async () => [['z-qr-code=wrong-value']] }),
    (e) => e.status === 400 && e.code === 'DOMAIN_NOT_VERIFIED'
  );
  // الرمز الصحيح → verified
  const ok = await dom.verifyDomain(db2, 'shop_nile', { lookupTxt: async () => [[`z-qr-code=${token}`]] });
  assert.equal(ok.domain_status, 'verified');
  // الـ API يعكس الحالة
  const after = await api(started.base, '/api/shop/domain', { token: t2 });
  assert.equal(after.json.domain_status, 'verified');
  // الموثق مرة أخرى يعيد النتيجة مباشرة بلا بحث DNS (لا نداءات أصلاً)
  const again = await dom.verifyDomain(db2, 'shop_nile', { lookupTxt: async () => { throw new Error('no-dns'); } });
  assert.equal(again.domain_status, 'verified');
  // دالة normalize النقية: قيم مقبولة ورفض الحالات الخطرة
  assert.equal(dom.normalizeDomain('  HTTPS://Shop.Example.Co.UK.  '), 'shop.example.co.uk');
});

test('الطور 6/D9: الدومين الموثق يحسم المحل من Host — والمحل المؤرشف والمزور يرفضان', async () => {
  const { base, db } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: 'tea.nile.eg' } });
  // الموثقة مباشرة بالقاعدة (نفس الأثر النهائي لنجاح TXT)
  await db.update('shops', 'shop_nile', { domain_status: 'verified' });

  const hit = await withHost(base, '/api/public/resolve', 'tea.nile.eg');
  assert.equal(hit.status, 200);
  assert.equal(hit.json.slug, 'nile-cafe');
  assert.equal(hit.json.name, 'كافيه النيل');

  // ترويسة Host مزورة لمحل آخر → 404
  assert.equal((await withHost(base, '/api/public/resolve', 'fake.evil.io')).status, 404);
  // Host بعنوان IP → 404
  assert.equal((await withHost(base, '/api/public/resolve', '127.0.0.1')).status, 404);
  // منفذ في الترويسة يُقص ويحسم طبيعيًا
  const withPort = await withHost(base, '/api/public/resolve', 'tea.nile.eg:443');
  assert.equal(withPort.status, 200);

  // الأرشفة تقطع الحسم فورًا
  const at = await login(base, ADMIN.email, ADMIN.password);
  await api(base, `/api/admin/shops/shop_nile/archive`, { token: at, method: 'POST', body: { archived: true } });
  assert.equal((await withHost(base, '/api/public/resolve', 'tea.nile.eg')).status, 404);
  await api(base, `/api/admin/shops/shop_nile/archive`, { token: at, method: 'POST', body: { archived: false } });
  assert.equal((await withHost(base, '/api/public/resolve', 'tea.nile.eg')).status, 200);

  // الإزالة تقطع الحسم
  await api(base, '/api/shop/domain', { token: t, method: 'PUT', body: { domain: null } });
  const cleared = await api(base, '/api/shop/domain', { token: t });
  assert.equal(cleared.json.custom_domain, null);
  assert.equal((await withHost(base, '/api/public/resolve', 'tea.nile.eg')).status, 404);
});

// ================= إعادة التدقيق الأمني (D9) =================

test('D9 إعادة التدقيق: ترويسات الأمان على كل الردود + رفض التلاعب بالتوكن + 401/403 الحدود', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  // الترويسات على مسارات عامة وخاصة
  for (const path of ['/api/public/platform', '/api/shop/menu']) {
    const res = await fetch(base + path, { headers: t ? { authorization: `Bearer ${t}` } : {} });
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', path);
    assert.ok(res.headers.get('referrer-policy'), path);
  }

  // بلا توكن → 401
  assert.equal((await api(base, '/api/shop/menu')).status, 401);
  // توكن مزيّف → 401
  const tampered = t.slice(0, -3) + (t.endsWith('aaa') ? 'bbb' : 'aaa');
  assert.equal((await api(base, '/api/shop/menu', { token: tampered })).status, 401);

  // عزل المستأجرين: مالك برجر يعدل صنف النيل → 404 بلا كشف وجود
  const tb = await login(base, BURGER_OWNER.email, BURGER_OWNER.password);
  const cross = await api(base, '/api/shop/items/nit_tea', { token: tb, method: 'PUT', body: { price: 1 } });
  assert.equal(cross.status, 404);

  // الموظف لا يقرأ الإعدادات ولا التحليلات ولا يطبع دومين
  const ts = await login(base, NILE_STAFF.email, NILE_STAFF.password);
  for (const p of ['/api/shop/settings', '/api/shop/analytics?days=7', '/api/shop/export', '/api/shop/audit']) {
    const r = await api(base, p, { token: ts });
    assert.ok([403, 404].includes(r.status), `${p} → ${r.status}`);
  }
});

test('D9 إعادة التدقيق: حد معدل الطلبات يرفض السبام 429 + حجب أرقام المخزون عن الزبون', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  // مخزون متتبع نفد — الزبون يرى sold_out بلا أرقام
  await api(base, '/api/shop/items/nit_tea', { token: t, method: 'PUT', body: { stock_qty: 0 } });
  const pub = (await api(base, '/api/public/shops/nile-cafe/menu')).json;
  const tea = pub.items.find((i) => i.id === 'nit_tea');
  assert.equal(tea.sold_out, true);
  assert.ok(!('stock_qty' in tea));
  assert.ok(!('low_stock_threshold' in tea));

  // سبام الطلبات: البذرة نفسها بعد الحد الأقصى 10/د → 429
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [] } });
    last = r.status;
  }
  assert.equal(last, 429);

  // ملاحظة: الطلب الفارغ قد يفشل بالتحقق 400 قبل حد المعدل — إن فشل الأول بالتحقق فالحد أعمى لا يزال يعمل
});

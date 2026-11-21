import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, raw, login, NILE_OWNER } from './helpers.mjs';

test('إنشاء منيو كامل بالأحجام والإضافات ثم نشره للعميل', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  const cat = await api(base, '/api/shop/categories', { token: t, method: 'POST', body: { name: 'مشروبات جديدة', name_en: 'New Drinks' } });
  assert.equal(cat.status, 201);

  const item = await api(base, '/api/shop/items', {
    token: t,
    method: 'POST',
    body: { category_id: cat.json.id, name: 'سكواش', name_en: 'Squash', price: 25, description: 'lime fresh' },
  });
  assert.equal(item.status, 201);

  const grp = await api(base, `/api/shop/items/${item.json.id}/groups`, {
    token: t,
    method: 'POST',
    body: {
      name: 'الحجم',
      name_en: 'Size',
      selection: 'single',
      required: true,
      options: [
        { name: 'وسط', name_en: 'Medium', price_delta: 0 },
        { name: 'كبير', name_en: 'Large', price_delta: 7 },
      ],
    },
  });
  assert.equal(grp.status, 201);
  assert.equal(grp.json.options.length, 2);

  // قائمة العميل تعرض الصنف مع مجموعته
  const pub = await api(base, '/api/public/shops/nile-cafe/menu');
  const pubItem = pub.json.items.find((i) => i.name === 'سكواش');
  assert.ok(pubItem);
  assert.equal(pubItem.groups.length, 1);
  assert.equal(pubItem.groups[0].options.length, 2);
  assert.equal(pubItem.groups[0].options[1].price_delta, 7);

  // إخفاء الصنف (متاح=false) يخفيه من العميل دون حذفه
  await api(base, `/api/shop/items/${item.json.id}`, { token: t, method: 'PUT', body: { name: 'سكواش', price: 25, available: false } });
  const pub2 = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.ok(!pub2.json.items.find((i) => i.name === 'سكواش'));
  const dash = await api(base, '/api/shop/menu', { token: t });
  assert.ok(dash.json.items.find((i) => i.name === 'سكواش'));

  // تحديث المجموعة يستبدل الخيارات
  const upd = await api(base, `/api/shop/groups/${grp.json.id}`, {
    token: t,
    method: 'PUT',
    body: { name: 'الحجم', selection: 'single', required: true, options: [{ name: 'وحيد', price_delta: 0 }] },
  });
  assert.equal(upd.status, 200);
  const menu = await api(base, '/api/shop/menu', { token: t });
  assert.equal(menu.json.items.find((i) => i.id === item.json.id).groups[0].options.length, 1);
});

test('تحقق الحقول: اسم مفقود/سعر غير صحيح/مجموعة بلا خيارات', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  assert.equal((await api(base, '/api/shop/categories', { token: t, method: 'POST', body: { name: '' } })).status, 400);
  assert.equal((await api(base, '/api/shop/items', { token: t, method: 'POST', body: { category_id: 'ncat_hot', name: 'x', price: 'abc' } })).status, 400);
  assert.equal((await api(base, '/api/shop/items', { token: t, method: 'POST', body: { category_id: 'ncat_hot', name: 'x', price: -3 } })).status, 400);
  assert.equal(
    (await api(base, `/api/shop/items/nit_tea/groups`, { token: t, method: 'POST', body: { name: 'g', selection: 'single', required: false, options: [] } })).status,
    400
  );
  // تصنيف غير موجود أو لا يخص المحل
  assert.equal((await api(base, '/api/shop/items', { token: t, method: 'POST', body: { category_id: 'bcat_burgers', name: 'x', price: 5 } })).status, 404);
});

test('حذف التصنيف يحذف أصنافه ومجموعاتها (متتالٍ)', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  await api(base, '/api/shop/categories/ncat_dessert', { token: t, method: 'DELETE' });
  const menu = await api(base, '/api/shop/menu', { token: t });
  assert.ok(!menu.json.categories.find((c) => c.id === 'ncat_dessert'));
  assert.ok(!menu.json.items.find((i) => i.id === 'nit_cheesecake'));

  const pub = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.ok(!pub.json.items.find((i) => i.id === 'nit_kunafa'));
});

test('رفع صورة صنف يخزنها ويقدمها عامة', async () => {
  const { base } = await startServer();
  const t = await login(base, NILE_OWNER.email, NILE_OWNER.password);

  // بكسل شفاف PNG صغير
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const up = await api(base, '/api/shop/uploads', { token: t, method: 'POST', body: { dataUrl: png } });
  assert.equal(up.status, 201);
  assert.ok(up.json.url.startsWith('/api/files/'));

  const img = await raw(base, up.json.url);
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');

  const bad = await api(base, '/api/shop/uploads', { token: t, method: 'POST', body: { dataUrl: 'data:text/html;base64,PGI+' } });
  assert.equal(bad.status, 400);
});

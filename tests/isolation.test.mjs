import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, login, NILE_OWNER, NILE_STAFF, BURGER_OWNER } from './helpers.mjs';

test('عزل المستأجرين: لا قراءة ولا كتابة بين المحلات', async () => {
  const { base } = await startServer();
  const nileT = await login(base, NILE_OWNER.email, NILE_OWNER.password);
  const burgerT = await login(base, BURGER_OWNER.email, BURGER_OWNER.password);

  // قراءة المنيو تُرجع بيانات المحل فقط
  const menu = await api(base, '/api/shop/menu', { token: nileT });
  assert.equal(menu.status, 200);
  const ids = new Set(menu.json.items.map((i) => i.id));
  assert.ok(ids.has('nit_latte'));
  assert.ok(!ids.has('bit_classic'));

  // كتابة على مستندات محل آخر → 404 (بدون كشف وجودها)
  assert.equal((await api(base, '/api/shop/items/bit_classic', { token: nileT, method: 'PUT', body: { name: 'هاجم', price: 1 } })).status, 404);
  assert.equal((await api(base, '/api/shop/items/bit_classic', { token: nileT, method: 'DELETE' })).status, 404);
  assert.equal((await api(base, '/api/shop/categories/bcat_burgers', { token: nileT, method: 'DELETE' })).status, 404);
  assert.equal((await api(base, '/api/shop/items/bit_classic/groups', { token: nileT, method: 'POST', body: { name: 'g', options: [{ name: 'o' }] } })).status, 404);
  assert.equal((await api(base, '/api/shop/groups/bgrp_classic_x', { token: nileT, method: 'PUT', body: { name: 'g', options: [{ name: 'o' }] } })).status, 404);

  // مالك برجر لا يرى طلبات الكافيه
  const burgerOrders = await api(base, '/api/shop/orders', { token: burgerT });
  assert.equal(burgerOrders.status, 200);
  assert.deepEqual(burgerOrders.json, []);

  // وقبول طلب الكافيه بلهجة صاحب البرجر مستحيل
  assert.equal((await api(base, '/api/shop/orders/ord_demo_1/accept', { token: burgerT, method: 'POST', body: { eta_minutes: 10 } })).status, 404);
});

test('الموظف يرى طلبات محله فقط ويستطيع قبولها لكن ليس أكثر', async () => {
  const { base } = await startServer();
  const staffT = await login(base, NILE_STAFF.email, NILE_STAFF.password);

  const orders = await api(base, '/api/shop/orders', { token: staffT });
  assert.equal(orders.status, 200);
  assert.equal(orders.json.length, 4); // طلبات الديمو الأربعة لنيل فقط
  for (const o of orders.json) assert.equal(o.shop_id, 'shop_nile');

  const acc = await api(base, '/api/shop/orders/ord_demo_1/accept', { token: staffT, method: 'POST', body: { eta_minutes: 12 } });
  assert.equal(acc.status, 200);
  assert.equal(acc.json.status, 'preparing');

  // الموظف لا يعدل إعدادات المحل
  assert.equal((await api(base, '/api/shop/settings', { token: staffT, method: 'PUT', body: { name: 'x' } })).status, 403);
});

test('طلب عبر أصناف محل آخر مرفوض', async () => {
  const { base } = await startServer();
  const res = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { table: 1, items: [{ item_id: 'bit_classic', qty: 1, option_ids: [] }] },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, 'INVALID_ITEM');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.mjs';

test('تحديد المعدل: أكثر من 10 طلبات/دقيقة من نفس المصدر → 429', async () => {
  const { base } = await startServer();
  const body = { table: 1, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] };

  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body });
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.error.code, 'RATE_LIMITED');

  // القيود لا تمنع قراءة الحالة العامة
  const menu = await api(base, '/api/public/shops/nile-cafe/menu');
  assert.equal(menu.status, 200);
});

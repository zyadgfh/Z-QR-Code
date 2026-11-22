import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER, NILE_STAFF, ADMIN } from './helpers.mjs';

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
async function admin(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: ADMIN });
  return r.json.token;
}
const TEA = { item_id: 'nit_tea', qty: 4, option_ids: [] }; // 60 جنيه

// ================= الضريبة (D8) =================

test('D8: الضريبة على القيمة الخاضعة — لا تُطبق على التوصيل ولا الإكرامية، وتظهر بالحالة والتحليلات', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  // ضريبة 10% على محل بلا توصيل ولا إكرامية: 60 → 6 → 66
  const set = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { tax_percent: 10 } });
  assert.equal(set.status, 200);
  assert.equal(set.json.tax_percent, 10);

  const o1 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA] } });
  assert.equal(o1.status, 201);
  assert.equal(o1.json.tax_total, 6);
  assert.equal(o1.json.total, 66);

  // التوصيل والإكرامية خارج القاعدة الضريبية: نضبط رسوم التوصيل أولًا
  assert.equal((await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { delivery_fee: 20 } })).status, 200);
  // 60 + توصيل 20 + إكرامية 5 → ضريبة على 60 فقط = 6 → 91
  const o2 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'delivery', items: [TEA], tip: 5 } });
  assert.equal(o2.json.tax_total, 6);
  assert.equal(o2.json.total, 91);

  // مع كود خصم: القاعدة = المجموع − الخصم (60−30=30 → 3)
  const dc = await api(base, '/api/shop/discounts', { token: t, method: 'POST', body: { code: 'HALFTAX', type: 'fixed', value: 30, min_total: 0 } });
  assert.equal(dc.status, 201);
  const o3 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', items: [TEA], discount_code: 'HALFTAX' } });
  assert.equal(o3.json.discount_amount, 30);
  assert.equal(o3.json.tax_total, 3);
  assert.equal(o3.json.total, 33);

  // نسبة رديئة مرفوضة
  assert.equal((await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { tax_percent: 45 } })).status, 400);

  // الحالة العامة تعرض الضريبة
  const st = (await api(base, `/api/public/orders/${o1.json.id}`)).json;
  assert.equal(st.tax_total, 6);
  assert.equal(st.tax_percent, 10);

  // التحليلات تجمع الضريبة
  const an = (await api(base, '/api/shop/analytics?days=7', { token: t })).json;
  assert.equal(an.tax_total >= 15, true); // 6+6+3

  // منح الموظف إعدادات → يمكنه ضبط الضريبة (تفرض خادميًا)
  const list = (await api(base, '/api/shop/staff', { token: t })).json;
  const sid = list.find((u) => u.email === NILE_STAFF.email).id;
  await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { orders: true, menu: false, settings: true, prices: false } });
  const st2 = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  const put = await api(base, '/api/shop/settings', { token: st2.json.token, method: 'PUT', body: { tax_percent: 0 } });
  assert.equal(put.status, 200);
});

// ================= سجل التدقيق (D8) =================

test('D8: سجل التدقيق — الإجراءات الحساسة تُسجل خادميًا، والمالك فقط يقرأه', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const a = await admin(base);

  // إعدادات + صنف + فرع + صلاحيات → كلها تُسجل
  await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { name: 'كافيه النيل المطور' } });
  const menu = (await api(base, '/api/shop/menu', { token: t })).json;
  await api(base, '/api/shop/items', { token: t, method: 'POST', body: { category_id: menu.categories[0].id, name: 'قهوة سريعة', price: 25 } });
  const br = await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'فرع التدقيق' } });
  assert.equal(br.status, 201);
  const staffList = (await api(base, '/api/shop/staff', { token: t })).json;
  const sid = staffList.find((u) => u.email === NILE_STAFF.email).id;
  await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { orders: true, menu: true, settings: false, prices: false } });

  // فعل منصة: تفعيل دفع → يظهر بسجل المحل
  const shops = (await api(base, '/api/admin/shops', { token: a })).json;
  const nile = shops.find((s) => s.slug === 'nile-cafe');
  const mp = await api(base, `/api/admin/shops/${nile.id}/mark-paid`, { token: a, method: 'POST', body: { months: 3 } });
  assert.equal(mp.status, 200);

  // المالك يقرأ السجل
  const log = (await api(base, '/api/shop/audit', { token: t })).json;
  const actions = log.map((e) => e.action);
  for (const act of ['settings.update', 'item.create', 'branch.create', 'staff.perms', 'shop.mark_paid']) {
    assert.ok(actions.includes(act), `الإجراء ${act} غير مسجل`);
  }
  const markPaidEntry = log.find((e) => e.action === 'shop.mark_paid');
  assert.equal(markPaidEntry.role, 'platform_admin');
  assert.ok(markPaidEntry.detail.includes('3'));

  // الموظف لا يقرأ السجل (مالك فقط)
  const st = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  assert.equal((await api(base, '/api/shop/audit', { token: st.json.token })).status, 403);
});

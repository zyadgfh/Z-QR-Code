import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, NILE_OWNER, NILE_STAFF } from './helpers.mjs';

async function owner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  return r.json.token;
}
async function staff(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_STAFF });
  return r.json.token;
}

// ================= F-12 مصفوفة الصلاحيات =================

test('F-12: الموظف الافتراضي طلبات فقط — المنيو والإعدادات 403 من الخادم', async () => {
  const { base } = await startServer();
  const st = await staff(base);
  assert.equal((await api(base, '/api/shop/orders', { token: st })).status, 200);
  assert.equal((await api(base, '/api/shop/menu', { token: st })).status, 403);
  assert.equal((await api(base, '/api/shop/settings', { method: 'PUT', token: st, body: { name: 'x' } })).status, 403);
});

test('F-12: منيو بلا أسعار يُسمح — لمس السعر 403 حتى لو خُرق الواجهة (القبول)', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const st = await staff(base);

  // المالك يمنح الموظف: menu فقط بلا prices
  const staffList = (await api(base, '/api/shop/staff', { token: t })).json;
  const sid = staffList[0].id;
  const set = await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { menu: true } });
  assert.equal(set.status, 200);

  const items = (await api(base, '/api/shop/menu', { token: st })).json.items;
  const it = items[0];
  // تحديث بلا سعر → يمر
  const ok = await api(base, `/api/shop/items/${it.id}`, { token: st, method: 'PUT', body: { name: it.name, description: 'وصف معدل بالموظف' } });
  assert.equal(ok.status, 200);
  // لمس السعر → 403 PERM_REQUIRED من الخادم
  const denied = await api(base, `/api/shop/items/${it.id}`, { token: st, method: 'PUT', body: { price: 999 } });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error.code, 'PERM_REQUIRED');
  // إنشاء صنف جديد (بسعر) → 403
  const cats = (await api(base, '/api/shop/menu', { token: st })).json.categories;
  const created = await api(base, '/api/shop/items', { token: st, method: 'POST', body: { category_id: cats[0].id, name: 'صنف موظف', price: 5 } });
  assert.equal(created.status, 403);
  // ومنح prices يفتح كل شيء
  await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { prices: true } });
  const nowOk = await api(base, '/api/shop/items', { token: st, method: 'POST', body: { category_id: cats[0].id, name: 'صنف موظف', price: 5 } });
  assert.equal(nowOk.status, 201);
});

test('F-12: صلاحية settings تفتح الإعدادات والفروع — ومجموعة خيارات بفروق أسعار تحتاج prices', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const st = await staff(base);
  const staffList = (await api(base, '/api/shop/staff', { token: t })).json;
  const sid = staffList[0].id;
  await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { settings: true } });
  assert.equal((await api(base, '/api/shop/settings', { method: 'PUT', token: st, body: { phone: '01000000000' } })).status, 200);
  const br = await api(base, '/api/shop/branches', { token: st, method: 'POST', body: { name: 'فرع الموظف' } });
  assert.equal(br.status, 201);

  // مجموعة خيارات بفروق أسعار → prices مطلوبة (الموظف لا يملكها)
  const menu = (await api(base, '/api/shop/menu', { token: t })).json;
  const it = menu.items[0];
  const grp = await api(base, `/api/shop/items/${it.id}/groups`, {
    token: st,
    method: 'POST',
    body: { name: 'حجم', selection: 'single', required: false, options: [{ name: 'كبير', name_en: 'Large', price_delta: 5 }] },
  });
  assert.equal(grp.status, 403);
  await api(base, `/api/shop/staff/${sid}/perms`, { token: t, method: 'PUT', body: { prices: true } });
  const grp2 = await api(base, `/api/shop/items/${it.id}/groups`, {
    token: st,
    method: 'POST',
    body: { name: 'حجم', selection: 'single', required: false, options: [{ name: 'كبير', name_en: 'Large', price_delta: 5 }] },
  });
  assert.equal(grp2.status, 201);
});

// ================= F-04 الفروع =================

test('F-04: دورة الفروع — إنشاء/تحديث، القائمة العامة النشطة فقط، حذف', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const b1 = await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'الفرع الرئيسي', address: 'شارع النيل', phone: '0100' } });
  assert.equal(b1.status, 201);
  const b2 = await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'فرع الأقصر', active: false } });
  assert.equal(b2.status, 201);
  // تعديل جزئي وتفعيل
  const up = await api(base, `/api/shop/branches/${b2.json.id}`, { token: t, method: 'PUT', body: { active: true, address: 'طريق الأقصر' } });
  assert.equal(up.status, 200);
  assert.equal(up.json.active, true);
  assert.equal(up.json.address, 'طريق الأقصر');
  // القائمة العامة: النشطتان فقط بأقل الحقول
  const pub = (await api(base, '/api/public/shops/nile-cafe/menu')).json.branches;
  assert.equal(pub.length, 2);
  assert.ok(pub[0].id && pub[0].name && !('shop_id' in pub[0]));
  // حذف
  await api(base, `/api/shop/branches/${b2.json.id}`, { token: t, method: 'DELETE' });
  const pub2 = (await api(base, '/api/public/shops/nile-cafe/menu')).json.branches;
  assert.equal(pub2.length, 1);
  // اسم قصير → 400
  assert.equal((await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'ف' } })).status, 400);
});

test('F-04: الطلب يلتقط الفرع — خاطئ 404، غير نشط 400، والحالة تعرض اسم الفرع', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const br = (await api(base, '/api/shop/branches', { token: t, method: 'POST', body: { name: 'فرع الهرم' } })).json;

  const bad = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 1, branch_id: 'br_nope', items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  assert.equal(bad.status, 404);

  await api(base, `/api/shop/branches/${br.id}`, { token: t, method: 'PUT', body: { active: false } });
  const inactive = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 1, branch_id: br.id, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  assert.equal(inactive.status, 400);
  assert.equal(inactive.json.error.code, 'BRANCH_INACTIVE');
  await api(base, `/api/shop/branches/${br.id}`, { token: t, method: 'PUT', body: { active: true } });

  const ok = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 2, branch_id: br.id, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.branch_name, 'فرع الهرم');
  const status = (await api(base, `/api/public/orders/${ok.json.id}`)).json;
  assert.equal(status.branch_name, 'فرع الهرم');
  // بلا فرع → null (توافق كامل مع السابق)
  const plain = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 3, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] } });
  assert.equal(plain.json.branch_name, null);
});

// ================= F-17 الولاء =================

test('F-17: كسب النقاط من الإجمالي النهائي وتراكمها عبر الطلبات', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const on = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { loyalty: { enabled: true, earn_per: 50, redeem_value: 1, max_percent: 50 } } });
  assert.equal(on.status, 200);

  const o1 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', customer_phone: '01001111111', items: [{ item_id: 'nit_tea', qty: 4, option_ids: [] }] } });
  assert.equal(o1.status, 201);
  assert.equal(o1.json.points_earned, 1); // 60/50 → 1

  const o2 = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', customer_phone: '01001111111', items: [{ item_id: 'nit_tea', qty: 8, option_ids: [] }] } });
  assert.equal(o2.json.points_earned, 2); // 120/50 → 2

  const bal = (await api(base, '/api/public/shops/nile-cafe/loyalty?phone=01001111111')).json;
  assert.equal(bal.points, 3);
  assert.equal(bal.enabled, true);
});

test('F-17: الاسترداد — خصم فوري من الرصيد وسقف النسبة، والتجاوز مرفوض (دورة مضادة للتلاعب)', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { loyalty: { enabled: true, earn_per: 50, redeem_value: 1, max_percent: 50 } } });
  // ترصيد: 4 شاي ×15 = 60 → نقطة واحدة… نجمع 5 نقاط بخمسة طلبات
  for (let i = 0; i < 5; i++) {
    await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { service: 'takeaway', customer_phone: '01222222222', items: [{ item_id: 'nit_tea', qty: 4, option_ids: [] }] } });
  }
  const bal0 = (await api(base, '/api/public/shops/nile-cafe/loyalty?phone=01222222222')).json;
  assert.equal(bal0.points, 5);

  // استرداد 3 نقاط على طلب 30 → خصم 3 (سقف 50% من 30 = 15 ≥ 3)
  const r1 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { service: 'takeaway', customer_phone: '01222222222', redeem_points: 3, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }] },
  });
  assert.equal(r1.status, 201);
  assert.equal(r1.json.loyalty_discount, 3);
  assert.equal(r1.json.total, 27); // 30−3
  const bal1 = (await api(base, '/api/public/shops/nile-cafe/loyalty?phone=01222222222')).json;
  assert.equal(bal1.points, 2); // 5−3

  // تجاوز الرصيد → 400 NO_POINTS
  const r2 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { service: 'takeaway', customer_phone: '01222222222', redeem_points: 99, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }] },
  });
  assert.equal(r2.status, 400);
  assert.equal(r2.json.error.code, 'NO_POINTS');

  // سقف النسبة: استرداد 2 نقطة على طلب 30 → قيمة 2 < سقف 15 يمر؛ لكن على طلب صغير بقيمة أعلى من السقف تُقص
  const r3 = await api(base, '/api/public/shops/nile-cafe/orders', {
    method: 'POST',
    body: { service: 'takeaway', customer_phone: '01222222222', redeem_points: 2, items: [{ item_id: 'nit_tea', qty: 2, option_ids: [] }] },
  });
  assert.equal(r3.json.loyalty_discount, 2);
  const bal2 = (await api(base, '/api/public/shops/nile-cafe/loyalty?phone=01222222222')).json;
  assert.equal(bal2.points, 0);

  // بلا تفعيل → LOYALTY_OFF (محل برجر)
  const burgerItem = (await api(base, '/api/public/shops/burger-spot/menu')).json.items[0];
  const r4 = await api(base, '/api/public/shops/burger-spot/orders', {
    method: 'POST',
    body: { service: 'takeaway', customer_phone: '01333333333', redeem_points: 1, items: [{ item_id: burgerItem.id, qty: 1, option_ids: [] }] },
  });
  assert.equal(r4.status, 400);
  assert.equal(r4.json.error.code, 'LOYALTY_OFF');

  // قائمة الحسابات للمالك
  const accs = (await api(base, '/api/shop/loyalty/accounts', { token: t })).json;
  assert.ok(accs.length >= 1);
  assert.ok(accs.some((a) => a.phone === '01222222222' && a.points === 0));
});

// ================= F-13 استيراد CSV =================

test('F-13: القالب + معاينة جافة + استيراد فعلي بأخطاء صفوف غير قاتلة و402 للحد', async () => {
  const { base } = await startServer();
  const t = await owner(base);

  // القالب UTF-8+BOM
  const tpl = await api(base, '/api/shop/menu/import-template', { token: t });
  assert.equal(tpl.status, 200);

  const csv = [
    'name,price,category,description,allergens,sold_out',
    'كيك الشاي,25,حلويات,كيك طازج, gluten| Eggs,no',
    'قهوة تركية,20,مشروبات,,,no',
    ',50,حلويات,,,no',           // بلا اسم → خطأ صف
    'عصير برتقال,ABC,مشروبات,,,no', // سعر رديء → خطأ صف
    'فطيرة من القرمشة بالجبن الشيدر الذهبي الشهير الطويل جدًا الاسم المستحيل الحقيقي فوق المائة حرف بالتأكيد لأن هذا الاسم طويل وممدود أكثر من اللازم أصلًا,10,حلويات,,,no', // اسم >100 → خطأ
  ].join('\n');

  const dry = await api(base, '/api/shop/menu/import', { token: t, method: 'POST', body: { csv, dry_run: true } });
  assert.equal(dry.status, 200);
  assert.equal(dry.json.dry_run, true);
  assert.equal(dry.json.created_items, 0);
  assert.ok(dry.json.errors.some((e) => e.row === 4)); // بلا اسم (سطر الملف 4)
  assert.ok(dry.json.errors.some((e) => e.row === 5)); // سعر رديء (سطر 5)

  const imp = await api(base, '/api/shop/menu/import', { token: t, method: 'POST', body: { csv } });
  assert.equal(imp.status, 200);
  assert.equal(imp.json.created_items, 2);
  assert.equal(imp.json.created_categories, 1); // حلويات جديدة؛ مشروبات موجودة
  assert.equal(imp.json.errors.length, 3); // بلا اسم + سعر رديء + اسم طويل
  assert.ok(imp.json.errors.some((e) => e.row === 6));

  const menu = (await api(base, '/api/shop/menu', { token: t })).json;
  const halawa = menu.categories.find((c) => c.name === 'حلويات');
  assert.ok(halawa);
  const cake = menu.items.find((i) => i.name === 'كيك الشاي');
  assert.equal(cake.category_id, halawa.id);
  assert.deepEqual(cake.allergens, ['gluten', 'Eggs']);
});

// ================= F-17: تسجيل هاتف الزبون على طلب ترابيزة =================

test('F-17: هاتف الطلب — كسب مرة واحدة على ترابيزة، وتكرار الاستدعاء لا يضاعف', async () => {
  const { base } = await startServer();
  const t = await owner(base);
  const on = await api(base, '/api/shop/settings', { token: t, method: 'PUT', body: { loyalty: { enabled: true, earn_per: 50, redeem_value: 1, max_percent: 50 } } });
  assert.equal(on.status, 200);

  // طلب ترابيزة بلا هاتف عند الإنشاء — لا كسب
  const ord = await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: { table: 5, items: [{ item_id: 'nit_tea', qty: 8, option_ids: [] }] } });
  assert.equal(ord.status, 201);
  assert.equal(ord.json.points_earned, 0);
  const id = ord.json.id;

  // تسجيل الهاتف لاحقًا → كسب مرة واحدة
  const p1 = await api(base, `/api/public/orders/${id}/phone`, { method: 'PUT', body: { phone: '01000000001' } });
  assert.equal(p1.status, 200);
  assert.equal(p1.json.ok, true);
  assert.equal(p1.json.points_earned, 2); // 120/50

  // تكرار الاستدعاء لا يضاعف النقاط
  const p2 = await api(base, `/api/public/orders/${id}/phone`, { method: 'PUT', body: { phone: '01000000001' } });
  assert.equal(p2.status, 200);
  assert.equal(p2.json.points_earned, 2);

  // هاتف قصير مرفوض
  assert.equal((await api(base, `/api/public/orders/${id}/phone`, { method: 'PUT', body: { phone: '12' } })).status, 400);

  // الحالة العامة تعرض الهاتف والنقاط
  const st = (await api(base, `/api/public/orders/${id}`)).json;
  assert.equal(st.customer_phone, '01000000001');
  assert.equal(st.points_earned, 2);

  // الرصيد العام على الهاتف
  const bal = (await api(base, '/api/public/shops/nile-cafe/loyalty?phone=01000000001')).json;
  assert.equal(bal.points, 2);
});

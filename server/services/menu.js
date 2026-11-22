'use strict';

const crypto = require('crypto');

const { HttpError } = require('../lib/errors');
const { asStr, asMoney, asBool, asInt } = require('../lib/validate');
const adminService = require('./admin');

/** جلب مستند ينتمي للمحل — 404 إن لم يوجد أو لا يخص هذا المحل (لا نكشف الوجود) */
async function mustOwn(db, col, id, shopId) {
  if (typeof id !== 'string' || !id) throw new HttpError(404, 'NOT_FOUND', 'غير موجود');
  const doc = await db.get(col, id);
  if (!doc || doc.shop_id !== shopId) throw new HttpError(404, 'NOT_FOUND', 'غير موجود');
  return doc;
}

async function nextSort(db, col, shopId, extraFilters = []) {
  const rows = await db.query(col, [{ field: 'shop_id', value: shopId }, ...extraFilters]);
  return rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1;
}

// ---------- التصنيفات ----------

function catFields(body) {
  const name = asStr(body.name, { max: 60, min: 1 });
  if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم التصنيف مطلوب');
  const name_en = body.name_en === undefined ? undefined : asStr(body.name_en, { max: 60 });
  return { name, name_en: name_en === undefined ? undefined : name_en || null };
}

async function createCategory(db, shopId, body) {
  const { name, name_en } = catFields(body);
  const sort = await nextSort(db, 'categories', shopId);
  const id = crypto.randomUUID();
  return db.set('categories', id, {
    shop_id: shopId,
    name,
    name_en: name_en ?? null,
    sort_order: sort,
    created_at: Date.now(),
  });
}

async function updateCategory(db, shopId, catId, body) {
  await mustOwn(db, 'categories', catId, shopId);
  const { name, name_en } = catFields(body);
  return db.update('categories', catId, { name, name_en: name_en ?? null });
}

/** حذف متتالٍ: التصنيف → أصنافه → مجموعات الخيارات → الخيارات */
async function deleteCategory(db, shopId, catId) {
  await mustOwn(db, 'categories', catId, shopId);
  const items = await db.query('items', [
    { field: 'shop_id', value: shopId },
    { field: 'category_id', value: catId },
  ]);
  for (const item of items) await deleteItem(db, shopId, item.id);
  await db.delete('categories', catId);
}

// ---------- الأصناف ----------

function itemFields(body) {
  const name = asStr(body.name, { max: 100, min: 1 });
  if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم الصنف مطلوب');
  const price = asMoney(body.price);
  if (price === null) throw new HttpError(400, 'INVALID_PRICE', 'السعر غير صحيح');
  const description = body.description === undefined ? undefined : asStr(body.description, { max: 300 });
  const name_en = body.name_en === undefined ? undefined : asStr(body.name_en, { max: 100 });
  const description_en = body.description_en === undefined ? undefined : asStr(body.description_en, { max: 300 });
  const photo_url = body.photo_url === undefined ? undefined : asStr(body.photo_url, { max: 500 });
  // مسببات الحساسية: قائمة نصوص قصيرة اختيارية
  let allergens;
  if (body.allergens !== undefined) {
    if (body.allergens === null) allergens = [];
    else if (!Array.isArray(body.allergens) || body.allergens.length > 8) throw new HttpError(400, 'INVALID_ALLERGENS', 'مسببات الحساسية: قائمة حتى 8 عناصر');
    allergens = body.allergens.map((a) => asStr(a, { max: 30 })).filter(Boolean);
  }
  let calories;
  if (body.calories !== undefined && body.calories !== null) {
    calories = asInt(body.calories, { min: 0, max: 10000 });
    if (calories === null || calories === undefined) throw new HttpError(400, 'INVALID_CALORIES', 'السعرات غير صحيحة');
  }
  let weight_g;
  if (body.weight_g !== undefined && body.weight_g !== null) {
    weight_g = asInt(body.weight_g, { min: 0, max: 10000 });
    if (weight_g === null || weight_g === undefined) throw new HttpError(400, 'INVALID_WEIGHT', 'الوزن غير صحيح');
  }
  return {
    name,
    price,
    description: description === undefined ? undefined : description || null,
    name_en: name_en === undefined ? undefined : name_en || null,
    description_en: description_en === undefined ? undefined : description_en || null,
    photo_url: photo_url === undefined ? undefined : photo_url || null,
    available: body.available === undefined ? true : asBool(body.available),
    sold_out: body.sold_out === undefined ? undefined : asBool(body.sold_out),
    allergens: allergens === undefined ? undefined : allergens,
    calories: calories === undefined ? undefined : calories,
    weight_g: weight_g === undefined ? undefined : weight_g,
  };
}

async function createItem(db, shopId, body) {
  await mustOwn(db, 'categories', body.category_id, shopId);
  // حدود الخطة المجانية (BIZ-02): عدد الأصناف النشطة محدود على free — مفروض خادميًا
  const shop = await db.get('shops', shopId);
  const plan = (shop && shop.plan) || 'free';
  if (plan !== 'pro') {
    const settings = await adminService.getSettings(db);
    const active = (await db.query('items', [{ field: 'shop_id', value: shopId }])).filter((i) => i.available !== false);
    if (active.length >= settings.free_item_limit)
      throw new HttpError(402, 'PLAN_LIMIT', 'بلغتَ حد الأصناف للخطة المجانية — أخفِ أصنافًا غير مطلوبة أو رقِّ للخطة الاحترافية');
  }
  const fields = itemFields(body);
  const sort = await nextSort(db, 'items', shopId, [{ field: 'category_id', value: body.category_id }]);
  const id = crypto.randomUUID();
  return db.set('items', id, {
    shop_id: shopId,
    category_id: body.category_id,
    ...fields,
    sort_order: sort,
    created_at: Date.now(),
  });
}

async function updateItem(db, shopId, itemId, body) {
  const item = await mustOwn(db, 'items', itemId, shopId);
  const fields = itemFields(body);
  if (body.category_id !== undefined && body.category_id !== item.category_id) {
    await mustOwn(db, 'categories', body.category_id, shopId);
    fields.category_id = body.category_id;
  }
  return db.update('items', itemId, fields);
}

async function deleteItem(db, shopId, itemId) {
  await mustOwn(db, 'items', itemId, shopId);
  const groups = await db.query('option_groups', [
    { field: 'shop_id', value: shopId },
    { field: 'item_id', value: itemId },
  ]);
  for (const g of groups) {
    const opts = await db.query('options', [{ field: 'group_id', value: g.id }]);
    for (const o of opts) await db.delete('options', o.id);
    await db.delete('option_groups', g.id);
  }
  await db.delete('items', itemId);
}

// ---------- مجموعات الخيارات (أحجام / إضافات) + الخيارات ----------

function groupFields(body) {
  const name = asStr(body.name, { max: 60, min: 1 });
  if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم المجموعة مطلوب');
  const selection = body.selection === 'multi' ? 'multi' : 'single';
  const required = body.required === true;
  const name_en = body.name_en === undefined ? undefined : asStr(body.name_en, { max: 60 });
  if (!Array.isArray(body.options) || body.options.length < 1 || body.options.length > 20)
    throw new HttpError(400, 'INVALID_OPTIONS', 'المجموعة تحتاج خيارًا واحدًا على الأقل (حتى 20)');
  const options = body.options.map((o) => {
    const on = asStr(o && o.name, { max: 60, min: 1 });
    if (!on) throw new HttpError(400, 'INVALID_OPTIONS', 'اسم الخيار مطلوب');
    const delta = o.price_delta === undefined ? 0 : asMoney(o.price_delta);
    if (delta === null) throw new HttpError(400, 'INVALID_PRICE', 'فرق سعر الخيار غير صحيح');
    const o_en = asStr(o && o.name_en, { max: 60 });
    return { name: on, name_en: o_en || null, price_delta: delta };
  });
  return { name, name_en: name_en === undefined ? undefined : name_en || null, selection, required, options };
}

/** إنشاء/تحديث مجموعة خيارات بخياراتها (استبدال كامل للخيارات عند التحديث) */
async function saveGroup(db, shopId, itemId, groupId, body) {
  const item = await mustOwn(db, 'items', itemId, shopId);
  const { name, name_en, selection, required, options } = groupFields(body);
  const now = Date.now();

  let gid = groupId;
  if (gid) {
    const existing = await mustOwn(db, 'option_groups', gid, shopId);
    if (existing.item_id !== item.id) throw new HttpError(404, 'NOT_FOUND', 'غير موجود');
    await db.update('option_groups', gid, { name, name_en: name_en ?? null, selection, required });
    const old = await db.query('options', [{ field: 'group_id', value: gid }]);
    for (const o of old) await db.delete('options', o.id);
  } else {
    gid = crypto.randomUUID();
    const sort = await nextSort(db, 'option_groups', shopId, [{ field: 'item_id', value: item.id }]);
    await db.set('option_groups', gid, {
      shop_id: shopId,
      item_id: item.id,
      name,
      name_en: name_en ?? null,
      selection,
      required,
      sort_order: sort,
      created_at: now,
    });
  }
  const createdOptions = [];
  let i = 0;
  for (const o of options) {
    const doc = await db.set('options', crypto.randomUUID(), {
      shop_id: shopId,
      group_id: gid,
      item_id: item.id,
      name: o.name,
      name_en: o.name_en,
      price_delta: o.price_delta,
      sort_order: ++i,
    });
    createdOptions.push({ id: doc.id, name: doc.name, name_en: doc.name_en, price_delta: doc.price_delta });
  }
  const group = await db.get('option_groups', gid);
  return { ...group, options: createdOptions };
}

async function deleteGroup(db, shopId, groupId) {
  const group = await mustOwn(db, 'option_groups', groupId, shopId);
  const opts = await db.query('options', [{ field: 'group_id', value: group.id }]);
  for (const o of opts) await db.delete('options', o.id);
  await db.delete('option_groups', group.id);
}

// ---------- القراءة ----------

/** قائمة كاملة للوحة التحكم (تشمل غير المتاح) */
async function listFull(db, shopId) {
  const [categories, items, groups, options] = await Promise.all([
    db.query('categories', [{ field: 'shop_id', value: shopId }]),
    db.query('items', [{ field: 'shop_id', value: shopId }]),
    db.query('option_groups', [{ field: 'shop_id', value: shopId }]),
    db.query('options', [{ field: 'shop_id', value: shopId }]),
  ]);
  const sort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  categories.sort(sort);
  items.sort(sort);
  groups.sort(sort);
  const optionsByGroup = new Map();
  for (const o of options.sort(sort)) {
    if (!optionsByGroup.has(o.group_id)) optionsByGroup.set(o.group_id, []);
    optionsByGroup.get(o.group_id).push({ id: o.id, name: o.name, name_en: o.name_en, price_delta: o.price_delta });
  }
  const groupsByItem = new Map();
  for (const g of groups) {
    if (!groupsByItem.has(g.item_id)) groupsByItem.set(g.item_id, []);
    groupsByItem.get(g.item_id).push({
      id: g.id,
      name: g.name,
      name_en: g.name_en,
      selection: g.selection,
      required: g.required,
      options: optionsByGroup.get(g.id) || [],
    });
  }
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, name_en: c.name_en, sort_order: c.sort_order })),
    items: items.map((i) => ({
      id: i.id,
      category_id: i.category_id,
      name: i.name,
      name_en: i.name_en,
      description: i.description,
      description_en: i.description_en ?? null,
      price: i.price,
      photo_url: i.photo_url,
      available: i.available !== false,
      sold_out: i.sold_out === true,
      allergens: i.allergens || [],
      calories: i.calories ?? null,
      weight_g: i.weight_g ?? null,
      groups: groupsByItem.get(i.id) || [],
    })),
  };
}

/** قائمة العميل العامة — الأصناف المتاحة فقط */
async function publicMenu(db, slug) {
  const shops = require('./shops');
  const shop = await shops.findBySlug(db, slug);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  if (shop.archived === true) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  const shopStatus = shops.statusOf(shop);
  if (shopStatus === 'locked') {
    return { open: false, reason: shopStatus, shop: { slug: shop.slug, name: shop.name, logo_url: shop.logo_url } };
  }
  // مواعيد العمل (F-05): خارج الدوام → منيو يظهر لكن الطلبات مغلقة
  const openNow = shops.isOpenNow(shop);
  const full = await listFull(db, shop.id);
  return {
    open: openNow,
    reason: openNow ? undefined : 'closed_hours',
    shop: {
      slug: shop.slug,
      name: shop.name,
      menu_language: shop.menu_language,
      logo_url: shop.logo_url,
      table_count: shop.table_count,
      theme: shop.theme || null,
      brand_color: shop.brand_color || null,
      hours: shop.hours || null,
    },
    categories: full.categories,
    // النافد اليوم يظهر معتيمًا (sold_out) والمخفي نهائيًا يختفي (available=false)
    items: full.items.filter((i) => i.available !== false).map((i) => ({ ...i })),
  };
}

module.exports = {
  mustOwn,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  updateItem,
  deleteItem,
  saveGroup,
  deleteGroup,
  listFull,
  publicMenu,
};

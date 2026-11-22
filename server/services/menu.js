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

function itemFields(body, partial = false) {
  let name;
  if (partial && body.name === undefined) {
    name = undefined;
  } else {
    name = asStr(body.name, { max: 100, min: 1 });
    if (!name) throw new HttpError(400, 'INVALID_NAME', 'اسم الصنف مطلوب');
  }
  let price;
  if (partial && body.price === undefined) {
    price = undefined;
  } else {
    price = asMoney(body.price);
    if (price === null) throw new HttpError(400, 'INVALID_PRICE', 'السعر غير صحيح');
  }
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
  // المخزون (الطور 5): stock_qty فارغ/نل = بلا تتبع؛ حد التنبيه اختياري
  let stock_qty;
  if (body.stock_qty !== undefined) {
    if (body.stock_qty === null || body.stock_qty === '') stock_qty = null;
    else {
      stock_qty = asInt(body.stock_qty, { min: 0, max: 100000 });
      if (stock_qty === null || stock_qty === undefined) throw new HttpError(400, 'INVALID_STOCK', 'الكمية غير صحيحة (0-100000 أو فارغة بلا تتبع)');
    }
  }
  let low_stock_threshold;
  if (body.low_stock_threshold !== undefined) {
    if (body.low_stock_threshold === null || body.low_stock_threshold === '') low_stock_threshold = null;
    else {
      low_stock_threshold = asInt(body.low_stock_threshold, { min: 0, max: 1000 });
      if (low_stock_threshold === null || low_stock_threshold === undefined) throw new HttpError(400, 'INVALID_STOCK', 'حد التنبيه غير صحيح');
    }
  }
  const out2 = {
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
    stock_qty: stock_qty === undefined ? undefined : stock_qty,
    low_stock_threshold: low_stock_threshold === undefined ? undefined : low_stock_threshold,
  };
  if (partial) for (const k of Object.keys(out2)) if (out2[k] === undefined) delete out2[k];
  return out2;
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
  const fields = itemFields(body, true);
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
      stock_qty: i.stock_qty ?? null,
      low_stock_threshold: i.low_stock_threshold ?? null,
      groups: groupsByItem.get(i.id) || [],
    })),
  };
}

/** قائمة العميل العامة — الأصناف المتاحة فقط */
async function publicMenu(db, slug) {
  const shops = require('./shops');
  const branches = require('./branches');
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
      // الولاء (F-17): الإعداد العام للعرض — الاحتساب خادمي حصريًا
      loyalty: (await require('./loyalty').getConfig(db, shop)) || null,
    },
    // الفروع النشطة (F-04) — يختار الزبون فرعه قبل الطلب
    branches: await branches.listPublic(db, shop.id),
    categories: full.categories,
    // النافد اليوم يظهر معتيمًا (sold_out) والمخفي نهائيًا يختفي (available=false)
    // المخزون (الطور 5): نفاد الكمية = نفد اليوم تلقائيًا (بلا كشف أرقام المخزون للزبون)
    items: full.items
      .filter((i) => i.available !== false)
      .map((i) => {
        const stockTracked = i.stock_qty !== null && i.stock_qty !== undefined;
        const { stock_qty, low_stock_threshold, ...pub } = i;
        return { ...pub, sold_out: i.sold_out === true || (stockTracked && i.stock_qty <= 0) };
      }),
  };
}

/** استيراد منيو CSV (F-13): تحقق صف-بصف، صف خاطئ لا يفشل الملف، معاينة قبل الاعتماد */
async function importMenu(db, shopId, csvText, { dry_run = false } = {}) {
  const { parseCsv } = require('../lib/csv');
  const rows = parseCsv(String(csvText || ''));
  if (!rows.length) throw new HttpError(400, 'EMPTY_CSV', 'الملف فارغ');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const need = ['name', 'price', 'category'];
  for (const n of need) {
    if (!header.includes(n)) throw new HttpError(400, 'BAD_HEADER', `الرأس يجب أن يتضمن: ${need.join(', ')}`);
  }
  const col = (r, name) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] || '').trim() : '';
  };
  // خريطة التصنيفات الموجودة بالاسم
  const cats = await db.query('categories', [{ field: 'shop_id', value: shopId }]);
  const byName = new Map(cats.map((c) => [c.name.trim(), c.id]));
  let createdCategories = 0;
  let createdItems = 0;
  const errors = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (!r.some((c) => c && c.trim())) continue; // صف فارغ يُتجاهل
    try {
      const catName = col(r, 'category');
      if (!catName) throw new Error('التصنيف مطلوب');
      let catId = byName.get(catName);
      if (!catId) {
        if (dry_run) {
          errors.push({ row: ri + 1, error: `سيُنشأ تصنيف جديد: ${catName}` });
          catId = null;
        } else {
          const cat = await createCategory(db, shopId, { name: catName });
          catId = cat.id;
          byName.set(catName, catId);
          createdCategories += 1;
        }
      }
      if (catId || dry_run) {
        const nameVal = col(r, 'name');
        const priceVal = col(r, 'price');
        if (dry_run) {
          // المعاينة الجافة تتحقق من الحقول الأساسية بلا كتابة
          if (!asStr(nameVal, { max: 100, min: 1 })) throw new Error('اسم الصنف مطلوب');
          if (asMoney(priceVal) === null) throw new Error('السعر غير صحيح');
        }
        const body = {
          category_id: catId,
          name: nameVal,
          price: Number(priceVal),
        };
        const nen = col(r, 'name_en');
        if (nen) body.name_en = nen;
        const d = col(r, 'description');
        if (d) body.description = d;
        const den = col(r, 'description_en');
        if (den) body.description_en = den;
        const cal = col(r, 'calories');
        if (cal) body.calories = Number(cal);
        const wg = col(r, 'weight_g');
        if (wg) body.weight_g = Number(wg);
        const al = col(r, 'allergens');
        if (al) body.allergens = al.split('|').map((x) => x.trim()).filter(Boolean);
        if (col(r, 'sold_out').toLowerCase() === 'yes') body.sold_out = true;
        if (!dry_run) {
          await createItem(db, shopId, body); // 402 PLAN_LIMIT يتحول لخطأ الصف
          createdItems += 1;
        }
      }
    } catch (e) {
      errors.push({ row: ri + 1, error: (e && e.message) || 'خطأ غير معروف' });
    }
  }
  return { ok: true, dry_run: dry_run === true, created_categories: createdCategories, created_items: createdItems, errors };
}

module.exports = {
  importMenu,
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

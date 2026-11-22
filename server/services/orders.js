'use strict';

const crypto = require('crypto');

const { HttpError } = require('../lib/errors');
const { asStr, asInt, roundMoney, asMoney } = require('../lib/validate');
const shops = require('./shops');
const discounts = require('./discounts');
const adminService = require('./admin');

/**
 * إنشاء طلب من العميل — التحقق الكامل يقع على الخادم:
 * المحل مفتوح، رقم الترابيزة صحيح، الأصناف موجودة ومتاحة وتخص هذا المحل،
 * الخيارات صحيحة ومربوطة بالأصناف، والإجمالي يُحسب من قاعدة البيانات فقط
 * (أي أسعار يرسلها العميل تُهمَل تمامًا).
 */
async function createPublicOrder(db, slug, payload = {}) {
  const shop = await shops.findBySlug(db, slug);
  if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
  if (!shops.isOpen(shop)) {
    throw new HttpError(423, 'SHOP_CLOSED', 'المنيو غير متاح مؤقتًا');
  }
  // مواعيد العمل الأسبوعية (F-05) — خارج الدوام: مرفوض على مستوى الخادم
  if (!shops.isOpenNow(shop)) {
    throw new HttpError(423, 'SHOP_HOURS', 'المحل مغلق الآن حسب مواعيد العمل — اطلب في المواعيد المحددة');
  }

  // نوع الخدمة (F-11): طاولة = جلوس؛ بدون طاولة يلزم service صريح (تاك أوي/توصيل)
  const wantsTable = payload.table !== undefined && payload.table !== null && payload.table !== '';
  const table = asInt(payload.table, { min: 1, max: shop.table_count });
  if (wantsTable && !table)
    throw new HttpError(400, 'INVALID_TABLE', `رقم الترابيزة يجب أن يكون بين 1 و${shop.table_count}`);
  let service = 'dine_in';
  let customerPhone = null;
  if (!wantsTable) {
    service = String(payload.service || '');
    if (!['takeaway', 'delivery'].includes(service))
      throw new HttpError(400, 'INVALID_SERVICE', 'الطلب الخارجي يحتاج نوع خدمة: takeaway أو delivery');
    if (payload.customer_phone !== undefined && payload.customer_phone !== null && payload.customer_phone !== '') {
      const phone = asStr(payload.customer_phone, { min: 6, max: 20 });
      if (!/^[+\d][\d\s-]{5,19}$/.test(phone)) throw new HttpError(400, 'INVALID_PHONE_ORDER', 'رقم الهاتف غير صحيح');
      customerPhone = phone;
    }
  }

  const note = asStr(payload.note, { max: 300 }) || '';

  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 30)
    throw new HttpError(400, 'INVALID_ITEMS', 'الطلب فارغ أو عدد الأصناف كبير جدًا');

  // تحميل بيانات المنيو للمحل مرة واحدة
  const [items, groups, options] = await Promise.all([
    db.query('items', [{ field: 'shop_id', value: shop.id }]),
    db.query('option_groups', [{ field: 'shop_id', value: shop.id }]),
    db.query('options', [{ field: 'shop_id', value: shop.id }]),
  ]);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const groupsByItem = new Map();
  for (const g of groups) {
    if (!groupsByItem.has(g.item_id)) groupsByItem.set(g.item_id, []);
    groupsByItem.get(g.item_id).push(g);
  }
  const optionsById = new Map(options.map((o) => [o.id, o]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const snapshots = [];
  let total = 0;

  for (const raw of payload.items) {
    const qty = asInt(raw && raw.qty, { min: 1, max: 10 });
    if (!qty) throw new HttpError(400, 'INVALID_QTY', 'الكمية يجب أن تكون بين 1 و10');

    const item = itemsById.get(raw && raw.item_id);
    if (!item) throw new HttpError(400, 'INVALID_ITEM', 'أحد الأصناف غير موجود في هذا المحل');
    if (item.available === false) throw new HttpError(400, 'ITEM_UNAVAILABLE', `«${item.name}» غير متاح حاليًا`);
    if (item.sold_out === true) throw new HttpError(400, 'ITEM_SOLD_OUT', `«${item.name}» نفد اليوم — جرّب صنفًا آخر`);

    // الخيارات المختارة
    let chosenIds = raw.option_ids === undefined ? [] : raw.option_ids;
    if (!Array.isArray(chosenIds) || chosenIds.length > 12 || new Set(chosenIds).size !== chosenIds.length)
      throw new HttpError(400, 'INVALID_OPTIONS', 'الخيارات غير صحيحة');

    const itemGroups = groupsByItem.get(item.id) || [];
    const chosen = [];
    const perGroupCount = new Map();

    for (const oid of chosenIds) {
      const opt = optionsById.get(oid);
      if (!opt) throw new HttpError(400, 'INVALID_OPTIONS', 'أحد الخيارات غير صحيح');
      const grp = groupsById.get(opt.group_id);
      if (!grp || grp.item_id !== item.id)
        throw new HttpError(400, 'INVALID_OPTIONS', 'أحد الخيارات لا يتبع الصنف المطلوب');
      chosen.push({ opt, grp });
      perGroupCount.set(grp.id, (perGroupCount.get(grp.id) || 0) + 1);
    }

    for (const grp of itemGroups) {
      const count = perGroupCount.get(grp.id) || 0;
      if (grp.selection === 'single' && count > 1)
        throw new HttpError(400, 'INVALID_OPTIONS', `لا يمكن اختيار أكثر من خيار من «${grp.name}»`);
      if (grp.required && count !== 1)
        throw new HttpError(400, 'INVALID_OPTIONS', `«${grp.name}» مطلوبة`);
    }

    const unit = item.price + chosen.reduce((s, c) => s + (c.opt.price_delta || 0), 0);
    const lineTotal = roundMoney(unit * qty);
    total = roundMoney(total + lineTotal);

    snapshots.push({
      item_id: item.id,
      name: item.name,
      name_en: item.name_en || null,
      qty,
      unit_price: roundMoney(unit),
      options: chosen.map((c) => ({
        group_name: c.grp.name,
        option_name: c.opt.name,
        price_delta: c.opt.price_delta || 0,
      })),
      line_total: lineTotal,
    });
  }

  if (total <= 0) throw new HttpError(400, 'INVALID_TOTAL', 'إجمالي الطلب غير صحيح');

  // كود الخصم (F-06): التحقق والحساب خادمي حصريًا ثم تُخصم من المجموع
  let discount = null;
  const rawCode = typeof payload.discount_code === 'string' ? payload.discount_code : '';
  if (rawCode.trim()) {
    discount = await discounts.validateForOrder(db, shop.id, rawCode, total);
  }

  // رسوم التوصيل (F-11): تُحدد بالمحل وتطبق على توصيل فقط
  const deliveryFee = service === 'delivery' ? Math.max(0, asMoney(shop.delivery_fee) || 0) : 0;
  const grandTotal = roundMoney(Math.max(0, total - (discount ? discount.amount : 0)) + deliveryFee);
  if (grandTotal <= 0) throw new HttpError(400, 'INVALID_TOTAL', 'إجمالي الطلب غير صحيح');

  // حدود الخطة المجانية (BIZ-02) — مفرضة على مستوى الخادم
  if ((shop.plan || 'free') !== 'pro') {
    const settings = await adminService.getSettings(db);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthOrders = (await db.query('orders', [{ field: 'shop_id', value: shop.id }])).filter(
      (o) => o.created_at >= monthStart.getTime()
    );
    if (monthOrders.length >= settings.free_order_limit)
      throw new HttpError(402, 'PLAN_LIMIT', 'بلغ هذا المحل حد الطلبات الشهري للخطة المجانية — تُرفض الطلبات حتى الترقية أو تجديد الدورة');
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const order = {
    shop_id: shop.id,
    table_number: table || null,
    service,
    customer_phone: customerPhone,
    note,
    subtotal: total,
    discount_code: discount ? discount.code : null,
    discount_amount: discount ? discount.amount : 0,
    delivery_fee: deliveryFee,
    total: grandTotal,
    status: 'pending',
    eta_minutes: null,
    accepted_at: null,
    created_at: now,
    items: snapshots,
  };
  await db.set('orders', id, order);
  if (discount) {
    // عدّاد الاستخدام: قراءة → كتابة (تسلسل كافٍ داخل نسخة واحدة)
    const rows = await db.query('discounts', [{ field: 'id', value: discount.id }]);
    if (rows[0]) await db.update('discounts', discount.id, { used_count: (rows[0].used_count || 0) + 1 });
  }
  return { id, total: grandTotal, subtotal: total, discount_amount: order.discount_amount, delivery_fee: deliveryFee, table_number: order.table_number, service, created_at: now };
}

/** حالة الطلب للعميل — بدون كشف مراحل العمل الداخلية */
async function publicStatus(db, orderId) {
  if (typeof orderId !== 'string' || orderId.length < 8) throw new HttpError(404, 'NOT_FOUND', 'الطلب غير موجود');
  const order = await db.get('orders', orderId);
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'الطلب غير موجود');
  const shop = await db.get('shops', order.shop_id);
  const state = order.status === 'pending' ? 'waiting' : 'accepted';
  return {
    id: order.id,
    state,
    eta_minutes: state === 'accepted' ? order.eta_minutes : null,
    created_at: order.created_at,
    table_number: order.table_number,
    service: order.service || 'dine_in',
    discount_code: order.discount_code || null,
    discount_amount: order.discount_amount || 0,
    delivery_fee: order.delivery_fee || 0,
    total: order.total,
    items: (order.items || []).map((i) => ({
      name: i.name,
      name_en: i.name_en,
      qty: i.qty,
      unit_price: i.unit_price,
      options: (i.options || []).map((o) => ({ group_name: o.group_name, option_name: o.option_name, price_delta: o.price_delta })),
      line_total: i.line_total,
    })),
    note: order.note || '',
    shop: shop ? { name: shop.name, phone: shop.phone, menu_language: shop.menu_language } : null,
  };
}

/** قائمة طلبات المحل للوحة التحكم (الأحدث أولًا) */
async function listForShop(db, shopId) {
  const rows = await db.query('orders', [{ field: 'shop_id', value: shopId }]);
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, 100);
}

/** قبول الطلب: جديد → قيد التحضير + تحديد الوقت المتوقع */
async function accept(db, shopId, orderId, etaMinutes) {
  const order = await mustShopOrder(db, shopId, orderId);
  if (order.status !== 'pending')
    throw new HttpError(409, 'ALREADY_ACCEPTED', 'تم قبول هذا الطلب من قبل');
  const eta = asInt(etaMinutes, { min: 1, max: 300 });
  if (!eta) throw new HttpError(400, 'INVALID_ETA', 'الوقت المتوقع يجب أن يكون بين 1 و300 دقيقة');
  return db.update('orders', orderId, {
    status: 'preparing',
    eta_minutes: eta,
    accepted_at: Date.now(),
  });
}

/** تقدم المراحل: قيد التحضير → جاهز → تم */
const TRANSITIONS = { preparing: 'ready', ready: 'done' };

async function setStage(db, shopId, orderId, stage) {
  const order = await mustShopOrder(db, shopId, orderId);
  const expected = TRANSITIONS[order.status];
  if (stage !== 'ready' && stage !== 'done')
    throw new HttpError(400, 'INVALID_STAGE', 'المرحلة غير صحيحة');
  if (expected !== stage)
    throw new HttpError(400, 'INVALID_TRANSITION', 'لا يمكن نقل الطلب لهذه المرحلة من حالته الحالية');
  return db.update('orders', orderId, { status: stage });
}

async function mustShopOrder(db, shopId, orderId) {
  if (typeof orderId !== 'string' || !orderId) throw new HttpError(404, 'NOT_FOUND', 'الطلب غير موجود');
  const order = await db.get('orders', orderId);
  if (!order || order.shop_id !== shopId) throw new HttpError(404, 'NOT_FOUND', 'الطلب غير موجود');
  return order;
}

module.exports = { createPublicOrder, publicStatus, listForShop, accept, setStage };

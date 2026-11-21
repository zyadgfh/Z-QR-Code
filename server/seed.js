'use strict';

const { hashPassword } = require('./lib/auth');

/**
 * بيانات ديمو: محلان + أدمن منصة + مالكان + موظف + طلبات بأي حالة مختلفة.
 * تُستخدم في وضع الذاكرة (تطوير/عرض) وعبر `npm run seed` لبذر Firestore.
 */
async function seedDemo(db) {
  const now = Date.now();
  const MIN = 60000;

  // ----- مستخدمو المنصة -----
  await db.set('users', 'user_admin', {
    email: 'admin@qrmenu.app',
    password_hash: hashPassword('admin123'),
    role: 'platform_admin',
    created_at: now,
  });
  await db.set('users', 'user_owner_nile', {
    email: 'owner@nile.app',
    password_hash: hashPassword('owner123'),
    role: 'owner',
    created_at: now,
  });
  await db.set('users', 'user_staff_nile', {
    email: 'staff@nile.app',
    password_hash: hashPassword('staff123'),
    role: 'staff',
    created_at: now,
  });
  await db.set('users', 'user_owner_burger', {
    email: 'owner@burger.app',
    password_hash: hashPassword('owner123'),
    role: 'owner',
    created_at: now,
  });

  // ----- المحل الأول: كافيه النيل (عربي) -----
  const nile = 'shop_nile';
  await db.set('shops', nile, {
    slug: 'nile-cafe',
    name: 'كافيه النيل',
    phone: '01001234567',
    menu_language: 'ar',
    table_count: 8,
    logo_url: null,
    created_at: now - 5 * 86400000,
    trial_ends_at: now + 8 * 86400000,
    paid_until: null,
    locked: false,
  });
  await db.set('memberships', `mem_${nile}_user_owner_nile`, {
    shop_id: nile,
    user_id: 'user_owner_nile',
    role: 'owner',
    created_at: now,
  });
  await db.set('memberships', `mem_${nile}_user_staff_nile`, {
    shop_id: nile,
    user_id: 'user_staff_nile',
    role: 'staff',
    created_at: now,
  });

  const cat = (id, name, name_en, sort) =>
    db.set('categories', id, { shop_id: nile, name, name_en, sort_order: sort, created_at: now });
  await cat('ncat_hot', 'مشروبات ساخنة', 'Hot Drinks', 1);
  await cat('ncat_cold', 'مشروبات باردة', 'Cold Drinks', 2);
  await cat('ncat_dessert', 'حلويات', 'Desserts', 3);

  const item = (id, categoryId, name, name_en, price, sort, description = null) =>
    db.set('items', id, {
      shop_id: nile,
      category_id: categoryId,
      name,
      name_en,
      description,
      price,
      photo_url: null,
      available: true,
      sort_order: sort,
      created_at: now,
    });
  await item('nit_tea', 'ncat_hot', 'شاي بالنعناع', 'Mint Tea', 15, 1);
  await item('nit_turkish', 'ncat_hot', 'قهوة تركية', 'Turkish Coffee', 20, 2, 'محضّرة على الرمل');
  await item('nit_cappuccino', 'ncat_hot', 'كابتشينو', 'Cappuccino', 35, 3);
  await item('nit_latte', 'ncat_hot', 'لاتيه', 'Latte', 40, 4);
  await item('nit_ice_latte', 'ncat_cold', 'آيس لاتيه', 'Iced Latte', 45, 1);
  await item('nit_mango', 'ncat_cold', 'عصير مانجو طازج', 'Fresh Mango Juice', 50, 2);
  await item('nit_mojito', 'ncat_cold', 'موهيتو', 'Mojito', 55, 3);
  await item('nit_cheesecake', 'ncat_dessert', 'تشيز كيك', 'Cheesecake', 65, 1);
  await item('nit_kunafa', 'ncat_dessert', 'كنافة بالمانجو', 'Mango Kunafa', 45, 2);

  const group = (id, itemId, name, name_en, selection, required, sort) =>
    db.set('option_groups', id, {
      shop_id: nile,
      item_id: itemId,
      name,
      name_en,
      selection,
      required,
      sort_order: sort,
      created_at: now,
    });
  const opt = (id, groupId, name, name_en, delta, sort) =>
    db.set('options', id, {
      shop_id: nile,
      group_id: groupId,
      item_id: null,
      name,
      name_en,
      price_delta: delta,
      sort_order: sort,
    });

  // أحجام القهوة التركية
  await group('ngrp_turkish_size', 'nit_turkish', 'الحجم', 'Size', 'single', true, 1);
  await opt('nopt_t_s', 'ngrp_turkish_size', 'صغير', 'Small', 0, 1);
  await opt('nopt_t_m', 'ngrp_turkish_size', 'وسط', 'Medium', 5, 2);
  await opt('nopt_t_l', 'ngrp_turkish_size', 'كبير', 'Large', 10, 3);
  // إضافات القهوة التركية
  await group('ngrp_turkish_x', 'nit_turkish', 'إضافات', 'Extras', 'multi', false, 2);
  await opt('nopt_t_sugar', 'ngrp_turkish_x', 'سكر زيادة', 'Extra Sugar', 0, 1);
  await opt('nopt_t_milk', 'ngrp_turkish_x', 'حليب', 'Milk', 3, 2);
  await opt('nopt_t_nutella', 'ngrp_turkish_x', 'نوتيلا', 'Nutella', 10, 3);
  // أحجام اللاتيه
  await group('ngrp_latte_size', 'nit_latte', 'الحجم', 'Size', 'single', true, 1);
  await opt('nopt_l_m', 'ngrp_latte_size', 'وسط', 'Medium', 5, 1);
  await opt('nopt_l_l', 'ngrp_latte_size', 'كبير', 'Large', 8, 2);
  // أحجام الموهيتو
  await group('ngrp_mojito_size', 'nit_mojito', 'الحجم', 'Size', 'single', true, 1);
  await opt('nopt_m_m', 'ngrp_mojito_size', 'وسط', 'Medium', 0, 1);
  await opt('nopt_m_l', 'ngrp_mojito_size', 'كبير', 'Large', 10, 2);
  // أحجام الآيس لاتيه
  await group('ngrp_ice_size', 'nit_ice_latte', 'الحجم', 'Size', 'single', true, 1);
  await opt('nopt_i_m', 'ngrp_ice_size', 'وسط', 'Medium', 5, 1);
  await opt('nopt_i_l', 'ngrp_ice_size', 'كبير', 'Large', 8, 2);

  // ----- المحل الثاني: Burger Spot (إنجليزي — لاختبار LTR) -----
  const burger = 'shop_burger';
  await db.set('shops', burger, {
    slug: 'burger-spot',
    name: 'Burger Spot برجر سبوت',
    phone: '01112223334',
    menu_language: 'en',
    table_count: 5,
    logo_url: null,
    created_at: now - 2 * 86400000,
    trial_ends_at: now + 11 * 86400000,
    paid_until: null,
    locked: false,
  });
  await db.set('memberships', `mem_${burger}_user_owner_burger`, {
    shop_id: burger,
    user_id: 'user_owner_burger',
    role: 'owner',
    created_at: now,
  });

  await db.set('categories', 'bcat_burgers', { shop_id: burger, name: 'برجر', name_en: 'Burgers', sort_order: 1, created_at: now });
  await db.set('categories', 'bcat_sides', { shop_id: burger, name: 'مقبلات', name_en: 'Sides', sort_order: 2, created_at: now });
  await db.set('categories', 'bcat_drinks', { shop_id: burger, name: 'مشروبات', name_en: 'Drinks', sort_order: 3, created_at: now });

  const bitem = (id, categoryId, name, name_en, price, sort) =>
    db.set('items', id, {
      shop_id: burger,
      category_id: categoryId,
      name,
      name_en,
      description: null,
      price,
      photo_url: null,
      available: true,
      sort_order: sort,
      created_at: now,
    });
  await bitem('bit_classic', 'bcat_burgers', 'كلاسيك برجر', 'Classic Burger', 85, 1);
  await bitem('bit_double', 'bcat_burgers', 'دبل تشيز برجر', 'Double Cheese Burger', 120, 2);
  await bitem('bit_chicken', 'bcat_burgers', 'كريسبي تشيكن برجر', 'Crispy Chicken Burger', 90, 3);
  await bitem('bit_fries', 'bcat_sides', 'بطاطس مقلية', 'French Fries', 40, 1);
  await bitem('bit_rings', 'bcat_sides', 'حلقات البصل', 'Onion Rings', 45, 2);
  await bitem('bit_coke', 'bcat_drinks', 'كوكاكولا', 'Coca-Cola', 20, 1);
  await bitem('bit_sprite', 'bcat_drinks', 'سبرايت', 'Sprite', 20, 2);

  await db.set('option_groups', 'bgrp_double_size', { shop_id: burger, item_id: 'bit_double', name: 'الحجم', name_en: 'Size', selection: 'single', required: true, sort_order: 1, created_at: now });
  await db.set('options', 'bopt_d_single', { shop_id: burger, group_id: 'bgrp_double_size', item_id: null, name: 'سنجل', name_en: 'Single', price_delta: 0, sort_order: 1 });
  await db.set('options', 'bopt_d_double', { shop_id: burger, group_id: 'bgrp_double_size', item_id: null, name: 'دبل', name_en: 'Double', price_delta: 40, sort_order: 2 });
  await db.set('option_groups', 'bgrp_classic_x', { shop_id: burger, item_id: 'bit_classic', name: 'إضافات', name_en: 'Extras', selection: 'multi', required: false, sort_order: 1, created_at: now });
  await db.set('options', 'bopt_c_cheese', { shop_id: burger, group_id: 'bgrp_classic_x', item_id: null, name: 'تشيز إضافي', name_en: 'Extra Cheese', price_delta: 20, sort_order: 1 });
  await db.set('options', 'bopt_c_patty', { shop_id: burger, group_id: 'bgrp_classic_x', item_id: null, name: 'قطعة لحم إضافية', name_en: 'Extra Patty', price_delta: 45, sort_order: 2 });
  await db.set('options', 'bopt_c_jalapeno', { shop_id: burger, group_id: 'bgrp_classic_x', item_id: null, name: 'هالبينو', name_en: 'Jalapeños', price_delta: 10, sort_order: 3 });
  await db.set('option_groups', 'bgrp_fries_size', { shop_id: burger, item_id: 'bit_fries', name: 'الحجم', name_en: 'Size', selection: 'single', required: true, sort_order: 1, created_at: now });
  await db.set('options', 'bopt_f_reg', { shop_id: burger, group_id: 'bgrp_fries_size', item_id: null, name: 'عادي', name_en: 'Regular', price_delta: 0, sort_order: 1 });
  await db.set('options', 'bopt_f_large', { shop_id: burger, group_id: 'bgrp_fries_size', item_id: null, name: 'كبير', name_en: 'Large', price_delta: 15, sort_order: 2 });

  // ----- طلبات ديمو لكافيه النيل -----
  const order = (id, table, status, items, note, createdMinAgo, extra = {}) =>
    db.set('orders', id, {
      shop_id: nile,
      table_number: table,
      note: note || '',
      total: items.reduce((s, i) => s + i.line_total, 0),
      status,
      eta_minutes: null,
      accepted_at: null,
      created_at: now - createdMinAgo * MIN,
      items,
      ...extra,
    });

  await order(
    'ord_demo_1', 3, 'pending',
    [
      { item_id: 'nit_latte', name: 'لاتيه', name_en: 'Latte', qty: 2, unit_price: 45, options: [{ group_name: 'الحجم', option_name: 'وسط', price_delta: 0 }], line_total: 90 },
      { item_id: 'nit_mojito', name: 'موهيتو', name_en: 'Mojito', qty: 1, unit_price: 55, options: [{ group_name: 'الحجم', option_name: 'وسط', price_delta: 0 }], line_total: 55 },
    ],
    'السكر خفيف من فضلك', 2
  );
  await order(
    'ord_demo_2', 5, 'preparing',
    [
      { item_id: 'nit_turkish', name: 'قهوة تركية', name_en: 'Turkish Coffee', qty: 1, unit_price: 30, options: [{ group_name: 'الحجم', option_name: 'كبير', price_delta: 10 }], line_total: 30 },
      { item_id: 'nit_kunafa', name: 'كنافة بالمانجو', name_en: 'Mango Kunafa', qty: 1, unit_price: 45, options: [], line_total: 45 },
    ],
    '', 12, { eta_minutes: 15, accepted_at: now - 10 * MIN }
  );
  await order(
    'ord_demo_3', 2, 'ready',
    [
      { item_id: 'nit_cheesecake', name: 'تشيز كيك', name_en: 'Cheesecake', qty: 1, unit_price: 65, options: [], line_total: 65 },
      { item_id: 'nit_tea', name: 'شاي بالنعناع', name_en: 'Mint Tea', qty: 2, unit_price: 15, options: [], line_total: 30 },
    ],
    '', 25, { eta_minutes: 10, accepted_at: now - 22 * MIN }
  );
  await order(
    'ord_demo_4', 1, 'done',
    [
      { item_id: 'nit_ice_latte', name: 'آيس لاتيه', name_en: 'Iced Latte', qty: 1, unit_price: 50, options: [{ group_name: 'الحجم', option_name: 'وسط', price_delta: 0 }], line_total: 50 },
      { item_id: 'nit_cappuccino', name: 'كابتشينو', name_en: 'Cappuccino', qty: 1, unit_price: 35, options: [], line_total: 35 },
    ],
    '', 120, { eta_minutes: 10, accepted_at: now - 115 * MIN }
  );

  // ----- إعدادات المنصة -----
  await db.set('platform_settings', 'default', {
    monthly_price: 300,
    payment_instructions:
      'حوّل مبلغ الاشتراك على InstaPay / فودافون كاش على الرقم: 01001234567 (QR Menu)، ثم ابعت صورة التحويل للدعم على واتساب وسيتم التفعيل خلال دقائق.',
    updated_at: now,
  });
}

module.exports = { seedDemo };

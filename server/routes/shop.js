'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const { asStr, isEmail } = require('../lib/validate');
const { authenticate } = require('../lib/session');
const { sendWithEtag } = require('../lib/etag');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');
const shopsService = require('../services/shops');
const adminService = require('../services/admin');
const aiService = require('../services/ai');
const { parseDataUrl } = require('../services/ai');
const discountsService = require('../services/discounts');
const branchesService = require('../services/branches');
const loyaltyService = require('../services/loyalty');
const analyticsService = require('../services/analytics');
const { ordersCsv } = require('../lib/csv');

module.exports = function shopRoutes(ctx) {
  const { db, env } = ctx;
  const r = express.Router();

  // ---------- بث لحظي لتغييرات الطلبات (F-01) — قبل الحارس العام لأنه يصادق بنفسه ----------
  // EventSource لا يستطيع إرسال ترويسات، فيمر التوكن في الاستعلام (توقيع HS256 موثوق به)
  r.get(
    '/orders/stream',
    h(async (req, res) => {
      const { user } = await authenticate(ctx, { headers: { authorization: `Bearer ${String(req.query.t || '')}` } }, { enforceMfa: false });
      const mems = await db.query('memberships', [{ field: 'user_id', value: user.id }]);
      if (!mems.length) throw new HttpError(403, 'NO_SHOP', 'لا يوجد محل مرتبط بهذا الحساب');
      const shopId = mems[0].shop_id;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(': connected\n\n');
      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* مقفول */ }
      }, 25000);
      const unsub = typeof db.onOrders === 'function' ? db.onOrders(shopId, () => {
        try { res.write('data: changed\n\n'); } catch { /* مقفول */ }
      }) : null;
      req.on('close', () => {
        clearInterval(ping);
        if (unsub) unsub();
        try { res.end(); } catch { /* مقفول */ }
      });
    })
  );

  // ---------- الحماية: مستخدم مسجّل + عضوية محل (+ جلسات وMFA عبر lib/session) ----------
  r.use(
    h(async (req, res, next) => {
      const { user } = await authenticate(ctx, req, { enforceMfa: true });
      const mems = await db.query('memberships', [{ field: 'user_id', value: user.id }]);
      if (!mems.length) throw new HttpError(403, 'NO_SHOP', 'لا يوجد محل مرتبط بهذا الحساب');
      req.user = user;
      req.member = mems[0]; // v1: عضوية واحدة لكل مستخدم
      next();
    })
  );

  // الأدوار: الموظف يستقبل الطلبات فقط — كل ما عداها للمالك
  function ownerOnly(req) {
    if (req.member.role !== 'owner') {
      throw new HttpError(403, 'FORBIDDEN', 'هذه الصفحة لمالك المحل فقط');
    }
  }

  // مصفوفة الصلاحيات (F-12): المالك يمرر دائمًا؛ الموظف بحسب مصفوفته — الفرض خادمي لا واجهي
  function hasPerm(req, key) {
    if (req.member.role === 'owner') return true;
    const perms = req.member.perms || { orders: true, menu: false, settings: false, prices: false };
    return perms[key] === true;
  }
  function requirePerm(req, key, msg) {
    if (!hasPerm(req, key)) throw new HttpError(403, 'PERM_REQUIRED', msg || `هذا الإجراء يحتاج صلاحية: ${key}`);
  }
  // يحتاج صلاحية الأسعار إن لمس الحقل المرسل الأسعار
  const PRICE_FIELDS = ['price', 'price_delta'];
  function requirePermDeep(req, key, keys, body) {
    const touchesPrice = keys.some((k) => body && body[k] !== undefined);
    requirePerm(req, touchesPrice ? 'prices' : key);
  }

  // ---------- ملخص المحل (الكل: مالك + موظف) ----------
  r.get(
    '/summary',
    h(async (req, res) => {
      const shop = await shopsService.byId(db, req.member.shop_id);
      if (!shop) throw new HttpError(404, 'NOT_FOUND', 'المحل غير موجود');
      const status = shopsService.statusOf(shop);
      const out = {
        shop: {
          id: shop.id,
          slug: shop.slug,
          name: shop.name,
          phone: shop.phone,
          menu_language: shop.menu_language,
          table_count: shop.table_count,
          logo_url: shop.logo_url,
          trial_ends_at: shop.trial_ends_at,
          paid_until: shop.paid_until,
          status,
          days_left: shopsService.daysLeft(shop),
        },
        my_role: req.member.role,
      };
      if (req.member.role === 'owner') {
        const settings = await adminService.getSettings(db);
        out.subscription = settings;
      }
      res.json(out);
    })
  );

  // ---------- الطلبات (مالك + موظف) ----------
  r.get(
    '/orders',
    h(async (req, res) => {
      sendWithEtag(req, res, await ordersService.listForShop(db, req.member.shop_id));
    })
  );

  // ---------- Web Push (NOTIF-01): المفتاح العام + تسجيل/إلغاء اشتراك جهاز ----------
  r.get('/push/key', h(async (req, res) => {
    res.json({ enabled: !!ctx.notifier?.pushEnabled, key: ctx.notifier?.publicKey || null });
  }));

  r.post('/push/subscribe', h(async (req, res) => {
    const sub = req.body && req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || !sub.keys.p256dh || !sub.keys.auth)
      throw new HttpError(400, 'BAD_SUBSCRIPTION', 'اشتراك غير صالح');
    const id = require('crypto').createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 32);
    await db.set('push_subscriptions', id, {
      shop_id: req.member.shop_id,
      user_id: req.user.id,
      endpoint: sub.endpoint,
      keys: sub.keys,
      created_at: Date.now(),
    });
    res.json({ ok: true });
  }));

  r.post('/push/unsubscribe', h(async (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    if (typeof endpoint === 'string' && endpoint) {
      const id = require('crypto').createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
      await db.delete('push_subscriptions', id).catch(() => {});
    }
    res.json({ ok: true });
  }));

  r.post(
    '/orders/:id/accept',
    h(async (req, res) => {
      const updated = await ordersService.accept(db, req.member.shop_id, req.params.id, req.body && req.body.eta_minutes);
      res.json(updated);
    })
  );

  r.post(
    '/orders/:id/stage',
    h(async (req, res) => {
      const updated = await ordersService.setStage(db, req.member.shop_id, req.params.id, req.body && req.body.stage);
      res.json(updated);
    })
  );

  // ---------- المنيو (مالك فقط) ----------
  r.get(
    '/menu',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      res.json(await menuService.listFull(db, req.member.shop_id));
    })
  );

  r.post(
    '/categories',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      res.status(201).json(await menuService.createCategory(db, req.member.shop_id, req.body || {}));
    })
  );
  r.put(
    '/categories/:id',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      res.json(await menuService.updateCategory(db, req.member.shop_id, req.params.id, req.body || {}));
    })
  );
  r.delete(
    '/categories/:id',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      await menuService.deleteCategory(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  r.post(
    '/items',
    h(async (req, res) => {
      requirePerm(req, 'prices', 'إنشاء أصناف بأسعار يحتاج صلاحية الأسعار');
      res.status(201).json(await menuService.createItem(db, req.member.shop_id, req.body || {}));
    })
  );
  r.put(
    '/items/:id',
    h(async (req, res) => {
      // تحديث بلا لمس السعر = صلاحية منيو؛ لمس السعر يحتاج صلاحية أسعار (قبول F-12)
      const body = req.body || {};
      requirePermDeep(req, 'menu', ['price'], body);
      res.json(await menuService.updateItem(db, req.member.shop_id, req.params.id, body));
    })
  );
  r.delete(
    '/items/:id',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      await menuService.deleteItem(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  r.post(
    '/items/:id/groups',
    h(async (req, res) => {
      const body = req.body || {};
      if ((body.options || []).some((o) => Number(o && o.price_delta) !== 0)) requirePerm(req, 'prices', 'خيارات بفروق أسعار تحتاج صلاحية الأسعار');
      else requirePerm(req, 'menu');
      res.status(201).json(await menuService.saveGroup(db, req.member.shop_id, req.params.id, null, body));
    })
  );
  r.put(
    '/groups/:id',
    h(async (req, res) => {
      const body = req.body || {};
      if ((body.options || []).some((o) => Number(o && o.price_delta) !== 0)) requirePerm(req, 'prices', 'خيارات بفروق أسعار تحتاج صلاحية الأسعار');
      else requirePerm(req, 'menu');
      const group = await menuService.mustOwn(db, 'option_groups', req.params.id, req.member.shop_id);
      res.json(await menuService.saveGroup(db, req.member.shop_id, group.item_id, req.params.id, body));
    })
  );
  r.delete(
    '/groups/:id',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      await menuService.deleteGroup(db, req.member.shop_id, req.params.id);
      res.json({ ok: true });
    })
  );

  // ---------- الإعدادات + رفع الصور (مالك فقط) ----------
  r.put(
    '/settings',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.json(await shopsService.updateSettings(db, req.member.shop_id, req.body || {}));
    })
  );

  r.post(
    '/uploads',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      const parsed = parseDataUrl(req.body && req.body.dataUrl);
      if (!parsed) throw new HttpError(400, 'INVALID_IMAGE', 'صورة غير صالحة (JPG/PNG/WebP حتى 4MB)');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.mime.split('/')[1]}`;
      const url = await db.saveImage(req.member.shop_id, filename, parsed.data ? Buffer.from(parsed.data, 'base64') : parsed.buffer, parsed.mime);
      res.status(201).json({ url });
    })
  );

  // ---------- ترجمة المنيو AI (A-01): اقتراح للمراجعة — بلا كتابة في القاعدة ----------
  r.post(
    '/menu/translate',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      const full = await menuService.listFull(db, req.member.shop_id);
      const proposal = await aiService.translateMenu({
        items: full.items,
        categories: full.categories,
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL || aiService.DEFAULT_MODEL,
      });
      res.json(proposal);
    })
  );

  // ---------- توليد صورة صنف بالذكاء الاصطناعي من الاسم (D7) — صلاحية menu، محدود المعدل ----------
  r.post(
    '/items/:id/generate-image',
    rateLimit({ windowMs: 60000, max: 12, keyFn: (req) => 'imgen:' + (req.member && req.member.user_id) || req.ip || 'x' }),
    h(async (req, res) => {
      requirePerm(req, 'menu');
      const item = await db.get('items', req.params.id);
      if (!item || item.shop_id !== req.member.shop_id) throw new HttpError(404, 'NOT_FOUND', 'الصنف غير موجود');
      const cat = item.category_id ? await db.get('categories', item.category_id) : null;
      const img = await aiService.generateItemImage({
        name: item.name,
        name_en: item.name_en,
        description: item.description,
        category: cat ? cat.name : null,
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_IMAGE_MODEL || aiService.DEFAULT_IMAGE_MODEL,
      });
      const buffer = Buffer.from(img.data, 'base64');
      if (!buffer.length) throw new HttpError(502, 'AI_BAD_IMAGE', 'صورة غير صالحة من الخدمة');
      const ext = (img.mime.split('/')[1] || 'png').replace(/[^\w]/g, '') || 'png';
      const filename = `ai-${item.id}-${Date.now()}.${ext}`;
      const url = await db.saveImage(req.member.shop_id, filename, buffer, img.mime);
      await db.update('items', item.id, { photo_url: url });
      res.json({ photo_url: url });
    })
  );

  // ---------- التحليلات (D6) — مالك فقط (بيانات مالية وتشغيلية) ----------
  r.get('/analytics', h(async (req, res) => {
    ownerOnly(req);
    res.json(await analyticsService.shopAnalytics(db, req.member.shop_id, req.query.days));
  }));

  // ---------- نسخة احتياطية JSON (D6) — مالك فقط ----------
  r.get('/export', h(async (req, res) => {
    ownerOnly(req);
    const data = await shopsService.exportShop(db, req.member.shop_id);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    res.set('content-disposition', `attachment; filename="shop-${data.shop.slug || 'export'}-${stamp}.json"`);
    res.json(data);
  }));

  // ---------- أكواد الخصم (F-06) — مالك فقط ----------
  r.get('/discounts', h(async (req, res) => {
    ownerOnly(req);
    res.json(await discountsService.listForShop(db, req.member.shop_id));
  }));

  r.post('/discounts', h(async (req, res) => {
    ownerOnly(req);
    const d = await discountsService.create(db, req.member.shop_id, req.body || {});
    res.status(201).json(d);
  }));

  r.delete('/discounts/:id', h(async (req, res) => {
    ownerOnly(req);
    await discountsService.remove(db, req.member.shop_id, req.params.id);
    res.json({ ok: true });
  }));

  // ---------- استهلاك الخطة (BIZ-02) للعرض في اللوحة ----------
  r.get('/usage', h(async (req, res) => {
    ownerOnly(req);
    const shop = await shopsService.byId(db, req.member.shop_id);
    const settings = await adminService.getSettings(db);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const items = await db.query('items', [{ field: 'shop_id', value: req.member.shop_id }]);
    const orders = await db.query('orders', [{ field: 'shop_id', value: req.member.shop_id }]);
    res.json({
      plan: (shop && shop.plan) || 'free',
      items_used: items.filter((i) => i.available !== false).length,
      item_limit: settings.free_item_limit,
      orders_this_month: orders.filter((o) => o.created_at >= monthStart.getTime()).length,
      order_limit: settings.free_order_limit,
      delivery_fee: (shop && shop.delivery_fee) || 0,
      monthly_price: settings.monthly_price,
    });
  }));

  // ---------- تصدير الطلبات CSV (ECO-02) — مالك فقط ----------
  r.get('/orders/export', h(async (req, res) => {
    ownerOnly(req);
    const all = await ordersService.listForShop(db, req.member.shop_id);
    const from = Number(req.query.from) || 0;
    const to = Number(req.query.to) || Infinity;
    const rows = all.filter((o) => o.created_at >= from && o.created_at <= to);
    res.set('content-type', 'text/csv; charset=utf-8');
    res.set('content-disposition', `attachment; filename="orders-${req.member.shop_id}.csv"`);
    res.send(ordersCsv(rows));
  }));

  // ---------- الموظفين (مالك فقط) ----------
  r.get(
    '/staff',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await shopsService.listStaff(db, req.member.shop_id));
    })
  );
  r.post(
    '/staff',
    h(async (req, res) => {
      ownerOnly(req);
      const body = req.body || {};
      res.status(201).json(await shopsService.addStaff(db, req.member.shop_id, { email: body.email, password: body.password }));
    })
  );
  r.delete(
    '/staff/:userId',
    h(async (req, res) => {
      ownerOnly(req);
      await shopsService.removeStaff(db, req.member.shop_id, req.params.userId);
      res.json({ ok: true });
    })
  );

  // ---------- مصفوفة صلاحيات الموظفين (F-12) — المالك فقط ----------
  r.put(
    '/staff/:userId/perms',
    h(async (req, res) => {
      ownerOnly(req);
      res.json(await shopsService.setStaffPerms(db, req.member.shop_id, req.params.userId, req.body || {}));
    })
  );

  // ---------- الفروع (F-04) — صلاحية الإعدادات ----------
  r.get(
    '/branches',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.json(await branchesService.listForShop(db, req.member.shop_id));
    })
  );
  r.post(
    '/branches',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.status(201).json(await branchesService.create(db, req.member.shop_id, req.body || {}));
    })
  );
  r.put(
    '/branches/:id',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.json(await branchesService.patchBranch(db, req.member.shop_id, req.params.id, req.body || {}));
    })
  );
  r.delete(
    '/branches/:id',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.json(await branchesService.remove(db, req.member.shop_id, req.params.id));
    })
  );

  // ---------- استيراد منيو CSV (F-13) — قالب + رفع بمعاينة؛ الإنشاء بأسعار يحتاج صلاحية الأسعار ----------
  r.get(
    '/menu/import-template',
    h(async (req, res) => {
      requirePerm(req, 'menu');
      res.set('content-type', 'text/csv; charset=utf-8');
      res.set('content-disposition', 'attachment; filename="menu-template.csv"');
      res.send('\uFEFFname,name_en,price,category,description,calories,weight_g,allergens,sold_out\nشاي بالنعناع,Mint Tea,15,مشروبات,شاي أخضر طازج,10,250,لا يوجد,no\n');
    })
  );
  r.post(
    '/menu/import',
    h(async (req, res) => {
      requirePerm(req, 'prices', 'الاستيراد ينشئ أصنافًا بأسعار — يحتاج صلاحية الأسعار');
      res.json(await menuService.importMenu(db, req.member.shop_id, req.body && req.body.csv, { dry_run: (req.body && req.body.dry_run) === true }));
    })
  );

  // ---------- حسابات الولاء (F-17) — صلاحية الإعدادات ----------
  r.get(
    '/loyalty/accounts',
    h(async (req, res) => {
      requirePerm(req, 'settings');
      res.json(await loyaltyService.listAccounts(db, req.member.shop_id, 50));
    })
  );

  // ---------- استيراد المنيو بالـ AI (مالك فقط) ----------
  r.post(
    '/ai/extract-menu',
    h(async (req, res) => {
      ownerOnly(req);
      const draft = await aiService.extractMenu({
        images: (req.body && req.body.images) || [],
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
      });
      res.json(draft);
    })
  );

  return r;
};

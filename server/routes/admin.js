'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { authenticate } = require('../lib/session');
const adminService = require('../services/admin');
const auditService = require('../services/audit');
const shopsService = require('../services/shops');
const { ordersCsv } = require('../lib/csv');

module.exports = function adminRoutes(ctx) {
  const { db, env } = ctx;
  const r = express.Router();

  // ---------- حماية: أدمن المنصة فقط (+ جلسات وMFA عبر lib/session) ----------
  r.use(
    h(async (req, res, next) => {
      const { user } = await authenticate(ctx, req, { enforceMfa: true });
      if (user.role !== 'platform_admin')
        throw new HttpError(403, 'FORBIDDEN', 'هذه الصفحة لأدمن المنصة فقط');
      req.user = user;
      next();
    })
  );

  r.get(
    '/overview',
    h(async (req, res) => {
      res.json(await adminService.overview(db));
    })
  );

  r.get(
    '/shops',
    h(async (req, res) => {
      res.json(await adminService.listShops(db, { q: req.query.q, archived: req.query.archived }));
    })
  );

  r.post(
    '/shops',
    h(async (req, res) => {
      const b = req.body || {};
      const shop = await shopsService.createShop(db, {
        name: b.name,
        slug: b.slug,
        phone: b.phone,
        menu_language: b.menu_language,
        table_count: b.table_count,
        owner_email: b.owner_email,
        owner_password: b.owner_password,
      });
      res.status(201).json(shop);
    })
  );

  r.post(
    '/shops/:id/mark-paid',
    h(async (req, res) => {
      const months = Math.max(1, Math.min(12, Number(req.body && req.body.months) || 1));
      const settings = await adminService.getSettings(db);
      const amount = Math.round(settings.monthly_price * months);
      const invoice = await ctx.payments.createInvoice({ amount, description: `اشتراك ${months} شهر` });
      const out = await adminService.markPaid(db, req.params.id, { months, invoice });
      auditService.log(db, { shop_id: req.params.id, user_id: req.user.id, email: req.user.email, role: 'platform_admin' }, 'shop.mark_paid', `${months} شهر — فاتورة ${invoice.invoice_no || ''}`).catch(() => {});
      // فاتورة بريدية للمالك (NOTIF-03) — fire and forget
      const shop = await shopsService.byId(db, req.params.id);
      const mems = await db.query('memberships', [
        { field: 'shop_id', value: req.params.id },
        { field: 'role', value: 'owner' },
      ]);
      let ownerEmail = shop && shop.owner_email;
      if (!ownerEmail && mems[0]) {
        const ownerUser = await db.get('users', mems[0].user_id);
        ownerEmail = ownerUser && ownerUser.email;
      }
      if (ownerEmail && ctx.mailer) {
        ctx.mailer
          .send({
            to: ownerEmail,
            ...require('../lib/mailTemplates').invoice(
              (shop && shop.name) || '',
              invoice.invoice_no,
              months,
              amount,
              new Date(out.paid_until).toLocaleDateString('ar-EG')
            ),
          })
          .catch(() => {});
      }
      res.json(out);
    })
  );

  r.post(
    '/shops/:id/plan',
    h(async (req, res) => {
      res.json(await adminService.setPlan(db, req.params.id, req.body && req.body.plan));
    })
  );

  r.get(
    '/shops/:id/orders/export',
    h(async (req, res) => {
      const orders = await require('../services/orders').listForShop(db, req.params.id);
      res.set('content-type', 'text/csv; charset=utf-8');
      res.set('content-disposition', `attachment; filename="orders-${req.params.id}.csv"`);
      res.send(ordersCsv(orders));
    })
  );

  r.post(
    '/shops/:id/lock',
    h(async (req, res) => {
      const lk = await adminService.setLocked(db, req.params.id, Boolean(req.body && req.body.locked));
      auditService.log(db, { shop_id: req.params.id, user_id: req.user.id, email: req.user.email, role: 'platform_admin' }, lk.locked ? 'shop.lock' : 'shop.unlock', '').catch(() => {});
      res.json(lk);
    })
  );

  r.post(
    '/shops/:id/archive',
    h(async (req, res) => {
      const ar = await adminService.setArchived(db, req.params.id, Boolean(req.body && req.body.archived));
      auditService.log(db, { shop_id: req.params.id, user_id: req.user.id, email: req.user.email, role: 'platform_admin' }, ar.archived ? 'shop.archive' : 'shop.restore', '').catch(() => {});
      res.json(ar);
    })
  );

  r.post(
    '/shops/:id/reset-owner-password',
    h(async (req, res) => {
      const out = await adminService.resetOwnerPassword(db, req.params.id, req.body && req.body.password);
      // بيانات الدخول الجديدة بريدًا للمالك (NOTIF-03) — fire and forget
      const shop = await shopsService.byId(db, req.params.id);
      if (out.email && ctx.mailer) {
        ctx.mailer
          .send({
            to: out.email,
            ...require('../lib/mailTemplates').ownerCredentials((shop && shop.name) || '', out.password),
          })
          .catch(() => {});
      }
      res.json(out);
    })
  );

  r.get(
    '/settings',
    h(async (req, res) => {
      res.json(await adminService.getSettings(db));
    })
  );

  r.put(
    '/settings',
    h(async (req, res) => {
      res.json(await adminService.updateSettings(db, req.body || {}));
    })
  );

  return r;
};

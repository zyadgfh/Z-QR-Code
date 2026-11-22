'use strict';

const express = require('express');
const { h, HttpError } = require('../lib/errors');
const { authenticate } = require('../lib/session');
const adminService = require('../services/admin');
const shopsService = require('../services/shops');

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
    '/shops',
    h(async (req, res) => {
      res.json(await adminService.listShops(db));
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
      res.json(await adminService.markPaid(db, req.params.id));
    })
  );

  r.post(
    '/shops/:id/lock',
    h(async (req, res) => {
      res.json(await adminService.setLocked(db, req.params.id, Boolean(req.body && req.body.locked)));
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

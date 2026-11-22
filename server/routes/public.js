'use strict';

const express = require('express');
const { h } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const menuService = require('../services/menu');
const ordersService = require('../services/orders');

module.exports = function publicRoutes(ctx) {
  const { db } = ctx;
  const r = express.Router();

  // قائمة المنيو العامة حسب المحل
  r.get(
    '/shops/:slug/menu',
    h(async (req, res) => {
      res.json(await menuService.publicMenu(db, req.params.slug));
    })
  );

  // إرسال طلب — مع تحديد معدل ضد السبام
  r.post(
    '/shops/:slug/orders',
    rateLimit({
      windowMs: 60000,
      max: 10,
      keyFn: (req) => `order:${req.ip || 'x'}`,
    }),
    h(async (req, res) => {
      const result = await ordersService.createPublicOrder(db, req.params.slug, req.body || {});
      res.status(201).json(result);
    })
  );

  // متابعة حالة الطلب برقم غير قابل للتخمين
  r.get(
    '/orders/:id',
    rateLimit({ windowMs: 60000, max: 120, keyFn: (req) => 'status:' + (req.ip || 'x') }),
    h(async (req, res) => {
      res.json(await ordersService.publicStatus(db, req.params.id));
    })
  );

  return r;
};

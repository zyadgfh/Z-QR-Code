import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, api, NILE_OWNER } from './helpers.mjs';

const ORDER_BODY = { table: 7, items: [{ item_id: 'nit_tea', qty: 1, option_ids: [] }] };

async function loginOwner(base) {
  const r = await api(base, '/api/auth/login', { method: 'POST', body: NILE_OWNER });
  assert.equal(r.status, 200);
  return r.json.token;
}

function rawGet(base, path, token, etag) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + path);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, ...(etag ? { 'if-none-match': etag } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function openStream(base, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + '/api/shop/orders/stream?t=' + encodeURIComponent(token));
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', headers: { accept: 'text/event-stream' } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        resolve({ req, buf: () => buf, status: res.statusCode });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function waitFor(fn, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (fn()) return resolve(true);
      if (Date.now() - t0 > ms) return reject(new Error('timeout waiting for condition'));
    }, 100);
  });
}

test('ETag: قائمة الطلبات تعيد 304 مع If-None-Match، وتتغير عند طلب جديد', async () => {
  const { base } = await startServer();
  const token = await loginOwner(base);

  const r1 = await rawGet(base, '/api/shop/orders', token);
  assert.equal(r1.status, 200);
  const etag = r1.headers.etag;
  assert.ok(etag, 'ETag موجود');

  const r2 = await rawGet(base, '/api/shop/orders', token, etag);
  assert.equal(r2.status, 304);

  await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: ORDER_BODY });
  const r3 = await rawGet(base, '/api/shop/orders', token, etag);
  assert.equal(r3.status, 200); // تغير المحتوى → ETag جديد
  assert.notEqual(r3.headers.etag, etag);
});

test('SSE: طلب عام جديد يبث «changed» للمشترك خلال ثوانٍ', async () => {
  const { base } = await startServer();
  const token = await loginOwner(base);

  const stream = await openStream(base, token);
  assert.equal(stream.status, 200);
  await waitFor(() => stream.buf().includes(': connected'));

  await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: ORDER_BODY });
  await waitFor(() => stream.buf().includes('data: changed'));
  stream.req.destroy();
});

test('Notifier: طلب جديد يرسل تيليجرام عند توفر التوكن والربط، ولا يرسل بغيابه', async () => {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const { base, db } = await startServer({ env: { TELEGRAM_BOT_TOKEN: 'TELE1' } });

    // قبل الربط: لا رسائل تيليجرام
    await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: ORDER_BODY });
    assert.ok(!calls.some((c) => c.url.includes('api.telegram.org')), 'بلا chat_id لا إرسال');

    // ربط المحادثة بالمحل ثم طلب جديد → رسالة فيها رقم الطاولة والمجموع
    await db.update('shops', 'shop_nile', { notify_telegram_chat_id: '777' });
    await api(base, '/api/public/shops/nile-cafe/orders', { method: 'POST', body: ORDER_BODY });
    const tg = calls.find((c) => c.url.includes('api.telegram.org'));
    assert.ok(tg, 'رسالة تيليجرام أُرسلت');
    assert.ok(tg.body.includes('777'), 'chat_id الصحيح');
    assert.ok(tg.body.includes('طاولة') || tg.body.includes('\\u0637\\u0627\\u0648\\u0644\\u0629'), 'ذكر الطاولة');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Web Push: المفتاح معطل بلا VAPID، وتسجيل/إلغاء اشتراك يعملان', async () => {
  const { base, db } = await startServer();
  const token = await loginOwner(base);

  const k = await api(base, '/api/shop/push/key', { token });
  assert.equal(k.status, 200);
  assert.equal(k.json.enabled, false);

  const sub = { endpoint: 'https://fcm.googleapis.com/qm-test-sub', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };
  const s = await api(base, '/api/shop/push/subscribe', { method: 'POST', token, body: { subscription: sub } });
  assert.equal(s.status, 200);
  const subs1 = await db.query('push_subscriptions', [{ field: 'shop_id', value: 'shop_nile' }]);
  assert.equal(subs1.length, 1);
  assert.equal(subs1[0].endpoint, sub.endpoint);

  const bad = await api(base, '/api/shop/push/subscribe', { method: 'POST', token, body: { subscription: { endpoint: 'x' } } });
  assert.equal(bad.status, 400);

  const u = await api(base, '/api/shop/push/unsubscribe', { method: 'POST', token, body: { endpoint: sub.endpoint } });
  assert.equal(u.status, 200);
  const subs2 = await db.query('push_subscriptions', []);
  assert.equal(subs2.length, 0);
});

test('ويب هوك تيليجرام: سري خاطئ مرفوض، وربط /start {slug} يخزن chat_id', async () => {
  const { base, db } = await startServer({ env: { TELEGRAM_WEBHOOK_SECRET: 'S1', TELEGRAM_BOT_TOKEN: 'T1' } });

  const denied = await rawPost(base, '/api/public/notify/telegram', { message: { chat: { id: 5 }, text: '/start nile-cafe' } }, 'WRONG');
  assert.equal(denied.status, 401);

  await rawPost(base, '/api/public/notify/telegram', { message: { chat: { id: 5 }, text: '/start nile-cafe' } }, 'S1');
  const shop = await db.get('shops', 'shop_nile');
  assert.equal(shop.notify_telegram_chat_id, '5');
});

function rawPost(base, path, body, secret) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + path);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });
}

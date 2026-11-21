'use strict';

/**
 * مجموعة أدوات الاختبار: خادم مؤقت على منفذ عشوائي بمحوّل الذاكرة + عميل HTTP
 * مبني على node:http (لا يستخدم globalThis.fetch حتى تظل الاختبارات صالحة
 * عند تهكير fetch لاختبار نداءات الـ AI).
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import { after } from 'node:test';
const require = createRequire(import.meta.url);

const { MemoryDB } = require('../server/db/memory');
const { createApp } = require('../server/app');

const servers = [];

export async function startServer({ env = {}, seed = true } = {}) {
  const db = new MemoryDB();
  const { app } = createApp({
    db,
    seed,
    env: { DB_ADAPTER: 'memory', JWT_SECRET: 'test-secret', ...env },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  if (db.ready) await db.ready;
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, db };
}

/** يُستدعى في hook بعد كل ملف اختبار حتى تنتهي العمليات */
export function cleanupServers() {
  for (const s of servers) {
    try {
      s.closeAllConnections?.();
      s.close();
    } catch {}
  }
  servers.length = 0;
}

after(cleanupServers);

function request(base, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export async function api(base, path, { method = 'GET', token, body } = {}) {
  const raw = await request(base, path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = JSON.parse(raw.buffer.toString('utf8'));
  } catch {
    /* ردود ثنائية أو فارغة */
  }
  return { status: raw.status, json };
}

export async function raw(base, path) {
  return request(base, path);
}

export async function login(base, email, password) {
  const { status, json } = await api(base, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status} ${JSON.stringify(json)}`);
  return json.token;
}

export const ADMIN = { email: 'admin@qrmenu.app', password: 'admin123' };
export const NILE_OWNER = { email: 'owner@nile.app', password: 'owner123' };
export const NILE_STAFF = { email: 'staff@nile.app', password: 'staff123' };
export const BURGER_OWNER = { email: 'owner@burger.app', password: 'owner123' };

export { MemoryDB };

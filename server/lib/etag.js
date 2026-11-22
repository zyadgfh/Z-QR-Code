'use strict';

const crypto = require('crypto');

/**
 * إرسال JSON مع ETag — يجعل الاستقصاء الرخيص ممكنًا (304 بلا جسم):
 * عميل اللوحة والزبون يستطلعان بنفس الوتيرة لكن الجسم ينتقل فقط عند تغير حقيقي.
 */
function sendWithEtag(req, res, data) {
  const body = JSON.stringify(data);
  const etag = `"${crypto.createHash('sha1').update(body).digest('hex')}"`;
  res.set('etag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.set('content-type', 'application/json; charset=utf-8');
  res.status(200).send(body);
}

module.exports = { sendWithEtag };

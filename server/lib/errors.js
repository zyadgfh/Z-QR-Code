'use strict';

/** خطأ HTTP معروف — يتحول لرد JSON منسّق */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** يلفّ دوال الـ routes والـ middleware الـ async حتى تصل الأخطاء للـ error handler */
function h(fn) {
  return (...args) => {
    const next = args[2];
    Promise.resolve(fn(...args)).catch((err) => {
      if (typeof next === 'function') next(err);
      else throw err;
    });
  };
}

module.exports = { HttpError, h };

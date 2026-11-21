// Vercel entry point: يصدّر تطبيق Express كـ serverless function.
// كل نداءات /api/* بتتحوّل لهنا عن طريق vercel.json (rewrites).
// في إنتاج Vercel يكون DB_ADAPTER=firestore فلا حاجة للانتظار على البذر.
const { createApp } = require('../server/app');

const { app } = createApp();

module.exports = app;

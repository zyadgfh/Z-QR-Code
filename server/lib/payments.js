'use strict';

/**
 * واجهة مزوّد الدفع المجردة (BIZ-01 الجسر اليدوي — قرار سؤال 2 في /grillme):
 * اليوم: مزوّد 'manual' — يحوّل المالك يدويًا والأدمن يعلم «تم الدفع» ويُصدر فاتورة.
 * غدًا: Paymob/Stripe — أضف مزوّدًا جديدًا هنا (checkout session + webhook يرفع
 * paid_until) دون لمس منطق الاشتراك أو القفل الخادمي الموجود.
 */
function createPaymentProvider(env) {
  const provider = (env.PAYMENT_PROVIDER || 'manual').toLowerCase();
  return {
    provider,
    async createInvoice({ amount, currency = 'EGP', description }) {
      const invoiceNo = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      // مزوّد خارجي مستقبليًا: أنشئ checkout هنا وأرجع رابط الدفع
      return { provider, invoice_no: invoiceNo, amount, currency, description };
    },
  };
}

module.exports = { createPaymentProvider };

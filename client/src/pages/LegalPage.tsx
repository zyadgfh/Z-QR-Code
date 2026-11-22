import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Lang } from '../lib/i18n';

/** صفحات قانونية عامة (D6): سياسة الخصوصية + الشروط والأحكام — عربي/إنجليزي */
export default function LegalPage() {
  const loc = useLocation();
  const kind: 'privacy' | 'terms' = loc.pathname.includes('terms') ? 'terms' : 'privacy';
  const [lang, setLang] = useState<Lang>((new URLSearchParams(loc.search).get('lang') as Lang) || 'ar');
  // هوية المنصة الحية من إعدادات المنصة (D7) — بلا نصوص مقحرة
  const [platform, setPlatform] = useState<{ name: string; description: string } | null>(null);
  useEffect(() => {
    api<{ name: string; description: string }>('/api/public/platform').then(setPlatform).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const c = CONTENT[kind][lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div dir={dir} className="mx-auto min-h-dvh max-w-2xl bg-[#f5f5f7] px-5 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Link to={`/?lang=${lang}`} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold text-stone-600 shadow-sm transition active:scale-95">
          ‹ {c.back}
        </Link>
        <h1 className="flex-1 text-lg font-black text-stone-900">{c.title}</h1>
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="rounded-full bg-white px-3.5 py-1.5 text-sm font-extrabold text-stone-600 shadow-sm transition active:scale-95"
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      <p className="mb-5 text-xs font-bold text-stone-400">{c.updated}</p>

      <div className="space-y-3">
        {c.sections.map((s, i) => (
          <section key={i} className="rounded-3xl border border-black/[0.04] bg-white p-5 shadow-apple">
            <h2 className="mb-2 text-sm font-black text-stone-800">{i + 1}. {s.h}</h2>
            {s.p.map((p, j) => (
              <p key={j} className="mb-1.5 text-sm font-semibold leading-relaxed text-stone-600">{p}</p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-xs font-bold text-stone-400" dir="auto">
        {platform ? `${platform.name} · ${platform.description || (lang === 'ar' ? 'منصة قوائم المطاعم برمز QR' : 'QR menu platform')}` : lang === 'ar' ? 'منصة قوائم المطاعم برمز QR' : 'QR menu platform'}
      </p>
    </div>
  );
}

type Section = { h: string; p: string[] };
type Content = {
  title: string;
  back: string;
  updated: string;
  sections: Section[];
};

const CONTENT: Record<'privacy' | 'terms', Record<'ar' | 'en', Content>> = {
  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      back: 'الرئيسية',
      updated: 'آخر تحديث: نوفمبر 2025',
      sections: [
        {
          h: 'ما نجمعه',
          p: [
            'بيانات المحل: اسم المحل، الشعار، محتوى المنيو، مواعيد العمل، وبيانات التواصل التي يدخلها صاحب المحل.',
            'بيانات الطلب: الأصناف المطلوبة، رقم الطاولة أو نوع الخدمة، ملاحظاتك، وكود الخصم إن وُجد.',
            'رقم الهاتف: يُستخدم فقط ضمن برنامج الولاء إن فعّله المحل — يُنشئ به رصيد نقاطك لدى ذلك المحل وحده.',
            'بيانات تقنية محدودة (عنوان IP مجهولًا لأغراض منع إساءة الاستخدام) دون تتبّع إعلاني أو ملفات تعريف إعلانية.',
          ],
        },
        {
          h: 'ما لا نفعله',
          p: [
            'لا نبيع بياناتك ولا نشاركها مع أطراف إعلانية.',
            'لا نستخدم رقم هاتفك في أي رسائل تسويقية إلا إذا اشتركت في ذلك من المحل نفسه.',
          ],
        },
        {
          h: 'أين تُخزن البيانات',
          p: [
            'تُحفظ البيانات على Google Cloud (Firebase/Firestore) داخل مراكز بيانات مؤمّنة، والوصول إليها مقيّد بفريق المنصة ومالك المحل فقط.',
          ],
        },
        {
          h: 'حقوقك',
          p: [
            'يمكنك طلب حذف بيانات طلباتك أو رصيد الولاء عبر صاحب المحل أو التواصل معنا.',
            'الطلبات تُحفظ لدى المحل لأغراض تشغيلية ومحاسبية.',
          ],
        },
        {
          h: 'التواصل',
          p: ['لأي استفسار حول الخصوصية راسل فريق المنصة عبر قناة التواصل المعلنة لدى المحل أو مالك المنصة.'],
        },
      ],
    },
    en: {
      title: 'Privacy Policy',
      back: 'Home',
      updated: 'Last updated: November 2025',
      sections: [
        {
          h: 'What we collect',
          p: [
            'Shop data: name, logo, menu content, opening hours and contact details entered by the shop owner.',
            'Order data: items ordered, table number or service type, your note, and any discount code.',
            'Phone number: used only within the loyalty program if the shop enables it — it builds your points balance for that shop only.',
            'Limited technical data (anonymized IP) for abuse prevention. No ad tracking or advertising profiles.',
          ],
        },
        {
          h: 'What we never do',
          p: ['We never sell your data or share it with advertising parties.', 'We never use your phone for marketing unless you opted in with that shop.'],
        },
        {
          h: 'Where data lives',
          p: ['Data is stored on Google Cloud (Firebase/Firestore) in secured data centers, access restricted to the platform team and the shop owner.'],
        },
        {
          h: 'Your rights',
          p: [
            'You may request deletion of your order data or loyalty balance via the shop owner or by contacting us.',
            'Orders are retained by the shop for operational and accounting purposes.',
          ],
        },
        {
          h: 'Contact',
          p: ['For privacy questions, reach the platform team via the contact channel published by the shop or the platform owner.'],
        },
      ],
    },
  },
  terms: {
    ar: {
      title: 'الشروط والأحكام',
      back: 'الرئيسية',
      updated: 'آخر تحديث: نوفمبر 2025',
      sections: [
        {
          h: 'وصف الخدمة',
          p: [
            'Z-QR-Code منصة تُمكّن المطاعم والمقاهي من عرض قائمتها واستقبال الطلبات عبر رمز QR.',
            'يُنشأ حساب المحل بواسطة إدارة المنصة فقط — لا يوجد تسجيل ذاتي للمحلات.',
          ],
        },
        {
          h: 'الاشتراك والفواتير',
          p: [
            'المحلات تُشترك بخطة (مجانية/احترافية) وفق الحدود المعلنة، وتُصدر فاتورة الاشتراك باسم المحل الأم واحدًا حتى مع وجود فروع متعددة.',
            'تجاوز حدود الخطة المجانية يوقف استقبال الطلبات حتى الترقية أو تجديد الدورة.',
          ],
        },
        {
          h: 'مسؤولية المحل',
          p: [
            'محتوى المنيو والأسعار ومسببات الحساسية ومواعيد العمل مسؤولية صاحب المحل حصرًا.',
            'الطلب إدخالٌ للزبون عبر المنصة، لكنه عقدُ بيع بين الزبون والمحل مباشرة — المنصة وسيط تقني لا تتحمل مسؤولية التنفيذ.',
          ],
        },
        {
          h: 'الاستخدام المقبول',
          p: [
            'يُمنع استخدام المنصة لأي محتوى مخالف للقانون أو مضلل، ويحق لإدارة المنصة إيقاف أو أرشفة أي محل مخالف.',
            'محاولات التلاعب بأرصدة الولاء أو أكواد الخصم أو تجاوز حدود المعدل تُرفض خادميًا وقد تؤدي لإيقاف الحساب.',
          ],
        },
        {
          h: 'تعديل الشروط',
          p: ['قد تُحدَّث هذه الشروط، ويسري تحديثها على جميع المستخدمين من تاريخ النشر.'],
        },
      ],
    },
    en: {
      title: 'Terms & Conditions',
      back: 'Home',
      updated: 'Last updated: November 2025',
      sections: [
        {
          h: 'Service description',
          p: [
            'Z-QR-Code is a platform enabling restaurants and cafés to publish their menu and receive orders via a QR code.',
            'Shop accounts are created by the platform administration only — there is no self-registration for shops.',
          ],
        },
        {
          h: 'Subscription & billing',
          p: [
            'Shops subscribe to a plan (free/pro) with the published limits; the subscription invoice is issued once for the parent shop even with multiple branches.',
            'Exceeding free-plan limits pauses order intake until upgrade or cycle renewal.',
          ],
        },
        {
          h: 'Shop responsibility',
          p: [
            'Menu content, prices, allergens and opening hours are the sole responsibility of the shop owner.',
            'An order is submitted through the platform but constitutes a sale contract directly between the customer and the shop — the platform is a technical intermediary.',
          ],
        },
        {
          h: 'Acceptable use',
          p: [
            'Illegal or misleading content is prohibited; the platform may suspend or archive violating shops.',
            'Manipulating loyalty balances or discount codes or exceeding rate limits is rejected server-side and may lead to suspension.',
          ],
        },
        {
          h: 'Changes to terms',
          p: ['These terms may be updated and apply to all users from the date of publication.'],
        },
      ],
    },
  },
};

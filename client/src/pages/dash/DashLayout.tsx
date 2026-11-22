import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, Membership } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { dashT } from '../../lib/i18n';
import { Btn, Spinner, StatusChip } from '../../components/ui';
import { fadeInUp } from '../../lib/anim';
import MfaGate from '../../components/MfaGate';
import { useIdleLogout } from '../../components/useIdleLogout';

/** هيكل لوحة المحل بأسلوب macOS: شريط علوي زجاجي، جانب أنيق، محتوى ناعم */
export default function DashLayout() {
  const { token, me, loadMe, logout } = useAuth();
  const { lang, set: setLang } = useDashLang();
  const t = dashT(lang);
  useDocDir(lang);
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/dash/login', { replace: true });
      return;
    }
    loadMe().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // خمول 30 دقيقة → خروج تلقائي مع إشعار (SEC-02)
  useIdleLogout(() => {
    useAuth.getState().logout();
    navigate('/dash/login?idle=1');
  }, 30);

  useEffect(() => {
    if (ready && me) fadeInUp(mainRef.current);
  }, [ready, me]);

  if (!ready) return <Spinner label={t('loading')} />;
  if (!me) return <Navigate to="/dash/login" replace />;

  // بوابة التحقق بخطوتين الإلزامية (SEC-03) — تمنع الوصول للوحة قبل التفعيل
  if (me.user.mfa_enforced && !me.user.mfa_enabled) {
    return (
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-[#f5f5f7]">
        <MfaGate />
      </div>
    );
  }

  const mem: Membership | undefined = me.memberships[0];
  if (!mem) {
    if (me.user.role === 'platform_admin') return <Navigate to="/admin" replace />;
    return (
      <Center>
        <p className="font-bold text-stone-500">لا يوجد محل مرتبط بهذا الحساب</p>
        <Btn variant="ghost" onClick={logout}>{t('logout')}</Btn>
      </Center>
    );
  }

  const { shop, role } = mem;
  const locked = shop.status === 'locked';
  const warnDays = shop.days_left <= 3 && !locked;
  const warnText =
    shop.status === 'trial' ? t('trialBanner', { n: shop.days_left }) : t('paidBanner', { n: shop.days_left });

  const navItems = [
    { to: '/dash', label: t('orders'), icon: '🧾', show: true },
    { to: '/dash/kds', label: t('kdsTitle'), icon: '👨‍🍳', show: true },
    { to: '/dash/menu', label: t('menu'), icon: '📋', show: role === 'owner' },
    { to: '/dash/tables', label: t('tables'), icon: '▦', show: role === 'owner' },
    { to: '/dash/staff', label: t('staff'), icon: '👥', show: role === 'owner' },
    { to: '/dash/settings', label: t('settings'), icon: '⚙️', show: role === 'owner' },
  ].filter((n) => n.show);

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-[#f5f5f7]">
      {/* شريط علوي زجاجي */}
      <header className="glass no-print sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-sm font-black text-white shadow-apple">
              {shop.name.trim().charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-stone-900">{shop.name}</p>
              <p className="text-[11px] font-semibold text-stone-400" dir="ltr">/{shop.slug}</p>
            </div>
            <StatusChip status={shop.status} t={t} />
          </div>
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-extrabold text-stone-600 shadow-sm backdrop-blur transition hover:bg-white"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button onClick={() => { logout(); navigate('/dash/login'); }} className="rounded-full px-3 py-1.5 text-xs font-bold text-stone-400 transition hover:bg-black/5">
            {t('logout')}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-4 p-4">
        {/* تنقل جانبي بأسلوب macOS */}
        <nav className="no-print sticky top-20 hidden h-fit w-48 shrink-0 flex-col gap-1 rounded-3xl border border-black/[0.04] bg-white/80 p-2 shadow-apple backdrop-blur sm:flex">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/dash'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition ${
                  isActive
                    ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-apple'
                    : 'text-stone-600 hover:bg-black/5'
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <main ref={mainRef} className="min-w-0 flex-1">
          {/* تنقل سفلي (موبايل) */}
          <nav className="no-print mb-3 flex gap-1.5 overflow-x-auto sm:hidden">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/dash'}
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${
                    isActive
                      ? 'bg-teal-700 text-white shadow-apple'
                      : 'border border-black/[0.05] bg-white/80 text-stone-600 backdrop-blur'
                  }`
                }
              >
                {n.icon} {n.label}
              </NavLink>
            ))}
          </nav>

          {/* تنبيه التجربة/الاشتراك */}
          {warnDays && (
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-800">
              ⏳ {warnText}
            </div>
          )}

          {/* القفل الكامل */}
          {locked ? (
            role === 'owner' ? (
              <RenewCard mem={mem} />
            ) : (
              <div className="rounded-3xl border border-black/[0.04] bg-white p-8 text-center shadow-apple">
                <p className="mb-1 text-4xl">🔒</p>
                <p className="text-lg font-extrabold text-stone-700">الاشتراك منتهي</p>
                <p className="mt-1 text-sm text-stone-500">تواصل مع صاحب المحل لتفعيل الاشتراك</p>
              </div>
            )
          ) : (
            <Outlet context={{ mem }} />
          )}
        </main>
      </div>
    </div>
  );
}

function RenewCard({ mem }: { mem: Membership }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [details, setDetails] = useState<{ monthly_price: number; payment_instructions: string } | null>(null);

  useEffect(() => {
    fetch('/api/shop/summary', { headers: { authorization: `Bearer ${useAuth.getState().token}` } })
      .then((r) => r.json())
      .then((d) => d.subscription && setDetails(d.subscription))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-black/[0.04] bg-white p-7 text-center shadow-apple">
      <p className="mb-2 text-5xl">🔒</p>
      <h2 className="text-xl font-extrabold text-stone-900">{t('renewTitle')}</h2>
      <p className="mt-2 text-sm text-stone-500">{t('renewBody')}</p>
      {details && (
        <div className="mt-4 rounded-2xl bg-[#f5f5f7] p-4 text-start">
          <p className="mb-1 text-sm">
            <span className="font-bold text-stone-500">{t('monthlyPrice')}: </span>
            <span className="font-extrabold text-teal-700">{details.monthly_price} ج.م</span>
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600">{details.payment_instructions}</p>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>;
}

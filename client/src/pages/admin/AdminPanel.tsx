import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, fmtDate } from '../../lib/i18n';
import { useAuth, Me } from '../../stores/auth';
import { useDashLang, useDocDir } from '../../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Input, Modal, Ok, Select, Spinner, StatusChip, Textarea } from '../../components/ui';
import ChangePasswordCard from '../../components/ChangePassword';
import SecurityCard from '../../components/SecurityCard';
import MfaGate from '../../components/MfaGate';
import { useIdleLogout } from '../../components/useIdleLogout';
import { staggerCards } from '../../lib/anim';

type AdminShop = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  owner_email: string | null;
  created_at: number;
  trial_ends_at: number;
  paid_until: number | null;
  status: 'trial' | 'active' | 'locked';
  table_count: number;
  plan?: 'free' | 'pro';
  archived?: boolean;
};

type PlatformSettings = { monthly_price: number; payment_instructions: string; free_item_limit?: number; free_order_limit?: number; platform_name?: string;
  platform_description?: string;
  support_email?: string;
  default_language?: 'ar' | 'en';
};

type Overview = {
  shops_total: number;
  shops_free: number;
  shops_pro: number;
  shops_trial: number;
  shops_active: number;
  shops_locked: number;
  shops_archived: number;
  orders_today: number;
  orders_month: number;
  items_total: number;
  mrr_estimate: number;
  monthly_price: number;
};

const fmtEGP = (n: number) => `${n.toLocaleString('en-US')} EGP`;

export default function AdminPanel() {
  const { token, me, loadMe } = useAuth();
  const { lang, set: setLang } = useDashLang();
  const t = dashT(lang);
  useDocDir(lang);

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'overview' | 'shops' | 'settings'>('overview');
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [creating, setCreating] = useState(false);
  const [secBusy, setSecBusy] = useState<string | null>(null);
  const [secSaved, setSecSaved] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState<AdminShop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  // دخول متدرج للبطاقات وصفوف الجدول عند كل تحديث
  useEffect(() => {
    if (tab === 'overview' && overview) staggerCards(cardsRef.current);
    if (tab === 'shops' && shops) staggerCards(tableRef.current);
  }, [tab, shops, overview]);

  const isAdmin = me?.user.role === 'platform_admin';

  // خمول 30 دقيقة → خروج تلقائي (SEC-02)
  useIdleLogout(() => {
    useAuth.getState().logout();
    window.location.assign('/admin?idle=1');
  }, 30);

  const load = useCallback(async () => {
    try {
      const [s, st, ov] = await Promise.all([
        api<AdminShop[]>(`/api/admin/shops${showArchived ? '?archived=1' : ''}${q.trim() ? `${showArchived ? '&' : '?'}q=${encodeURIComponent(q.trim())}` : ''}`),
        api<PlatformSettings>('/api/admin/settings'),
        api<Overview>('/api/admin/overview'),
      ]);
      setShops(s);
      setSettings(st);
      setOverview(ov);
    } catch (e: any) {
      setError(e.message);
    }
  }, [showArchived, q]);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }
    loadMe().then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // بحث بتهدئة 350ms
  useEffect(() => {
    const id = setTimeout(() => {
      if (isAdmin) load();
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!ready) return <Spinner label={t('loading')} />;
  if (!isAdmin) return <AdminLogin idle={new URLSearchParams(window.location.search).get('idle') === '1'} />;

  // بوابة التحقق بخطوتين الإلزامية لأدمن المنصة (SEC-03)
  if (me && me.user.mfa_enforced && !me.user.mfa_enabled) {
    return (
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-[#f5f5f7]">
        <MfaGate />
      </div>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn;
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveSection = async (key: string, patch: Record<string, unknown>) => {
    setError(null);
    setSecBusy(key);
    try {
      const out = await api<PlatformSettings>('/api/admin/settings', { method: 'PUT', body: patch });
      setSettings((cur) => (cur ? { ...cur, ...out } : out));
      setSecSaved(key);
      setTimeout(() => setSecSaved((k) => (k === key ? null : k)), 2500);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setSecBusy(null);
  };

  const exportCsv = async (s: AdminShop) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/shops/${s.id}/orders/export`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `orders-${s.slug}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const tabs: Array<{ id: typeof tab; label: string; icon: string }> = [
    { id: 'overview', label: t('tabOverview'), icon: '📊' },
    { id: 'shops', label: t('tabShops'), icon: '🏪' },
    { id: 'settings', label: t('tabSettings'), icon: '⚙️' },
  ];

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-dvh bg-stone-100 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex items-center gap-3">
          <h1 className="text-xl font-extrabold text-stone-800">🛡 {t('adminTitle')}</h1>
          <span className="text-xs text-stone-400" dir="ltr">{me?.user.email}</span>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="ms-auto rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-stone-600 shadow-sm">
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </header>

        {/* التبويبات */}
        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-extrabold transition ${tab === x.id ? 'bg-teal-700 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100'}`}
            >
              {x.icon} {x.label}
            </button>
          ))}
        </div>

        {error && <Err error={error} />}

        {/* ---------- نظرة عامة ---------- */}
        {tab === 'overview' && overview && (
          <div ref={cardsRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard icon="🏪" label={t('metricShops')} value={String(overview.shops_total)} sub={`${t('metricTrial')}: ${overview.shops_trial}`} />
            <MetricCard icon="⭐" label={t('metricPro')} value={String(overview.shops_pro)} sub={`${t('planFree')}: ${overview.shops_free}`} accent />
            <MetricCard icon="🔒" label={t('metricLocked')} value={String(overview.shops_locked)} sub={`${t('metricArchived')}: ${overview.shops_archived}`} />
            <MetricCard icon="💰" label={t('metricMrr')} value={fmtEGP(overview.mrr_estimate)} sub={`${t('monthlyPrice')}: ${fmtEGP(overview.monthly_price)}`} accent />
            <MetricCard icon="🧾" label={t('metricOrdersToday')} value={String(overview.orders_today)} />
            <MetricCard icon="📅" label={t('metricOrdersMonth')} value={String(overview.orders_month)} />
            <MetricCard icon="🍽" label={t('metricItems')} value={String(overview.items_total)} />
            <button data-card onClick={() => setTab('settings')} className="rounded-3xl bg-white p-5 text-start shadow-sm transition hover:shadow-md">
              <p className="text-xs font-black text-stone-400">🔐 {t('security')}</p>
              <p className="mt-1 text-sm font-extrabold text-stone-700">{t('changePassword')} · 2FA</p>
              <p className="mt-2 text-xs font-bold text-teal-700">→ {t('tabSettings')}</p>
            </button>
          </div>
        )}

        {/* ---------- المحلات ---------- */}
        {tab === 'shops' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('searchShops')}
                className="!w-full sm:!w-72"
                dir="auto"
              />
              <Btn variant="soft" onClick={() => setShowArchived((v) => !v)}>
                🗂 {showArchived ? t('tabShops') : t('metricArchived')}
              </Btn>
              <Btn className="ms-auto" onClick={() => setCreating(true)}>＋ {t('createShop')}</Btn>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              {!shops ? (
                <Spinner label={t('loading')} />
              ) : shops.length === 0 ? (
                <p className="py-6 text-center text-sm font-bold text-stone-400">{q ? t('searchShops') : t('noShops')}</p>
              ) : (
                <div ref={tableRef} className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-start text-xs text-stone-400">
                        <th className="p-2 text-start">{t('shopName')}</th>
                        <th className="p-2 text-start">{t('owner')}</th>
                        <th className="p-2 text-start">{t('tableCount')}</th>
                        <th className="p-2 text-start">{t('trialEndsAt')}</th>
                        <th className="p-2 text-start">{t('paidUntilAt')}</th>
                        <th className="p-2 text-start">{t('status')}</th>
                        <th className="p-2 text-start">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shops.map((s) => (
                        <tr key={s.id} data-card className="border-t border-stone-100">
                          <td className="p-2">
                            <p className="font-extrabold text-stone-800">
                              {s.name}
                              {s.archived && <span className="ms-1 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-black text-stone-500">🗂 {t('archivedShop')}</span>}
                            </p>
                            <p className="text-[11px] text-stone-400" dir="ltr">/{s.slug}</p>
                          </td>
                          <td className="p-2 text-xs text-stone-500" dir="ltr">{s.owner_email}</td>
                          <td className="p-2">{s.table_count}</td>
                          <td className="p-2 text-xs">{fmtDate(lang, s.trial_ends_at)}</td>
                          <td className="p-2 text-xs">{fmtDate(lang, s.paid_until)}</td>
                          <td className="p-2">{s.archived ? <span className="text-xs font-black text-stone-400">🗂</span> : <StatusChip status={s.status} t={t} />}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1.5">
                              {!s.archived && (
                                <>
                                  <select
                                    value={s.plan || 'free'}
                                    onChange={(e) => act(() => api(`/api/admin/shops/${s.id}/plan`, { method: 'POST', body: { plan: e.target.value } }))}
                                    className="rounded-xl border border-stone-300 px-2 py-1.5 text-xs font-extrabold text-stone-600"
                                  >
                                    <option value="free">{t('planFree')}</option>
                                    <option value="pro">{t('planPro')} ⭐</option>
                                  </select>
                                  <Btn variant="soft" onClick={() => act(() => api(`/api/admin/shops/${s.id}/mark-paid`, { method: 'POST', body: { months: 1 } }))}>💳 {t('markPaid')}</Btn>
                                  {s.status === 'locked' ? (
                                    <Btn onClick={() => act(() => api(`/api/admin/shops/${s.id}/lock`, { method: 'POST', body: { locked: false } }))}>🔓 {t('unlock')}</Btn>
                                  ) : (
                                    <Btn variant="danger" onClick={() => act(() => api(`/api/admin/shops/${s.id}/lock`, { method: 'POST', body: { locked: true } }))}>🔒 {t('lock')}</Btn>
                                  )}
                                  <Btn variant="ghost" onClick={() => setResetPw(s)}>🔑</Btn>
                                  <Btn variant="ghost" onClick={() => exportCsv(s)}>⬇ CSV</Btn>
                                  <Btn
                                    variant="ghost"
                                    onClick={() => {
                                      if (window.confirm(t('archiveWarn'))) act(() => api(`/api/admin/shops/${s.id}/archive`, { method: 'POST', body: { archived: true } }));
                                    }}
                                  >
                                    🗂 {t('archive')}
                                  </Btn>
                                </>
                              )}
                              {s.archived && (
                                <Btn onClick={() => act(() => api(`/api/admin/shops/${s.id}/archive`, { method: 'POST', body: { archived: false } }))}>♻️ {t('restore')}</Btn>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- الإعدادات ---------- */}
        {tab === 'settings' && (
          <div className="space-y-4">
            {settings && (
              <>
                <Card data-card>
                  <CardHead icon="🌐" title={t('platformGeneral')} desc={t('platformGeneralDesc')} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('platformName')}>
                      <Input value={settings.platform_name ?? ''} onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })} />
                    </Field>
                    <Field label={t('supportEmail')}>
                      <Input dir="ltr" type="email" value={settings.support_email ?? ''} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} />
                    </Field>
                    <Field label={t('platformDesc')}>
                      <Textarea value={settings.platform_description ?? ''} onChange={(e) => setSettings({ ...settings, platform_description: e.target.value.slice(0, 300) })} rows={2} />
                    </Field>
                    <Field label={t('defaultLanguage')}>
                      <Select value={settings.default_language ?? 'ar'} onChange={(e) => setSettings({ ...settings, default_language: e.target.value as 'ar' | 'en' })}>
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Btn
                      onClick={() => saveSection('general', { platform_name: settings.platform_name ?? '', platform_description: settings.platform_description ?? '', support_email: settings.support_email ?? '', default_language: settings.default_language ?? 'ar' })}
                      disabled={secBusy === 'general'}
                    >
                      {secBusy === 'general' ? '…' : t('saveThisSection')}
                    </Btn>
                    {secSaved === 'general' && <Ok>{t('saved')}</Ok>}
                  </div>
                </Card>

                <Card data-card>
                  <CardHead icon="💳" title={t('settingsBilling')} desc={t('settingsBillingDesc')} />
                  <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                    <Field label={t('monthlyPrice')}>
                      <Input type="number" min={1} dir="ltr" value={settings.monthly_price} onChange={(e) => setSettings({ ...settings, monthly_price: Number(e.target.value) })} />
                    </Field>
                    <Field label={t('paymentInstructions')}>
                      <Textarea rows={3} value={settings.payment_instructions} onChange={(e) => setSettings({ ...settings, payment_instructions: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Btn
                      onClick={() => saveSection('billing', { monthly_price: settings.monthly_price, payment_instructions: settings.payment_instructions })}
                      disabled={secBusy === 'billing'}
                    >
                      {secBusy === 'billing' ? '…' : t('saveThisSection')}
                    </Btn>
                    {secSaved === 'billing' && <Ok>{t('saved')}</Ok>}
                  </div>
                </Card>

                <Card data-card>
                  <CardHead icon="🧩" title={t('settingsLimits')} desc={t('settingsLimitsDesc')} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('metricItems')}>
                      <Input type="number" min={1} dir="ltr" value={settings.free_item_limit ?? 50} onChange={(e) => setSettings({ ...settings, free_item_limit: Number(e.target.value) })} />
                    </Field>
                    <Field label={t('metricOrdersMonth')}>
                      <Input type="number" min={1} dir="ltr" value={settings.free_order_limit ?? 200} onChange={(e) => setSettings({ ...settings, free_order_limit: Number(e.target.value) })} />
                    </Field>
                  </div>
                  {overview && (
                    <p className="mt-3 rounded-2xl bg-[#f5f5f7] px-3.5 py-2.5 text-xs font-bold text-stone-500">
                      📡 {t('usedNow')}: {t('metricItems')} <b dir="ltr">{overview.items_total}</b> · {t('metricOrdersMonth')} <b dir="ltr">{overview.orders_month}</b> · {t('metricMrr')} <b dir="ltr">{fmtEGP(overview.mrr_estimate)}</b>
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    <Btn
                      onClick={() => saveSection('limits', { free_item_limit: settings.free_item_limit ?? 50, free_order_limit: settings.free_order_limit ?? 200 })}
                      disabled={secBusy === 'limits'}
                    >
                      {secBusy === 'limits' ? '…' : t('saveThisSection')}
                    </Btn>
                    {secSaved === 'limits' && <Ok>{t('saved')}</Ok>}
                  </div>
                </Card>
              </>
            )}
            <ChangePasswordCard />
            <SecurityCard />
          </div>
        )}
      </div>

      {creating && (
        <CreateShopModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            setTab('shops');
            await load();
          }}
        />
      )}

      {resetPw && (
        <ResetOwnerPasswordModal
          shop={resetPw}
          onClose={() => setResetPw(null)}
          onDone={async () => {
            setResetPw(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, sub, accent = false }: { icon: string; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div data-card className={`rounded-3xl p-5 shadow-sm ${accent ? 'bg-teal-800 text-white' : 'bg-white'}`}>
      <p className="text-xs font-black opacity-60">{icon} {label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? 'text-white' : 'text-stone-800'}`} dir="ltr">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-bold opacity-50" dir="auto">{sub}</p>}
    </div>
  );
}

function ResetOwnerPasswordModal({ shop, onClose, onDone }: { shop: AdminShop; onClose: () => void; onDone: () => void }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [result, setResult] = useState<{ email: string; password: string; generated: boolean } | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string; password: string; generated: boolean }>(`/api/admin/shops/${shop.id}/reset-owner-password`, {
        method: 'POST',
        body: custom.trim() ? { password: custom.trim() } : {},
      });
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`${result.email} / ${result.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* النسخ اليدوي متاح */ }
  };

  return (
    <Modal open onClose={onClose} title={`🔑 ${t('resetOwnerPassword')} — ${shop.name}`}>
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-500" dir="ltr">{shop.owner_email}</p>
          <Field label={`${t('ownerPassword')} (${t('generated')}؟)`}>
            <Input dir="ltr" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <p className="text-xs font-bold text-stone-400">{t('newPasswordOneTime')}</p>
          {error && <Err error={error} />}
          <Btn className="w-full py-2.5" onClick={run} disabled={busy}>{busy ? '…' : t('resetOwnerPassword')}</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-bold text-stone-600" dir="ltr">{result.email}</p>
          <div className="rounded-2xl bg-[#f5f5f7] p-4 text-center">
            <code className="font-mono text-xl font-black text-teal-800" dir="ltr">{result.password}</code>
            {result.generated && <p className="mt-1 text-[11px] font-bold text-stone-400">✨ {t('generated')}</p>}
          </div>
          <p className="text-xs font-bold leading-relaxed text-amber-700">⚠️ {t('newPasswordOneTime')}</p>
          {copied && <Ok>{t('copied')}</Ok>}
          <div className="flex gap-2">
            <Btn variant="soft" onClick={copy}>⧉</Btn>
            <Btn className="flex-1" onClick={onDone}>{t('save')}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateShopModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [form, setForm] = useState({ name: '', slug: '', phone: '', table_count: 5, menu_language: 'ar', owner_email: '', owner_password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/shops', { method: 'POST', body: form });
      onCreated();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} title={`＋ ${t('createShop')}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('shopName')}><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('slug')}><Input dir="ltr" value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="nile-cafe" /></Field>
          <Field label={t('phone')}><Input dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('tablesCount')}><Input type="number" min={1} max={100} value={form.table_count} onChange={(e) => set('table_count', Number(e.target.value))} /></Field>
          <Field label={t('menuLanguage')}>
            <Select value={form.menu_language} onChange={(e) => set('menu_language', e.target.value)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t('ownerEmail')}><Input dir="ltr" type="email" value={form.owner_email} onChange={(e) => set('owner_email', e.target.value)} /></Field>
          <Field label={t('ownerPassword')}><Input dir="ltr" type="text" value={form.owner_password} onChange={(e) => set('owner_password', e.target.value)} /></Field>
        </div>
        {error && <Err error={error} />}
        <Btn className="w-full py-2.5" onClick={submit} disabled={busy}>{busy ? '…' : t('createShop')}</Btn>
      </div>
    </Modal>
  );
}

function AdminLogin({ idle = false }: { idle?: boolean }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const setToken = useAuth((s) => s.setToken);
  const loadMe = useAuth((s) => s.loadMe);
  const [phase, setPhase] = useState<'checking' | 'bootstrap' | 'login' | 'mfa'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(idle ? t('idleNotice') : null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    fetch('/api/auth/admin-exists')
      .then((r) => r.json())
      .then((d) => setPhase(d?.exists ? 'login' : 'bootstrap'))
      .catch(() => setPhase('login'));
  }, []);

  const afterAuth = async (token: string) => {
    setToken(token);
    await loadMe();
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      // حساب مفعّل بـ 2FA → خطوة تحدٍّ ثانية بلا توكن كامل (SEC-03)
      if (json.mfa_required && json.mfa_token) {
        setMfaToken(json.mfa_token);
        setPhase('mfa');
        setBusy(false);
        return;
      }
      await afterAuth(json.token);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      await afterAuth(json.token);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError(t('passwordMismatch'));
    if (password.length < 10) return setError(lang === 'ar' ? 'كلمة المرور 10 أحرف على الأقل' : 'Password must be at least 10 characters');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'خطأ');
      await afterAuth(json.token);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={phase === 'bootstrap' ? submitBootstrap : phase === 'mfa' ? submitChallenge : submitLogin}
      className="mx-auto mt-10 w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"
    >
      <h2 className="mb-1 text-center text-lg font-extrabold text-stone-800">
        🛡 {phase === 'bootstrap' ? t('setupTitle') : phase === 'mfa' ? t('mfaChallenge') : t('adminExistsTitle')}
      </h2>
      {notice && <p className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{notice}</p>}
      {phase === 'bootstrap' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
          {t('setupHint')}
        </p>
      )}
      {phase === 'checking' ? (
        <p className="py-6 text-center text-sm text-stone-400">…</p>
      ) : phase === 'mfa' ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-500">{t('mfaChallengeDesc')}</p>
          <Field label={t('mfaChallenge')}>
            <Input dir="ltr" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
          </Field>
          {error && <Err error={error} />}
          <Btn type="submit" disabled={busy || !code} className="w-full py-2.5">
            {busy ? '…' : t('signin')}
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('email')}>
            <Input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label={t('password')}>
            <Input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={phase === 'bootstrap' ? 'new-password' : 'current-password'} />
          </Field>
          {phase === 'bootstrap' && (
            <Field label={t('confirmNewPassword')}>
              <Input type="password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {error && <Err error={error} />}
          <Btn type="submit" disabled={busy} className="w-full py-2.5">
            {busy ? '…' : phase === 'bootstrap' ? `🛡 ${t('createAdmin')}` : t('signin')}
          </Btn>
        </div>
      )}
    </form>
  );
}

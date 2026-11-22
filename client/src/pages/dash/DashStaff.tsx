import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dashT, fmtDate } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { Btn, Err, Field, Input, Spinner } from '../../components/ui';
import { staggerCards } from '../../lib/anim';

type Staff = { id: string; email: string; created_at: number; perms: { orders: boolean; menu: boolean; settings: boolean; prices: boolean } };
const PERMS = ['orders', 'menu', 'settings', 'prices'] as const;
type Perm = (typeof PERMS)[number];

export default function DashStaff() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [openPerms, setOpenPerms] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (staff?.length) staggerCards(listRef.current);
  }, [staff]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStaff(await api<Staff[]>('/api/shop/staff'));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/shop/staff', { method: 'POST', body: { email, password } });
      setEmail('');
      setPassword('');
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await api(`/api/shop/staff/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-black text-stone-400">👥 {t('staffAdd')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Field label={t('staffEmail')}><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
          <div className="w-44"><Field label={t('staffPassword')}><Input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field></div>
          <Btn onClick={add} disabled={busy || !email || password.length < 6}>＋ {t('staffAdd')}</Btn>
        </div>
        <p className="mt-2 text-[11px] font-bold text-stone-400">ℹ️ {t('staffNote')}</p>
        {error && <Err error={error} />}
      </div>

      <div ref={listRef} className="rounded-3xl bg-white p-3 shadow-sm">
        {!staff ? (
          <Spinner label={t('loading')} />
        ) : staff.length === 0 ? (
          <p className="p-4 text-center text-sm font-bold text-stone-400">{t('staffEmpty')}</p>
        ) : (
          staff.map((s) => (
            <Fragment key={s.id}>
            <div data-card className="flex items-center gap-3 border-b border-stone-100 px-3 py-2.5 last:border-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-xs font-black text-stone-500">👤</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-700" dir="ltr">{s.email}</p>
                <p className="text-[11px] text-stone-400">{fmtDate(lang, s.created_at)}</p>
              </div>
              <button
                onClick={() => setOpenPerms(openPerms === s.id ? null : s.id)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 hover:bg-stone-100"
              >
                🔑 {t('perms')}
              </button>
              <button onClick={() => remove(s.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-50">✕ {t('delete')}</button>
            </div>
            {openPerms === s.id && (
              <PermsPanel userId={s.id} perms={s.perms} lang={lang} onSaved={async () => setStaff(await api<Staff[]>('/api/shop/staff'))} />
            )}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}


const PERM_KEYS = { orders: 'permOrders', menu: 'permMenu', settings: 'permSettings', prices: 'permPrices' } as const;

function PermsPanel({ userId, perms, lang, onSaved }: { userId: string; perms: Staff['perms']; lang: 'ar' | 'en'; onSaved: () => void }) {
  const t = dashT(lang);
  const [state, setState] = useState(perms);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (p: Perm) => setState({ ...state, [p]: !state[p] });

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/shop/staff/${userId}/perms`, { method: 'PUT', body: state });
      setOk(true);
      setTimeout(() => setOk(false), 2000);
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="border-t border-stone-100 bg-[#fafafa] px-4 py-3">
      <p className="mb-2 text-[11px] font-bold text-stone-400">ℹ️ {t('permsHint')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PERMS.map((p) => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`rounded-2xl border px-3 py-2 text-xs font-extrabold transition active:scale-95 ${
              state[p] ? 'border-teal-700 bg-teal-50 text-teal-800 shadow-sm' : 'border-stone-200 bg-white text-stone-400'
            }`}
          >
            {state[p] ? '✓' : '×'} {t(PERM_KEYS[p])}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-teal-700 px-4 py-1.5 text-xs font-extrabold text-white transition active:scale-95 disabled:opacity-60"
        >
          {busy ? '…' : t('savePerms')}
        </button>
        {ok && <span className="text-xs font-bold text-teal-700">✓ {t('saved')}</span>}
        {err && <span className="text-xs font-bold text-red-600">{err}</span>}
      </div>
    </div>
  );
}

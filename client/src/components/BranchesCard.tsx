import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Card, CardHead, Err, Field, Input, Ok } from './ui';

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
};

/** الفروع (F-04) — إدارة صلاحية الإعدادات، فاتورة اشتراك واحدة للمحل الأم */
export default function BranchesCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [list, setList] = useState<Branch[] | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const flash = (k: string) => {
    setSavedKey(k);
    setTimeout(() => setSavedKey((x) => (x === k ? null : x)), 2000);
  };

  const load = async () => {
    try {
      setList(await api<Branch[]>('/api/shop/branches'));
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/shop/branches', { method: 'POST', body: { name, address: address || undefined, phone: phone || undefined } });
      setName('');
      setAddress('');
      setPhone('');
      flash('add');
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const patch = async (id: string, body: Record<string, unknown>, k: string) => {
    setError(null);
    try {
      await api(`/api/shop/branches/${id}`, { method: 'PUT', body });
      flash(k);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(lang === 'ar' ? 'حذف الفرع؟ الطلبات القديمة تحتفظ باسمه.' : 'Delete branch? Past orders keep its name.')) return;
    setError(null);
    try {
      await api(`/api/shop/branches/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card data-card>
      <CardHead icon="🏢" title={t('branches')} desc={t('branchesDesc')} />
      {error && <Err error={error} />}
      {list === null ? (
        <p className="text-sm font-bold text-stone-400">…</p>
      ) : list.length === 0 ? (
        <p className="text-sm font-bold text-stone-400">{t('noBranches')}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} data-card className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
              <span className="text-sm font-black text-stone-700">{b.name}</span>
              {b.address && <span className="text-xs font-bold text-stone-400">{b.address}</span>}
              <button
                onClick={() => patch(b.id, { active: !b.active }, `act-${b.id}`)}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition active:scale-95 ${b.active ? 'bg-teal-700 text-white' : 'bg-white text-stone-400 shadow-sm'}`}
              >
                {b.active ? '✓' : '×'} {t('branchActive')}
              </button>
              {savedKey === `act-${b.id}` && <Ok>{t('saved')}</Ok>}
              <Btn variant="ghost" className="ms-auto !px-2" onClick={() => remove(b.id)}>🗑</Btn>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-3">
        <Field label={t('branchName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('branchAddress')}><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label={t('branchPhone')}><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Btn onClick={add} disabled={busy || name.trim().length < 2}>{busy ? '…' : `＋ ${t('addBranch')}`}</Btn>
        {savedKey === 'add' && <Ok>{t('saved')}</Ok>}
      </div>
    </Card>
  );
}

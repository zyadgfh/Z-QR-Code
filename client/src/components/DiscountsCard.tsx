import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Btn, Err, Field, Input, Select } from './ui';

type Discount = {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: number | null;
  min_total: number | null;
  active: boolean;
};

/** أكواد الخصم (F-06): إدارة المالك — الحساب والتطبيق خادمي حصريًا */
export default function DiscountsCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [list, setList] = useState<Discount[] | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState(10);
  const [maxUses, setMaxUses] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setList(await api<Discount[]>('/api/shop/discounts'));
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/shop/discounts', {
        method: 'POST',
        body: {
          code,
          type,
          value,
          max_uses: maxUses === '' ? null : Number(maxUses),
          min_total: minTotal === '' ? null : Number(minTotal),
          expires_at: expiryDays === '' ? null : Date.now() + Number(expiryDays) * 86400000,
        },
      });
      setCode('');
      setMaxUses('');
      setMinTotal('');
      setExpiryDays('');
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/shop/discounts/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-stone-400">🏷 {t('discounts')}</h3>
        <Btn variant="soft" onClick={() => setOpen((v) => !v)}>＋ {t('addDiscount')}</Btn>
      </div>

      {open && (
        <div className="mb-3 grid gap-3 rounded-2xl bg-[#f5f5f7] p-3 sm:grid-cols-3">
          <Field label={t('discountCode')}>
            <Input dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAVE10" />
          </Field>
          <Field label={t('discountType')}>
            <Select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}>
              <option value="percent">{t('percent')}</option>
              <option value="fixed">{t('fixed')}</option>
            </Select>
          </Field>
          <Field label={t('discountValue')}>
            <Input type="number" min={0} step="0.5" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </Field>
          <Field label={t('maxUses')}>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" />
          </Field>
          <Field label={t('minTotal')}>
            <Input type="number" min={0} value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="—" />
          </Field>
          <Field label={t('expiryDays')}>
            <Input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} placeholder="∞" />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Btn onClick={create} disabled={busy || code.trim().length < 3}>✓ {t('save')}</Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>✕</Btn>
          </div>
        </div>
      )}

      {error && <div className="mb-2"><Err error={error} /></div>}

      {list === null ? (
        <p className="text-sm text-stone-400">…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-stone-400">{t('noDiscounts')}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-2.5">
              <code className="rounded-lg bg-white px-2 py-1 font-mono text-sm font-black text-teal-800" dir="ltr">{d.code}</code>
              <span className="text-sm font-extrabold text-stone-700">
                {d.type === 'percent' ? `${d.value}%` : `${d.value} ${lang === 'ar' ? 'ج.م' : 'EGP'}`}
              </span>
              <span className="text-xs text-stone-400">
                {t('usedCount')}: {d.used_count}{d.max_uses ? `/${d.max_uses}` : ''}
              </span>
              {d.expires_at && d.expires_at < Date.now() && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">⌛</span>
              )}
              <button onClick={() => remove(d.id)} className="ms-auto rounded-lg p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-500">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

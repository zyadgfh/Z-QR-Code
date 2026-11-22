import { useState } from 'react';
import { api } from '../lib/api';
import { dashT } from '../lib/i18n';
import { useAuth } from '../stores/auth';
import { useDashLang } from '../stores/dashlang';
import { Btn, Err, Field, Input, Ok } from './ui';

/** بطاقة تغيير كلمة المرور للحساب الحالي (مالك / موظف / أدمن المنصة) */
export default function ChangePasswordCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const setToken = useAuth((s) => s.setToken);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setError(null);
    setOk(false);
    if (next.length < 8) return setError(t('weakPassword'));
    if (next !== confirm) return setError(t('passwordMismatch'));
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; token?: string }>('/api/auth/password', {
        method: 'PUT',
        body: { current_password: cur, new_password: next },
      });
      // الخادم أبطل كل الجلسات (token_version) وأعاد توكنًا جديدًا — نستبدله فورًا
      if (res.token) setToken(res.token);
      setOk(true);
      setCur('');
      setNext('');
      setConfirm('');
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-black text-stone-400">🔑 {t('changePassword')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('currentPassword')}>
          <Input dir="ltr" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label={t('newPassword')}>
          <Input dir="ltr" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('confirmNewPassword')}>
          <Input dir="ltr" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      {error && <div className="mt-2"><Err error={error} /></div>}
      {ok && <div className="mt-2"><Ok>{t('passwordChanged')}</Ok></div>}
      <div className="mt-3">
        <Btn onClick={submit} disabled={busy || !cur || next.length < 8}>{busy ? '…' : t('changePassword')}</Btn>
      </div>
    </div>
  );
}

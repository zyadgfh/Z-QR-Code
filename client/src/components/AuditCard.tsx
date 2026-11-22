import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dashT, fmtDate } from '../lib/i18n';
import { useDashLang } from '../stores/dashlang';
import { Card, CardHead, EmptyState, Err, Skeleton } from './ui';

type Entry = { id: string; email: string | null; role: string | null; action: string; detail: string; created_at: number };

const ICONS: Record<string, string> = {
  'settings.update': '⚙️',
  'staff.create': '👤',
  'staff.delete': '✕',
  'staff.perms': '🔑',
  'item.create': '＋',
  'item.update': '✏️',
  'item.delete': '🗑',
  'discount.create': '🏷',
  'branch.create': '🏢',
  'branch.update': '🏢',
  'branch.delete': '🗑',
  'shop.mark_paid': '💳',
  'shop.lock': '🔒',
  'shop.unlock': '🔓',
  'shop.archive': '🗂',
  'shop.restore': '♻️',
};

/** سجل التدقيق (D8) — من فعل ماذا على هذا المحل؛ البيانات من الخادم حصرًا */
export default function AuditCard() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Entry[]>('/api/shop/audit')
      .then((rows) => setEntries(rows.slice(0, 15)))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Card data-card>
      <CardHead icon="📜" title={t('auditTitle')} desc={t('auditDesc')} />
      {error && <Err error={error} />}
      {!entries && !error && (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )}
      {entries && entries.length === 0 && <EmptyState icon="📜" title={t('auditEmpty')} />}
      {entries && entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} data-card className="flex items-center gap-2.5 rounded-2xl bg-[#f5f5f7] px-3 py-2">
              <span className="text-sm">{ICONS[e.action] || '•'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-stone-700" dir="ltr">
                  {e.email || e.role || '—'} · {e.action}
                </p>
                {e.detail && <p className="truncate text-[11px] font-bold text-stone-400" dir="auto">{e.detail}</p>}
              </div>
              <span className="shrink-0 text-[10px] font-bold text-stone-400">{fmtDate(lang, e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

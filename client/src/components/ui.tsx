import React, { useEffect, useMemo, useRef, useState } from 'react';
import { popIn, shake, sheetIn } from '../lib/anim';
import { useToasts } from '../lib/toast';

/**
 * نظام مكونات واجهة بلغة تصميم آبل: أسطح بيضاء بظل ناعم، ضغطة زر مرنة،
 * حقول هادئة، ومودال يدخل بحركة زنبركية — كل الحركات عبر GSAP وتحترم reduced-motion.
 */

export function Btn({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' | 'dark' }) {
  const styles: Record<string, string> = {
    primary: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800 disabled:bg-stone-300 disabled:shadow-none',
    dark: 'bg-stone-900 text-white shadow-sm hover:bg-black disabled:bg-stone-300',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100',
    soft: 'bg-teal-50 text-teal-800 border border-teal-200/70 hover:bg-teal-100',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-stone-300',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-bold tracking-tight transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-stone-200/80 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-800 outline-none transition-all duration-200 placeholder:font-normal placeholder:text-stone-400 hover:border-stone-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 ${props.className || ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full appearance-none rounded-2xl border border-stone-200/80 bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2378716c%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[position:right_0.9rem_center] bg-no-repeat px-3.5 py-2.5 pe-9 text-sm font-semibold text-stone-800 outline-none transition-all duration-200 hover:border-stone-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 ${props.className || ''}`}
    />
  );
}

/** حقل نص متعدد الأسطر بنفس لغة الحقول */
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-stone-200/80 bg-white px-3.5 py-2.5 text-sm font-semibold leading-relaxed text-stone-800 outline-none transition-all duration-200 placeholder:font-normal placeholder:text-stone-400 hover:border-stone-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 ${props.className || ''}`}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-black tracking-wide text-stone-400">{children}</label>;
}

export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** بطاقة آبل موحدة: سطح أبيض بزوايا واسعة وظل ناعم */
export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`rounded-[2rem] bg-white p-5 shadow-apple ${className}`}>
      {children}
    </div>
  );
}

/** رأس قسم داخل بطاقة: أيقونة + عنوان وصف */
export function CardHead({ icon, title, desc, action }: { icon: string; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-black tracking-tight text-stone-800">
          <span className="me-1.5">{icon}</span>
          {title}
        </h3>
        {desc && <p className="mt-0.5 text-xs font-bold text-stone-400">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) sheetIn(panelRef.current);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panelRef}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-apple sm:rounded-[2rem] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black tracking-tight text-stone-800">{title}</h3>
          <button onClick={onClose} className="rounded-full bg-stone-100 p-2 text-stone-500 transition hover:bg-stone-200 active:scale-90" aria-label="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Chip({ color = 'stone', children }: { color?: 'stone' | 'teal' | 'amber' | 'red' | 'green' | 'sky'; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    stone: 'bg-stone-100 text-stone-600',
    teal: 'bg-teal-50 text-teal-800',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    green: 'bg-green-50 text-green-800',
    sky: 'bg-sky-50 text-sky-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${styles[color]}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-stone-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-teal-700" />
      {label && <span className="text-sm font-bold">{label}</span>}
    </div>
  );
}

export function StatusChip({ status, t }: { status: 'trial' | 'active' | 'locked'; t: (k: any) => string }) {
  if (status === 'trial') return <Chip color="amber">{t('statusTrial')}</Chip>;
  if (status === 'active') return <Chip color="green">{t('statusActive')}</Chip>;
  return <Chip color="red">{t('statusLocked')}</Chip>;
}

export function Err({ error }: { error: unknown }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const m = error instanceof Error ? error.message : String(error);
    setMsg(m);
    if (m) shake(ref.current);
  }, [error]);
  if (!msg) return null;
  return <div ref={ref} className="rounded-2xl bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-700">{msg}</div>;
}

export function Ok({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-2xl bg-green-50 px-3.5 py-2.5 text-sm font-bold text-green-700">
      <span className="text-green-600">✓</span>
      {children}
    </div>
  );
}

// ================= مكونات نظام التصميم المضافة (D7) =================

/** مفتاح تبديل بنمط iOS — حالات كاملة: تركيز/تعطيل/انتقال */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-50 ${checked ? 'bg-teal-600' : 'bg-stone-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/** منتقي مقاطع بنمط macOS — للمظهر: فاتح/داكن/النظام */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-full bg-stone-200/70 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title || o.label}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-2.5 py-1 text-xs font-extrabold transition-all active:scale-95 ${
            value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** حالة فراغ بهيكل واضح — بديل الجُمل الرمادية المتناثرة */
export function EmptyState({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <span className="text-3xl opacity-70">{icon}</span>
      <p className="text-sm font-extrabold text-stone-600">{title}</p>
      {desc && <p className="max-w-xs text-xs font-bold text-stone-400">{desc}</p>}
    </div>
  );
}

/** هيكل تحميل ناعم — بديل الـSpinners المحيطية */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-stone-200/80 ${className}`} />;
}

/** حاوية الإشعارات الفورية — تُركَّب مرة واحدة في الجذر */
export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) popIn(ref.current);
  }, [items.length]);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] mx-auto flex max-w-md flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          ref={ref}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto flex w-full cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold shadow-apple backdrop-blur ${
            t.kind === 'error' ? 'bg-red-600/95 text-white' : t.kind === 'info' ? 'bg-stone-800/95 text-white' : 'bg-teal-700/95 text-white'
          }`}
          dir="auto"
        >
          <span>{t.kind === 'error' ? '⚠️' : t.kind === 'info' ? 'ℹ️' : '✓'}</span>
          <span className="min-w-0 flex-1">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}


// ================= DataTable — جدول متقدم (D8) =================
// بحث/فرز/ترقيم/إظهار أعمدة — لغة آبل وRTL صحيح. البيانات تُمرر من الخادم كما هي.

export type Col<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  sortVal?: (row: T) => string | number;
  defaultHidden?: boolean;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  rows,
  cols,
  pageSize = 10,
  emptyText,
  toolbar,
}: {
  rows: T[];
  cols: Col<T>[];
  pageSize?: number;
  emptyText: string;
  toolbar?: React.ReactNode;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(cols.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);

  const visible = cols.filter((c) => !hidden.has(c.key));
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey);
    if (!col || !col.sortVal) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortVal!(a);
      const vb = col.sortVal!(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sortKey, dir]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDir(1);
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="relative ms-auto">
          <button
            onClick={() => setColsOpen((v) => !v)}
            className="rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-extrabold text-stone-500 transition hover:bg-stone-100"
          >
            ⚙ {cols.length - hidden.size}/{cols.length}
          </button>
          {colsOpen && (
            <div className="absolute end-0 z-20 mt-1 w-44 rounded-2xl bg-white p-2 shadow-apple" dir="rtl">
              {cols.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-teal-700"
                    checked={!hidden.has(c.key)}
                    onChange={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(c.key)) n.delete(c.key);
                        else if (visible.length > 1) n.add(c.key);
                        return n;
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {slice.length === 0 ? (
        <EmptyState icon="📭" title={emptyText} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-xs text-stone-400">
                {visible.map((c) => (
                  <th key={c.key} className={`p-2 text-start ${c.className || ''}`}>
                    {c.sortVal ? (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 font-extrabold transition hover:text-stone-600">
                        {c.label}
                        <span className="text-[10px]">{sortKey === c.key ? (dir === 1 ? '▲' : '▼') : '⇅'}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.id} data-card className="border-t border-stone-100 transition hover:bg-stone-50">
                  {visible.map((c) => (
                    <td key={c.key} className={`p-2 align-middle ${c.className || ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > pageSize && (
        <div className="mt-3 flex items-center justify-center gap-3 text-xs font-extrabold text-stone-500">
          <button
            onClick={() => setPage(Math.max(0, cur - 1))}
            disabled={cur === 0}
            className="rounded-xl border border-stone-300 px-3 py-1.5 transition hover:bg-stone-100 disabled:opacity-40"
          >
            ‹
          </button>
          <span dir="ltr">
            {cur + 1} / {pages} · {sorted.length}
          </span>
          <button
            onClick={() => setPage(Math.min(pages - 1, cur + 1))}
            disabled={cur >= pages - 1}
            className="rounded-xl border border-stone-300 px-3 py-1.5 transition hover:bg-stone-100 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { shake, sheetIn } from '../lib/anim';

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

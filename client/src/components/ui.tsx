import React from 'react';

export function Btn({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' | 'dark' }) {
  const styles: Record<string, string> = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-300',
    dark: 'bg-stone-800 text-white hover:bg-stone-900 disabled:bg-stone-300',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-200',
    soft: 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 ${props.className || ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 ${props.className || ''}`}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-bold text-stone-500">{children}</label>;
}

export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-stone-800">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100" aria-label="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
    stone: 'bg-stone-200 text-stone-700',
    teal: 'bg-teal-100 text-teal-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-800',
    sky: 'bg-sky-100 text-sky-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${styles[color]}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-stone-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function StatusChip({ status, t }: { status: 'trial' | 'active' | 'locked'; t: (k: any) => string }) {
  if (status === 'trial') return <Chip color="amber">{t('statusTrial')}</Chip>;
  if (status === 'active') return <Chip color="green">{t('statusActive')}</Chip>;
  return <Chip color="red">{t('statusLocked')}</Chip>;
}

export function Err({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{msg}</div>;
}

export function Ok({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{children}</div>;
}

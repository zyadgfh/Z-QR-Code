import { create } from 'zustand';

/**
 * المظهر المركزي (D7): فاتح / داكن / حسب النظام — محفوظ في localStorage.
 * المرجع: HIG Dark Mode — المظهر اختيار مستخدم دائم، والنظام احتياطي ذكي.
 */

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'qm-theme';

function resolve(t: Theme): boolean {
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolve(t));
}

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  init: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'system',
  setTheme: (t) => {
    localStorage.setItem(KEY, t);
    apply(t);
    set({ theme: t });
  },
  init: () => {
    let t: Theme = 'system';
    try {
      const saved = localStorage.getItem(KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') t = saved;
    } catch {
      /* التخزين غير متاح */
    }
    apply(t);
    set({ theme: t });
    // متابعة تغيّر تفضيل النظام أثناء وضع «حسب النظام»
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
        if (get().theme === 'system') apply('system');
      });
    }
  },
}));

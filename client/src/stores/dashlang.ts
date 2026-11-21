import { create } from 'zustand';

type LangState = { lang: 'ar' | 'en'; set: (l: 'ar' | 'en') => void };

const KEY = 'qm-dash-lang';

export const useDashLang = create<LangState>((set) => ({
  lang: (localStorage.getItem(KEY) as 'ar' | 'en') || 'ar',
  set: (l) => {
    localStorage.setItem(KEY, l);
    set({ lang: l });
  },
}));

/** يضبط اتجاه الصفحة حسب اللغة */
export function useDocDir(lang: 'ar' | 'en') {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

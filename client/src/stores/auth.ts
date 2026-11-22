import { create } from 'zustand';

export type Shop = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  menu_language: 'ar' | 'en';
  table_count: number;
  logo_url: string | null;
  theme?: string | null;
  brand_color?: string | null;
  hours?: Array<{ open: string; close: string } | null> | null;
  status: 'trial' | 'active' | 'locked';
  trial_ends_at: number;
  paid_until: number | null;
  days_left: number;
};

export type Membership = { shop_id: string; role: 'owner' | 'staff'; shop: Shop };

export type MeUser = {
  id: string;
  email: string;
  role: 'platform_admin' | 'owner' | 'staff';
  mfa_enabled: boolean;
  mfa_enforced: boolean;
};

export type Me = { user: MeUser; memberships: Membership[] };

type AuthState = {
  token: string | null;
  mfaToken: string | null; // توكن التحدي المؤقت بين خطوتي الدخول (SEC-03)
  me: Me | null;
  setToken: (t: string) => void;
  setMfaToken: (t: string | null) => void;
  loadMe: () => Promise<Me | null>;
  logout: () => void;
};

const KEY = 'qm-token';
const MFA_KEY = 'qm-mfa-token';

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem(KEY),
  mfaToken: sessionStorage.getItem(MFA_KEY),
  me: null,
  setToken: (t) => {
    localStorage.setItem(KEY, t);
    set({ token: t });
  },
  setMfaToken: (t) => {
    if (t) sessionStorage.setItem(MFA_KEY, t);
    else sessionStorage.removeItem(MFA_KEY);
    set({ mfaToken: t });
  },
  loadMe: async () => {
    const token = get().token;
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) get().logout();
        return null;
      }
      const me = await res.json();
      set({ me });
      return me;
    } catch {
      return null;
    }
  },
  logout: () => {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(MFA_KEY);
    set({ token: null, mfaToken: null, me: null });
  },
}));

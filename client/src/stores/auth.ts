import { create } from 'zustand';

export type Shop = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  menu_language: 'ar' | 'en';
  table_count: number;
  logo_url: string | null;
  status: 'trial' | 'active' | 'locked';
  trial_ends_at: number;
  paid_until: number | null;
  days_left: number;
};

export type Membership = { shop_id: string; role: 'owner' | 'staff'; shop: Shop };

export type Me = {
  user: { id: string; email: string; role: 'platform_admin' | 'owner' | 'staff' };
  memberships: Membership[];
};

type AuthState = {
  token: string | null;
  me: Me | null;
  setToken: (t: string) => void;
  loadMe: () => Promise<Me | null>;
  logout: () => void;
};

const KEY = 'qm-token';

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem(KEY),
  me: null,
  setToken: (t) => {
    localStorage.setItem(KEY, t);
    set({ token: t });
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
    set({ token: null, me: null });
  },
}));

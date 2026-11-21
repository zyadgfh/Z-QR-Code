import { create } from 'zustand';

export type CartOption = {
  option_id: string;
  group_name: string;
  option_name: string;
  name_en: string | null;
  price_delta: number;
};

export type CartLine = {
  key: string;
  item_id: string;
  name: string;
  name_en: string | null;
  unit_price: number;
  qty: number;
  options: CartOption[];
};

type CartState = {
  bySlug: Record<string, CartLine[]>;
  add: (slug: string, line: CartLine) => void;
  setQty: (slug: string, key: string, qty: number) => void;
  remove: (slug: string, key: string) => void;
  clear: (slug: string) => void;
};

const KEY = 'qm-cart';

function load(): Record<string, CartLine[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(state: CartState) {
  localStorage.setItem(KEY, JSON.stringify(state.bySlug));
}

export const lineTotal = (l: CartLine) =>
  Math.round(l.qty * l.unit_price * 100) / 100;

export const useCart = create<CartState>((set, get) => ({
  bySlug: load(),
  add: (slug, line) => {
    const cur = get().bySlug[slug] || [];
    const existing = cur.find(
      (l) =>
        l.item_id === line.item_id &&
        JSON.stringify(l.options.map((o) => o.option_id).sort()) ===
          JSON.stringify(line.options.map((o) => o.option_id).sort())
    );
    const next = existing
      ? cur.map((l) => (l === existing ? { ...l, qty: Math.min(10, l.qty + line.qty) } : l))
      : [...cur, line];
    set({ bySlug: { ...get().bySlug, [slug]: next } });
    save(get());
  },
  setQty: (slug, key, qty) => {
    const next = (get().bySlug[slug] || [])
      .map((l) => (l.key === key ? { ...l, qty } : l))
      .filter((l) => l.qty > 0);
    set({ bySlug: { ...get().bySlug, [slug]: next } });
    save(get());
  },
  remove: (slug, key) => {
    const next = (get().bySlug[slug] || []).filter((l) => l.key !== key);
    set({ bySlug: { ...get().bySlug, [slug]: next } });
    save(get());
  },
  clear: (slug) => {
    set({ bySlug: { ...get().bySlug, [slug]: [] } });
    save(get());
  },
}));

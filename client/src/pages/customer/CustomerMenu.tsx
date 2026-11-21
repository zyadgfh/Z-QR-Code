import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { custT, money, Lang } from '../../lib/i18n';
import { useCart, CartLine, CartOption } from '../../stores/cart';
import { Spinner } from '../../components/ui';

type Opt = { id: string; name: string; name_en: string | null; price_delta: number };
type Group = { id: string; name: string; name_en: string | null; selection: 'single' | 'multi'; required: boolean; options: Opt[] };
type Item = {
  id: string;
  category_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  price: number;
  photo_url: string | null;
  groups: Group[];
};
type MenuData = {
  open: boolean;
  reason?: string;
  shop?: { slug: string; name: string; logo_url: string | null; menu_language?: Lang; table_count?: number };
  categories?: { id: string; name: string; name_en: string | null }[];
  items?: Item[];
};

const EMOJIS = ['🍽️', '☕', '🥤', '🍰', '🍔', '🍕', '🧁', '🍹'];

export default function CustomerMenu() {
  const { slug = '', table: tableParam } = useParams();
  const table = tableParam ? Number(tableParam) : null;
  const navigate = useNavigate();

  const [data, setData] = useState<MenuData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeOrder, setActiveOrder] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);

  const lang = (data?.shop?.menu_language || 'ar') as Lang;
  const t = custT(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  useEffect(() => {
    let alive = true;
    api<MenuData>(`/api/public/shops/${slug}/menu`)
      .then((d) => alive && setData(d))
      .catch((e) => e.status === 404 && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  // متابعة وجود طلب نشط لهذه الترابيزة
  useEffect(() => {
    if (!table) return;
    const id = localStorage.getItem(`qm-order:${slug}:${table}`);
    if (!id) return;
    api<any>(`/api/public/orders/${id}`)
      .then((st) => {
        if (st && st.state === 'waiting') setActiveOrder(id);
      })
      .catch(() => {});
  }, [slug, table]);

  if (notFound)
    return (
      <Center>
        <p className="text-lg font-bold text-stone-500">{t('notFound')}</p>
      </Center>
    );
  if (!data) return <Spinner />;
  if (!data.open)
    return (
      <Unavailable
        lang={lang}
        name={data.shop?.name || ''}
        logo={data.shop?.logo_url || null}
        reason={data.reason}
      />
    );

  const itemsByCat = new Map<string, Item[]>();
  for (const it of data.items || []) {
    if (!itemsByCat.has(it.category_id)) itemsByCat.set(it.category_id, []);
    itemsByCat.get(it.category_id)!.push(it);
  }

  return (
    <div dir={dir} className="mx-auto min-h-dvh max-w-lg bg-stone-50 pb-28">
      {/* الترويسة */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          {data.shop?.logo_url ? (
            <img src={data.shop.logo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-700 text-lg font-black text-white">
              {(data.shop?.name || 'M').trim().charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-stone-800">{data.shop?.name}</h1>
            <p className="text-xs text-stone-500">
              {table ? `${t('table')} ${table}` : t('needTable')}
            </p>
          </div>
        </div>
        {/* شرائح التصنيفات */}
        <nav className="flex gap-2 overflow-x-auto px-4 pb-2.5" style={{ scrollbarWidth: 'none' }}>
          {(data.categories || []).map((c, i) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="shrink-0 rounded-full bg-stone-100 px-3.5 py-1.5 text-sm font-bold text-stone-700 hover:bg-teal-50 hover:text-teal-800"
            >
              {lang === 'en' && c.name_en ? c.name_en : c.name} <span className="text-stone-400">{EMOJIS[i % EMOJIS.length]}</span>
            </a>
          ))}
        </nav>
      </header>

      {/* طلب نشط */}
      {activeOrder && (
        <Link
          to={`/${slug}/o/${activeOrder}`}
          className="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow"
        >
          <span>🔔 {t('activeOrder')}</span>
          <span>›</span>
        </Link>
      )}

      {/* الأصناف */}
      <main className="mt-2 space-y-6 px-4">
        {(data.categories || []).map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
            <h2 className="mb-2.5 text-base font-extrabold text-stone-800">
              {lang === 'en' && c.name_en ? c.name_en : c.name}
            </h2>
            <div className="space-y-2.5">
              {(itemsByCat.get(c.id) || []).map((it) => (
                <button
                  key={it.id}
                  onClick={() => setSelected(it)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 text-start shadow-sm transition active:scale-[0.99]"
                >
                  {it.photo_url ? (
                    <img src={it.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-2xl">
                      {EMOJIS[(data.categories || []).indexOf(c) % EMOJIS.length]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-stone-800">{lang === 'en' && it.name_en ? it.name_en : it.name}</p>
                    {it.description && <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{it.description}</p>}
                    <p className="mt-1 text-sm font-extrabold text-teal-700">{money(lang, it.price)}</p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-lg font-black text-teal-700">+</span>
                </button>
              ))}
              {(itemsByCat.get(c.id) || []).length === 0 && (
                <p className="py-2 text-sm text-stone-400">—</p>
              )}
            </div>
          </section>
        ))}
      </main>

      {/* شريط السلة العائم */}
      <CartBar slug={slug} table={table} lang={lang} onOpen={() => navigate(`/${slug}/cart${table ? `?t=${table}` : ''}`)} />

      {selected && (
        <ItemSheet
          item={selected}
          lang={lang}
          slug={slug}
          table={table}
          onClose={() => setSelected(null)}
          onAdded={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-stone-50 p-6 text-center">{children}</div>;
}

export function Unavailable({ lang, name, logo, reason }: { lang: Lang; name: string; logo: string | null; reason?: string }) {
  const t = custT(lang);
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-100 p-6 text-center">
      {logo ? (
        <img src={logo} alt="" className="h-20 w-20 rounded-full object-cover opacity-60" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-stone-300 text-3xl">🍽️</div>
      )}
      <h1 className="text-xl font-extrabold text-stone-700">{name}</h1>
      <p className="rounded-2xl bg-white px-5 py-4 text-lg font-bold text-stone-600 shadow-sm">{t('locked')}</p>
      <p className="text-xs text-stone-400">{reason === 'locked' ? '' : ''}</p>
    </div>
  );
}

function CartBar({
  slug,
  table,
  lang,
  onOpen,
}: {
  slug: string;
  table: number | null;
  lang: Lang;
  onOpen: () => void;
}) {
  const lines = useCart((s) => s.bySlug[slug] || []);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg p-3">
      <button
        onClick={onOpen}
        disabled={!table}
        className="flex w-full items-center justify-between rounded-2xl bg-teal-700 px-5 py-3.5 font-extrabold text-white shadow-xl transition hover:bg-teal-800 active:scale-[0.99] disabled:bg-stone-400"
      >
        <span className="flex items-center gap-2">
          🛒 {custT(lang)('viewCart')}
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{count}</span>
        </span>
        <span>{money(lang, Math.round(total * 100) / 100)}</span>
      </button>
    </div>
  );
}

function ItemSheet({
  item,
  lang,
  slug,
  table,
  onClose,
  onAdded,
}: {
  item: Item;
  lang: Lang;
  slug: string;
  table: number | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = custT(lang);
  const add = useCart((s) => s.add);
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of item.groups) if (g.required && g.selection === 'single') init[g.id] = [g.options[0]?.id].filter(Boolean) as string[];
    return init;
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const picked: CartOption[] = useMemo(() => {
    const out: CartOption[] = [];
    for (const g of item.groups)
      for (const oid of chosen[g.id] || []) {
        const o = g.options.find((x) => x.id === oid);
        if (o) out.push({ option_id: o.id, group_name: g.name, option_name: o.name, name_en: o.name_en, price_delta: o.price_delta });
      }
    return out;
  }, [chosen, item.groups]);

  const unit = Math.round((item.price + picked.reduce((s, o) => s + o.price_delta, 0)) * 100) / 100;

  const toggle = (g: Group, oid: string) => {
    setChosen((prev) => {
      const cur = prev[g.id] || [];
      if (g.selection === 'single') return { ...prev, [g.id]: [oid] };
      return { ...prev, [g.id]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    });
  };

  const missing = item.groups.filter((g) => g.required && !(chosen[g.id] || []).length);

  const onAdd = () => {
    if (missing.length || !table) return;
    add(slug, {
      key: `${item.id}__${picked.map((p) => p.option_id).sort().join('-')}__${Math.random().toString(36).slice(2, 7)}`,
      item_id: item.id,
      name: item.name,
      name_en: item.name_en,
      unit_price: unit,
      qty,
      options: picked,
    });
    setAdded(true);
    setTimeout(onAdded, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-300 sm:hidden" />
        {item.photo_url && <img src={item.photo_url} alt="" className="mb-3 h-44 w-full rounded-2xl object-cover" />}
        <h3 className="text-xl font-extrabold text-stone-800">{lang === 'en' && item.name_en ? item.name_en : item.name}</h3>
        {item.description && <p className="mt-1 text-sm text-stone-500">{item.description}</p>}

        <div className="mt-4 space-y-4">
          {item.groups.map((g) => (
            <div key={g.id}>
              <p className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-stone-700">
                {lang === 'en' && g.name_en ? g.name_en : g.name}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${g.required ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'}`}>
                  {g.required ? t('required') : t('optional')}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => {
                  const isOn = (chosen[g.id] || []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggle(g, o.id)}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                        isOn ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      {lang === 'en' && o.name_en ? o.name_en : o.name}
                      {o.price_delta > 0 && <span className="ms-1 text-xs text-teal-700">+{money(lang, o.price_delta)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg font-black text-stone-500">−</button>
            <span className="w-6 text-center text-sm font-extrabold">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(10, q + 1))} className="px-3 py-2 text-lg font-black text-stone-500">+</button>
          </div>
          <button
            onClick={onAdd}
            disabled={Boolean(missing.length) || !table}
            className="flex-1 rounded-xl bg-teal-700 px-4 py-3 font-extrabold text-white transition hover:bg-teal-800 disabled:bg-stone-300"
          >
            {added ? t('added') : `${t('add')} · ${money(lang, Math.round(unit * qty * 100) / 100)}`}
          </button>
        </div>
        {!table && <p className="mt-2 text-center text-xs font-bold text-amber-600">{t('needTable')}</p>}
      </div>
    </div>
  );
}

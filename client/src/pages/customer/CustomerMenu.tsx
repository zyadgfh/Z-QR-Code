import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { custT, money, Lang } from '../../lib/i18n';
import { useCart, CartLine, CartOption } from '../../stores/cart';
import { Spinner } from '../../components/ui';
import { revealSections, sheetIn, popIn } from '../../lib/anim';

type Opt = { id: string; name: string; name_en: string | null; price_delta: number };
type Group = { id: string; name: string; name_en: string | null; selection: 'single' | 'multi'; required: boolean; options: Opt[] };
type Item = {
  id: string;
  category_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en?: string | null;
  price: number;
  photo_url: string | null;
  available?: boolean;
  sold_out?: boolean;
  allergens?: string[];
  calories?: number | null;
  weight_g?: number | null;
  groups: Group[];
};
type Branch = { id: string; name: string; address: string | null };
type MenuData = {
  open: boolean;
  reason?: string;
  shop?: { slug: string; name: string; logo_url: string | null; menu_language?: Lang; table_count?: number; theme?: string | null; brand_color?: string | null };
  branches?: Branch[];
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
  const [q, setQ] = useState('');
  // مبدل لغة الزبون (F-14/UX-08): يظهر فقط للمحلات المترجمة، ويُحفظ اختياره
  const [langOverride, setLangOverride] = useState<Lang | null>(() => (localStorage.getItem('qm-cust-lang') as Lang) || null);

  const rootRef = useRef<HTMLDivElement>(null);

  const shopLang = (data?.shop?.menu_language || 'ar') as Lang;
  const hasEn = useMemo(
    () => !!(data?.items || []).some((i) => i.name_en || i.description_en) || !!(data?.categories || []).some((c) => c.name_en),
    [data]
  );
  const lang = ((hasEn && langOverride) || shopLang) as Lang;
  const t = custT(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const toggleLang = () => {
    const next: Lang = lang === 'ar' ? 'en' : 'ar';
    setLangOverride(next);
    localStorage.setItem('qm-cust-lang', next);
  };

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  useEffect(() => {
    let alive = true;
    api<MenuData>(`/api/public/shops/${slug}/menu`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // الفروع (F-04): حفظ القائمة + فرع افتراضي = الأول — الزبون يبدّل من الشرائح
        if (d.branches?.length) {
          useCart.getState().setBranches(slug, d.branches);
          if (!useCart.getState().branchBySlug[slug]) {
            useCart.getState().setBranch(slug, d.branches[0].id);
          }
        }
      })
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

  // حركات الظهور عند كل تحميل للمنيو
  useEffect(() => {
    if (data?.open) revealSections(rootRef.current);
  }, [data]);

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
  // بحث المنيو (F-08): يعمل محليًا على الاسم والوصف بلغتيه
  const query = q.trim().toLowerCase();
  const matches = (it: Item) =>
    !query ||
    [it.name, it.name_en, it.description, it.description_en].some((s) => (s || '').toLowerCase().includes(query));
  const catHasMatch = (c: { id: string }) => (itemsByCat.get(c.id) || []).some(matches);

  const theme = data.shop?.theme;
  const brandColor = data.shop?.brand_color;

  return (
    <div
      ref={rootRef}
      dir={dir}
      className={`mx-auto min-h-dvh max-w-lg bg-[#f5f5f7] pb-28 ${theme ? `menu-theme menu-theme-${theme}` : ''}`}
      style={brandColor ? ({ ['--brand' as string]: brandColor } as React.CSSProperties) : undefined}
    >
      {/* الترويسة الزجاجية */}
      <header className="glass sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 py-3">
          {data.shop?.logo_url ? (
            <img src={data.shop.logo_url} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-black/10" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-teal-800 text-lg font-black text-white shadow-apple">
              {(data.shop?.name || 'M').trim().charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-extrabold text-stone-900">{data.shop?.name}</h1>
            <p className="text-xs font-semibold text-stone-500">
              {table ? `${t('table')} ${table}` : t('needTable')}
            </p>
          </div>
          {hasEn && (
            <button
              onClick={toggleLang}
              className="shrink-0 rounded-full bg-white/85 px-3 py-1.5 text-xs font-extrabold text-stone-700 shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
          )}
        </div>
        {/* شرائح التصنيفات الزجاجية */}
        <nav className="flex gap-2 overflow-x-auto px-4 pb-2.5" style={{ scrollbarWidth: 'none' }}>
          {(data.categories || []).map((c, i) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="shrink-0 rounded-full border border-black/5 bg-white/80 px-3.5 py-1.5 text-sm font-bold text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-teal-800 active:scale-95"
            >
              {lang === 'en' && c.name_en ? c.name_en : c.name} <span className="text-stone-400">{EMOJIS[i % EMOJIS.length]}</span>
            </a>
          ))}
        </nav>
        {/* بحث المنيو */}
        <div className="px-4 pb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')}
            className="w-full rounded-2xl border border-black/5 bg-white/85 px-4 py-2.5 text-sm font-bold text-stone-700 shadow-sm outline-none backdrop-blur placeholder:font-semibold placeholder:text-stone-400 focus:border-teal-600/40"
          />
        </div>
      </header>
      {data.branches && data.branches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5" dir={dir}>
          {data.branches.map((b) => (
            <BranchChip key={b.id} slug={slug} id={b.id} name={b.name} address={b.address} />
          ))}
        </div>
      )}

      {/* طلب نشط */}
      {activeOrder && (
        <Link
          to={`/${slug}/o/${activeOrder}`}
          className="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 text-sm font-bold text-white shadow-apple"
        >
          <span>🔔 {t('activeOrder')}</span>
          <span>›</span>
        </Link>
      )}

      {/* الأصناف */}
      <main className="mt-2 space-y-6 px-4">
        {(data.categories || []).filter((c) => catHasMatch(c)).map((c) => (
          <section key={c.id} id={`cat-${c.id}`} data-reveal className="scroll-mt-32">
            <h2 className="mb-2.5 text-[19px] font-extrabold tracking-tight text-stone-900">
              {lang === 'en' && c.name_en ? c.name_en : c.name}
            </h2>
            <div className="space-y-2.5">
              {(itemsByCat.get(c.id) || []).filter(matches).map((it) => {
                const sold = it.sold_out === true;
                const desc = lang === 'en' && it.description_en ? it.description_en : it.description;
                return (
                  <button
                    key={it.id}
                    onClick={() => setSelected(it)}
                    className={`m-item flex w-full items-center gap-3 rounded-[22px] border border-black/[0.04] bg-white p-3 text-start shadow-apple transition active:scale-[0.98] ${sold ? 'opacity-50 saturate-50' : ''}`}
                  >
                    {it.photo_url ? (
                      <img src={it.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-2xl">
                        {EMOJIS[(data.categories || []).indexOf(c) % EMOJIS.length]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-stone-900">
                        {lang === 'en' && it.name_en ? it.name_en : it.name}
                        {sold && <span className="ms-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-600">{t('soldOut')}</span>}
                      </p>
                      {desc && <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{desc}</p>}
                      <p className="mt-1 text-sm font-extrabold text-teal-700">{money(lang, it.price)}</p>
                    </div>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-black ${sold ? 'bg-stone-100 text-stone-400' : 'bg-teal-50 text-teal-700'}`}>+</span>
                  </button>
                );
              })}
              {(itemsByCat.get(c.id) || []).filter(matches).length === 0 && (
                <p className="py-2 text-sm text-stone-400">—</p>
              )}
            </div>
          </section>
        ))}
        {query && !(data.categories || []).some(catHasMatch) && (
          <p className="py-8 text-center text-sm font-bold text-stone-400">— {t('search')} —</p>
        )}
      </main>

      {/* شريط السلة العائم الزجاجي */}
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
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-[#f5f5f7] p-6 text-center">{children}</div>;
}

export function Unavailable({ lang, name, logo, reason }: { lang: Lang; name: string; logo: string | null; reason?: string }) {
  const t = custT(lang);
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#f5f5f7] p-6 text-center">
      {logo ? (
        <img src={logo} alt="" className="h-20 w-20 rounded-full object-cover opacity-60" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-stone-300 text-3xl">🍽️</div>
      )}
      <h1 className="text-xl font-extrabold text-stone-700">{name}</h1>
      <p className="rounded-2xl bg-white px-5 py-4 text-lg font-bold text-stone-600 shadow-apple">
        {reason === 'closed_hours' ? t('closedNow') : t('locked')}
      </p>
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
  const barRef = useRef<HTMLButtonElement>(null);
  const wasVisible = useRef(false);

  useEffect(() => {
    if (count > 0 && !wasVisible.current) popIn(barRef.current);
    wasVisible.current = count > 0;
  }, [count]);

  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg p-3">
      <button
        ref={barRef}
        onClick={onOpen}
        disabled={!table}
        className="glass-float flex w-full items-center justify-between rounded-[22px] border border-white/60 px-5 py-3.5 font-extrabold text-stone-900 shadow-apple transition hover:bg-white active:scale-[0.98] disabled:opacity-50"
      >
        <span className="flex items-center gap-2">
          🛒 {custT(lang)('viewCart')}
          <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs text-white">{count}</span>
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of item.groups) if (g.required && g.selection === 'single') init[g.id] = [g.options[0]?.id].filter(Boolean) as string[];
    return init;
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    sheetIn(sheetRef.current);
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-[2px] sm:items-center sm:justify-center" onClick={onClose}>
      <div
        ref={sheetRef}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-apple sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-300 sm:hidden" />
        {item.photo_url && <img src={item.photo_url} alt="" className="mb-3 h-44 w-full rounded-[22px] object-cover" />}
        <h3 className="text-[21px] font-extrabold tracking-tight text-stone-900">{lang === 'en' && item.name_en ? item.name_en : item.name}</h3>
        {(lang === 'en' ? item.description_en || item.description : item.description) && (
          <p className="mt-1 text-sm text-stone-500">{lang === 'en' ? item.description_en || item.description : item.description}</p>
        )}
        {/* مسببات الحساسية والسعرات والوزن (F-09) */}
        {((item.allergens && item.allergens.length > 0) || item.calories || item.weight_g) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(item.allergens || []).map((a) => (
              <span key={a} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">⚠ {a}</span>
            ))}
            {Boolean(item.calories) && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">🔥 {item.calories} kcal</span>}
            {Boolean(item.weight_g) && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">⚖ {item.weight_g} g</span>}
          </div>
        )}
        {item.sold_out === true && (
          <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-600">✕ {t('soldOut')}</p>
        )}

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
                      className={`rounded-2xl border px-3 py-2 text-sm font-bold transition active:scale-95 ${
                        isOn
                          ? 'border-teal-700 bg-teal-50 text-teal-800 shadow-sm'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
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
          <div className="flex items-center gap-1 rounded-2xl border border-stone-200 bg-white">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg font-black text-stone-500">−</button>
            <span className="w-6 text-center text-sm font-extrabold">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(10, q + 1))} className="px-3 py-2 text-lg font-black text-stone-500">+</button>
          </div>
          <button
            onClick={onAdd}
            disabled={Boolean(missing.length) || !table || item.sold_out === true}
            className="flex-1 rounded-2xl bg-teal-700 px-4 py-3 font-extrabold text-white shadow-apple transition hover:bg-teal-800 active:scale-[0.98] disabled:bg-stone-300"
          >
            {item.sold_out === true ? `✕ ${t('soldOut')}` : added ? t('added') : `${t('add')} · ${money(lang, Math.round(unit * qty * 100) / 100)}`}
          </button>
        </div>
        {!table && <p className="mt-2 text-center text-xs font-bold text-amber-600">{t('needTable')}</p>}
      </div>
    </div>
  );
}


function BranchChip({ slug, id, name, address }: { slug: string; id: string; name: string; address: string | null }) {
  const setBranch = useCart((s) => s.setBranch);
  const active = useCart((s) => s.branchBySlug[slug] === id);
  return (
    <button
      onClick={() => setBranch(slug, id)}
      className={`shrink-0 rounded-2xl border px-3 py-1.5 text-start transition active:scale-95 ${active ? 'border-teal-600 bg-teal-50 shadow-sm' : 'border-stone-200 bg-white'}`}
    >
      <p className={`text-xs font-black ${active ? 'text-teal-800' : 'text-stone-600'}`}>🏢 {name}</p>
      {address && <p className="text-[10px] font-bold text-stone-400">{address}</p>}
    </button>
  );
}

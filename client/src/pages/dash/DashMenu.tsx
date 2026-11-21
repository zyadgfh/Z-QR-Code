import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { dashT } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { compressImage } from '../../lib/img';
import { Btn, Chip, Err, Field, Input, Label, Modal, Select, Spinner } from '../../components/ui';

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
  available: boolean;
  groups: Group[];
};
type MenuData = { categories: { id: string; name: string; name_en: string | null; sort_order: number }[]; items: Item[] };

export default function DashMenu() {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [data, setData] = useState<MenuData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: Item | null; open: boolean }>({ item: null, open: false });
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<MenuData>('/api/shop/menu');
      setData(d);
      setSelCat((cur) => cur || d.categories[0]?.id || null);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div><Err error={error} /></div>;
  if (!data) return <Spinner label={t('loading')} />;

  const items = data.items.filter((i) => i.category_id === selCat);

  const addCategory = async () => {
    const name = prompt(t('categoryName'));
    if (!name) return;
    try {
      const c = await api<{ id: string }>('/api/shop/categories', { method: 'POST', body: { name } });
      await load();
      setSelCat(c.id);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm(t('deleteCategoryWarn'))) return;
    try {
      await api(`/api/shop/categories/${id}`, { method: 'DELETE' });
      setSelCat(null);
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => setEditing({ item: null, open: true })} disabled={!selCat}>＋ {t('addItem')}</Btn>
        <Btn variant="soft" onClick={() => setAiOpen(true)}>✨ {t('aiImport')}</Btn>
        <Btn variant="ghost" onClick={addCategory}>＋ {t('addCategory')}</Btn>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* التصنيفات */}
        <aside className="rounded-3xl bg-white p-3 shadow-sm">
          <h3 className="mb-2 px-1 text-xs font-black text-stone-400">{t('categories')}</h3>
          <div className="flex flex-row flex-wrap gap-1.5 md:flex-col">
            {data.categories.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelCat(c.id)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                    selCat === c.id ? 'bg-teal-700 text-white' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {c.name}
                </button>
                <button onClick={() => deleteCategory(c.id)} className="rounded-lg p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-500">✕</button>
              </div>
            ))}
            {!data.categories.length && <p className="px-1 py-2 text-xs text-stone-400">—</p>}
          </div>
        </aside>

        {/* الأصناف */}
        <section className="space-y-2.5">
          {selCat && items.length === 0 && <p className="rounded-3xl bg-white p-6 text-center text-sm font-bold text-stone-400 shadow-sm">{t('selectCategory')}</p>}
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-3xl border border-stone-200 bg-white p-3 shadow-sm">
              {it.photo_url ? (
                <img src={it.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-xl">🍽️</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-extrabold text-stone-800">
                  {it.name}
                  {!it.available && <Chip color="red">{t('hidden')}</Chip>}
                </p>
                {it.name_en && <p className="truncate text-xs text-stone-400" dir="ltr">{it.name_en}</p>}
                <p className="text-sm font-extrabold text-teal-700">{it.price} {lang === 'ar' ? 'ج.م' : 'EGP'}</p>
              </div>
              <Btn variant="ghost" onClick={() => setEditing({ item: it, open: true })}>✏️</Btn>
            </div>
          ))}
        </section>
      </div>

      {editing.open && (
        <ItemEditor
          item={editing.item}
          categoryId={selCat}
          onClose={() => setEditing({ item: null, open: false })}
          onSaved={load}
        />
      )}
      {aiOpen && <AiImportModal onClose={() => setAiOpen(false)} onPublished={load} />}
    </div>
  );
}

// ================= محرر الصنف + مجموعات الخيارات =================

type GroupDraft = { id: string | null; name: string; name_en: string; selection: 'single' | 'multi'; required: boolean; options: { name: string; name_en: string; price_delta: number }[] };

function ItemEditor({ item, categoryId, onClose, onSaved }: { item: Item | null; categoryId: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [name, setName] = useState(item?.name || '');
  const [nameEn, setNameEn] = useState(item?.name_en || '');
  const [desc, setDesc] = useState(item?.description || '');
  const [price, setPrice] = useState(item?.price ?? 0);
  const [available, setAvailable] = useState(item?.available !== false);
  const [photoUrl, setPhotoUrl] = useState(item?.photo_url || '');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(item?.id || null);
  const [groups, setGroups] = useState<GroupDraft[]>(
    (item?.groups || []).map((g) => ({ id: g.id, name: g.name, name_en: g.name_en || '', selection: g.selection, required: g.required, options: g.options.map((o) => ({ name: o.name, name_en: o.name_en || '', price_delta: o.price_delta })) }))
  );
  const [groupEdit, setGroupEdit] = useState<number | null>(null);

  const itemId = item?.id || savedId;

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file);
      const res = await api<{ url: string }>('/api/shop/uploads', { method: 'POST', body: { dataUrl } });
      setPhotoUrl(res.url);
    } catch (e: any) {
      setError(e.message);
    }
    setUploading(false);
  };

  const saveItem = async (): Promise<string | null> => {
    setError(null);
    try {
      if (itemId) {
        await api(`/api/shop/items/${itemId}`, {
          method: 'PUT',
          body: { category_id: categoryId, name, name_en: nameEn || null, description: desc || null, price, available, photo_url: photoUrl || null },
        });
        return itemId;
      }
      const created = await api<{ id: string }>('/api/shop/items', {
        method: 'POST',
        body: { category_id: categoryId, name, name_en: nameEn || null, description: desc || null, price, available, photo_url: photoUrl || null },
      });
      setSavedId(created.id);
      return created.id;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  };

  const saveAll = async () => {
    setBusy(true);
    const id = await saveItem();
    if (id) {
      // حفظ المجموعات المضافة/المعدلة
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (!g.name || !g.options.length) continue;
        try {
          if (g.id) await api(`/api/shop/groups/${g.id}`, { method: 'PUT', body: g });
          else {
            const created = await api<{ id: string }>(`/api/shop/items/${id}/groups`, { method: 'POST', body: g });
            setGroups((gs) => gs.map((x, xi) => (xi === i ? { ...x, id: created.id } : x)));
          }
        } catch (e: any) {
          setError(e.message);
        }
      }
      await onSaved();
      onClose();
    }
    setBusy(false);
  };

  const saveSingleGroup = async (idx: number) => {
    const g = groups[idx];
    if (!itemId) {
      const id = await saveItem();
      if (!id) return;
    }
    try {
      if (g.id) await api(`/api/shop/groups/${g.id}`, { method: 'PUT', body: g });
      else {
        const created = await api<{ id: string }>(`/api/shop/items/${itemId || savedId}/groups`, { method: 'POST', body: g });
        setGroups((gs) => gs.map((x, xi) => (xi === idx ? { ...x, id: created.id } : x)));
      }
      setGroupEdit(null);
      await onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteGroup = async (idx: number) => {
    const g = groups[idx];
    if (g.id && confirm(t('confirmDelete'))) {
      try {
        await api(`/api/shop/groups/${g.id}`, { method: 'DELETE' });
        await onSaved();
      } catch (e: any) {
        setError(e.message);
        return;
      }
    }
    setGroups((gs) => gs.filter((_, i) => i !== idx));
    setGroupEdit(null);
  };

  return (
    <Modal open onClose={onClose} title={item ? `${t('edit')}: ${item.name}` : t('addItem')} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('itemName')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('itemNameEn')}><Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
          <Field label={t('price')}><Input type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
          <Field label={t('available')}>
            <button
              onClick={() => setAvailable((a) => !a)}
              className={`w-full rounded-xl px-3 py-2 text-sm font-extrabold ${available ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}
            >
              {available ? `✓ ${t('available')}` : `✕ ${t('hidden')}`}
            </button>
          </Field>
        </div>
        <Field label={t('description')}><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <div className="flex items-end gap-3">
          {photoUrl && <img src={photoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />}
          <label className="cursor-pointer rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50">
            {uploading ? t('uploading') : `🖼 ${t('uploadPhoto')}`}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>

        {error && <Err error={error} />}

        <div className="border-t border-stone-200 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <Label>{t('optionGroups')}</Label>
            <Btn variant="soft" onClick={() => { setGroups((gs) => [...gs, { id: null, name: '', name_en: '', selection: 'single', required: true, options: [{ name: '', name_en: '', price_delta: 0 }] }]); setGroupEdit(groups.length); }}>
              ＋ {t('addGroup')}
            </Btn>
          </div>
          <div className="space-y-2">
            {groups.map((g, gi) => (
              <div key={gi} className="rounded-2xl border border-stone-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-stone-700">{g.name || '—'}</span>
                  <Chip color={g.selection === 'single' ? 'sky' : 'teal'}>{g.selection === 'single' ? t('single') : t('multi')}</Chip>
                  <Chip color={g.required ? 'red' : 'stone'}>{g.required ? t('required') : t('optional')}</Chip>
                  <span className="text-xs text-stone-400">{g.options.length} {t('options')}</span>
                  <span className="ms-auto flex gap-1">
                    <button onClick={() => setGroupEdit(groupEdit === gi ? null : gi)} className="rounded-lg p-1.5 hover:bg-stone-100">✏️</button>
                    <button onClick={() => deleteGroup(gi)} className="rounded-lg p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-500">✕</button>
                  </span>
                </div>
                {groupEdit === gi && (
                  <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label={t('groupName')}><Input value={g.name} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))} /></Field>
                      <Field label={t('selection')}>
                        <Select value={g.selection} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, selection: e.target.value as 'single' | 'multi' } : x)))}>
                          <option value="single">{t('single')}</option>
                          <option value="multi">{t('multi')}</option>
                        </Select>
                      </Field>
                      <Field label={t('required')}>
                        <Select value={g.required ? '1' : '0'} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, required: e.target.value === '1' } : x)))}>
                          <option value="1">{t('required')}</option>
                          <option value="0">{t('optional')}</option>
                        </Select>
                      </Field>
                    </div>
                    <p className="text-xs font-bold text-stone-400">{t('options')}:</p>
                    {g.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input placeholder={lang === 'ar' ? 'الاسم' : 'Name'} value={o.name} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, options: x.options.map((y, yi) => (yi === oi ? { ...y, name: e.target.value } : y)) } : x)))} />
                        <Input dir="ltr" placeholder="EN" className="!w-24" value={o.name_en} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, options: x.options.map((y, yi) => (yi === oi ? { ...y, name_en: e.target.value } : y)) } : x)))} />
                        <Input type="number" step="0.5" min={0} className="!w-28" value={o.price_delta} onChange={(e) => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, options: x.options.map((y, yi) => (yi === oi ? { ...y, price_delta: Number(e.target.value) } : y)) } : x)))} />
                        <button onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, options: x.options.filter((_, yi) => yi !== oi) } : x)))} className="p-1 text-stone-300 hover:text-red-500">✕</button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Btn variant="ghost" onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? { ...x, options: [...x.options, { name: '', name_en: '', price_delta: 0 }] } : x)))}>＋ {t('addOption')}</Btn>
                      <Btn onClick={() => saveSingleGroup(gi)}>{t('save')}</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Btn className="flex-1 py-2.5" onClick={saveAll} disabled={busy || !name || price < 0}>{busy ? '…' : t('save')}</Btn>
          <Btn variant="ghost" onClick={onClose}>{t('cancel')}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ================= استيراد الـ AI من صورة المنيو =================

type AiDraft = { categories: { name: string; name_en: string | null; items: { name: string; name_en: string | null; price: number; sizes: { name: string; price_delta: number }[]; extras: { name: string; price_delta: number }[]; include: boolean }[] }[] };

function parseGroupText(s: string): { name: string; price_delta: number }[] {
  return s
    .split(/[,،]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [n, d] = p.split(':');
      return { name: (n || '').trim(), price_delta: Number((d || 0).toString().trim()) || 0 };
    })
    .filter((o) => o.name);
}

function groupsToText(g: { name: string; price_delta: number }[]) {
  return g.map((o) => `${o.name}:${o.price_delta}`).join('، ');
}

function AiImportModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => Promise<void> }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [phase, setPhase] = useState<'pick' | 'review' | 'publishing'>('pick');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  const extract = async () => {
    setError(null);
    setPhase('pick');
    try {
      const images = await Promise.all(files.slice(0, 3).map((f) => compressImage(f, 1600, 0.85)));
      const res = await api<AiDraft>('/api/shop/ai/extract-menu', {
        method: 'POST',
        body: { images: images.map((d) => d) },
      });
      setDraft({ ...res, categories: res.categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, include: true })) })) });
      setPhase('review');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const publish = async () => {
    if (!draft) return;
    setPhase('publishing');
    setError(null);
    try {
      let catIndex = 0;
      for (const c of draft.categories) {
        const items = c.items.filter((i) => i.include && i.name);
        if (!items.length) continue;
        catIndex++;
        setProgress(`${c.name} (${catIndex}/${draft.categories.length})`);
        const cat = await api<{ id: string }>('/api/shop/categories', { method: 'POST', body: { name: c.name, name_en: c.name_en || undefined } });
        for (const it of items) {
          const item = await api<{ id: string }>('/api/shop/items', {
            method: 'POST',
            body: { category_id: cat.id, name: it.name, name_en: it.name_en || null, price: Number(it.price) || 0 },
          });
          if (it.sizes.length)
            await api(`/api/shop/items/${item.id}/groups`, {
              method: 'POST',
              body: { name: lang === 'ar' ? 'الحجم' : 'Size', selection: 'single', required: true, options: it.sizes },
            });
          if (it.extras.length)
            await api(`/api/shop/items/${item.id}/groups`, {
              method: 'POST',
              body: { name: lang === 'ar' ? 'إضافات' : 'Extras', selection: 'multi', required: false, options: it.extras },
            });
        }
      }
      await onPublished();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setPhase('review');
    }
  };

  return (
    <Modal open onClose={onClose} title={`✨ ${t('aiImport')}`} wide>
      {phase === 'pick' && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">{t('aiHint')}</p>
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/50 px-4 py-8 text-center text-sm font-bold text-teal-700 hover:bg-teal-50">
            🖼 {t('uploadPhoto')} (1-3)
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          {files.length > 0 && <p className="text-xs font-bold text-stone-500">{files.map((f) => f.name).join(' · ')}</p>}
          {error && <Err error={error} />}
          <Btn className="w-full py-2.5" onClick={extract} disabled={!files.length}>✨ {t('aiExtract')}</Btn>
        </div>
      )}

      {phase === 'review' && draft && (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800">⚠️ {t('aiReview')}</p>
          {error && <Err error={error} />}
          {draft.categories.map((c, ci) => (
            <div key={ci} className="rounded-2xl border border-stone-200 p-3">
              <div className="mb-2 flex gap-2">
                <Input value={c.name} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)) })} />
                <Input dir="ltr" placeholder="EN" className="!w-36" value={c.name_en || ''} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, name_en: e.target.value } : x)) })} />
              </div>
              <div className="space-y-1.5">
                {c.items.map((it, ii) => (
                  <div key={ii} className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-2">
                    <input type="checkbox" checked={it.include} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, include: e.target.checked } : y)) } : x)) })} />
                    <Input className="!w-40" value={it.name} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, name: e.target.value } : y)) } : x)) })} />
                    <Input dir="ltr" placeholder="EN" className="!w-28" value={it.name_en || ''} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, name_en: e.target.value } : y)) } : x)) })} />
                    <Input type="number" min={0} step="0.5" className="!w-24" value={it.price} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, price: Number(e.target.value) } : y)) } : x)) })} />
                    {it.sizes.length > 0 && (
                      <Input className="!w-52" value={groupsToText(it.sizes)} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, sizes: parseGroupText(e.target.value) } : y)) } : x)) })} />
                    )}
                    {it.extras.length > 0 && (
                      <Input className="!w-52" value={groupsToText(it.extras)} onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === ci ? { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, extras: parseGroupText(e.target.value) } : y)) } : x)) })} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-stone-400">{t('aiSizesHint')}</p>
          <Btn className="w-full py-2.5" onClick={publish}>🚀 {t('aiPublish')}</Btn>
        </div>
      )}

      {phase === 'publishing' && (
        <div className="py-8 text-center">
          <Spinner label={`${t('aiPublishing')} ${progress}`} />
        </div>
      )}
    </Modal>
  );
}

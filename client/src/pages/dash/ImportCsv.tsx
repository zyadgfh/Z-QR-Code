import { useRef, useState } from 'react';
import { api, API_BASE } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { dashT } from '../../lib/i18n';
import { useDashLang } from '../../stores/dashlang';
import { Btn, Err, Modal, Ok } from '../../components/ui';

type ImportResult = { created_categories: number; created_items: number; errors: { row: number; error: string }[] };

/** استيراد المنيو CSV (F-13): قالب → ملف → معاينة جافة → اعتماد */
export default function ImportCsv({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { lang } = useDashLang();
  const t = dashT(lang);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setCsv(await f.text());
    setPreview(null);
    setDone(false);
    setError(null);
  };

  const run = async (dry: boolean) => {
    if (!csv.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ImportResult>('/api/shop/menu/import', { method: 'POST', body: { csv, dry_run: dry } });
      setPreview(res);
      if (!dry) {
        setDone(true);
        onDone();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const downloadTemplate = async () => {
    setError(null);
    try {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_BASE}/api/shop/menu/import-template`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('http');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'menu-template.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError(lang === 'ar' ? 'فشل تنزيل القالب' : 'Template download failed');
    }
  };

  return (
    <Modal open onClose={onClose} title={`📥 ${t('menuImport')}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Btn variant="soft" onClick={downloadTemplate}>⬇ {t('importTemplate')}</Btn>
          <Btn variant="soft" onClick={() => fileRef.current?.click()}>📁 {t('importPickFile')}</Btn>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
        {fileName && <p className="text-xs font-bold text-stone-500" dir="ltr">📄 {fileName}</p>}
        <p className="text-[11px] font-bold text-stone-400">{t('importHint')}</p>

        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => run(true)} disabled={busy || !csv.trim()}>{busy ? '…' : `👁 ${t('importPreview')}`}</Btn>
          <Btn onClick={() => run(false)} disabled={busy || !csv.trim()}>✓ {t('importApply')}</Btn>
        </div>

        {error && <Err error={error} />}
        {done && <Ok>{t('importDone')}</Ok>}

        {preview && (
          <div className="rounded-2xl bg-[#f5f5f7] p-3">
            <p className="text-sm font-black text-stone-700">
              ✅ {t('importCats')}: {preview.created_categories} · 🍽 {t('importItemsCount')}: {preview.created_items}
            </p>
            {preview.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-black text-red-600">⚠️ {t('importErrors')} ({preview.errors.length})</p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                  {preview.errors.slice(0, 30).map((e, i) => (
                    <li key={i} className="rounded-xl bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700" dir="auto">
                      {t('importRow')} {e.row}: {e.error}
                    </li>
                  ))}
                  {preview.errors.length > 30 && <li className="text-[11px] font-bold text-stone-400">…</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>
      </div>
    </Modal>
  );
}

import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { fileToThumb } from './photo';

/** Shows the product photo if there is one, otherwise the emoji. */
export function ProductThumb({ product, size = 56 }: { product: any; size?: number }) {
  const box: React.CSSProperties = { width: size, height: size, flex: 'none' };
  return product.photo ? (
    <img src={product.photo} alt={product.name} loading="lazy" draggable={false}
      style={{ ...box, objectFit: 'cover' }} className="rounded-xl border border-slate-800 bg-slate-950" />
  ) : (
    <span style={{ ...box, fontSize: size * 0.55 }} className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950">{product.image}</span>
  );
}

/** Take a photo with the camera (phones/tablets) or choose one from the gallery / a file (all devices). */
export function PhotoPicker({ value, onChange, emoji = '📦' }: { value: string; onChange: (dataUrl: string) => void; emoji?: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!f) return;
    setBusy(true); setErr('');
    try { onChange(await fileToThumb(f)); } catch (x: any) { setErr(x?.message || 'Could not read that photo.'); }
    setBusy(false);
  };

  const btn = 'px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 disabled:opacity-50';
  return (
    <div className="space-y-2">
      <label className="text-xs text-slate-400 font-bold">Product photo (optional)</label>
      <div className="flex items-center gap-3">
        <ProductThumb product={{ photo: value, image: emoji, name: 'preview' }} size={72} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => cam.current?.click()} className={btn}><Camera className="h-3.5 w-3.5" /> Take photo</button>
          <button type="button" disabled={busy} onClick={() => gal.current?.click()} className={btn}><ImageIcon className="h-3.5 w-3.5" /> Choose file</button>
          {value && <button type="button" onClick={() => onChange('')} className={btn + ' text-rose-400'}><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
        </div>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      <input ref={gal} type="file" accept="image/*" onChange={pick} className="hidden" />
      {busy && <p className="text-[11px] text-slate-500">Preparing photo…</p>}
      {err && <p className="text-[11px] text-rose-400">{err}</p>}
    </div>
  );
}

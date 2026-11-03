import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PhotoPicker } from './ProductPhoto';

/** Owner-only: change name, price, cost, bulk price, alert level and photo of an existing product. Stock counts are NOT edited here (use Restock / End of Day). */
export default function ItemEditModal({ item, currency, onSave, onClose }: {
  item: any; currency: string; onSave: (changes: any) => void; onClose: () => void;
}) {
  const [f, setF] = useState({
    name: item.name || '', price: String(item.price ?? ''), cost: String(item.cost ?? ''), unit: item.unit || 'pcs',
    minThreshold: String(item.minThreshold ?? 5), bulkQty: item.bulkQty ? String(item.bulkQty) : '', bulkPrice: item.bulkPrice ? String(item.bulkPrice) : '',
    photo: item.photo || '',
    boxQty: item.boxQty ? String(item.boxQty) : '', boxPrice: item.boxPrice ? String(item.boxPrice) : '', boxCost: item.boxCost ? String(item.boxCost) : '',
    halfPrice: item.halfPrice ? String(item.halfPrice) : '', halfCost: item.halfCost ? String(item.halfCost) : '',
  });
  const canBox = item.category === 'Retail' || !!item.boxQty; // boxes are a wholesale thing
  const crate = item.subcategory === 'Beer'; // lagers are sold by the crate / half crate, everything else by the box
  const [err, setErr] = useState('');
  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1 focus:outline-none focus:border-amber-500';
  const lab = 'text-xs text-slate-400 font-bold';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(f.price), cost = parseFloat(f.cost || '0');
    const bq = parseInt(f.bulkQty || '0', 10), bp = parseFloat(f.bulkPrice || '0');
    if (!f.name.trim() || !(price > 0)) { setErr('Name and a price above zero are required.'); return; }
    if ((bq || bp) && (!(bq >= 2) || !(bp > 0))) { setErr('Bulk price needs both a quantity of 2 or more and a price.'); return; }
    const xq = parseInt(f.boxQty || '0', 10), xp = parseFloat(f.boxPrice || '0'), xc = parseFloat(f.boxCost || '0') || 0;
    if ((xq || xp) && (!(xq >= 2) || !(xp > 0))) { setErr('A box needs both the bottles in the box (2 or more) and the box price. Fill both, or leave both empty.'); return; }
    if (bp && bp >= price) { setErr('The bulk price must be lower than the normal price.'); return; }
    onSave({
      name: f.name.trim(), price, cost, unit: f.unit.trim() || 'pcs', minThreshold: parseInt(f.minThreshold || '5', 10),
      bulkQty: bq >= 2 ? bq : 0, bulkPrice: bq >= 2 ? bp : 0, photo: f.photo,
      ...(canBox ? { boxQty: xq >= 2 ? xq : 0, boxPrice: xq >= 2 ? xp : 0, boxCost: xq >= 2 ? xc : 0,
        halfPrice: xq >= 2 && crate ? parseFloat(f.halfPrice || '0') || 0 : 0, halfCost: xq >= 2 && crate ? parseFloat(f.halfCost || '0') || 0 : 0 } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-extrabold text-slate-100">Edit {item.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>
        <PhotoPicker value={f.photo} emoji={item.image} onChange={photo => setF({ ...f, photo })} />
        <div><label className={lab}>Product name</label><input className={input} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={lab}>Price ({currency})</label><input className={input} type="number" step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
          <div><label className={lab}>Cost ({currency})</label><input className={input} type="number" step="0.01" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></div>
          <div><label className={lab}>Unit</label><input className={input} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></div>
        </div>
        {canBox && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-3 space-y-2">
            <p className="text-xs font-bold text-indigo-300">{crate ? 'Sold by the crate and half crate' : 'Also sold by the box, optional'}</p>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lab}>{crate ? 'Bottles in a crate' : 'Bottles in a box'}</label><input className={input} type="number" min="2" placeholder="e.g. 12" value={f.boxQty} onChange={e => setF({ ...f, boxQty: e.target.value })} /></div>
              <div><label className={lab}>{crate ? 'Crate' : 'Box'} price ({currency})</label><input className={input} type="number" step="0.01" value={f.boxPrice} onChange={e => setF({ ...f, boxPrice: e.target.value })} /></div>
              <div><label className={lab}>{crate ? 'Crate' : 'Box'} cost ({currency})</label><input className={input} type="number" step="0.01" value={f.boxCost} onChange={e => setF({ ...f, boxCost: e.target.value })} /></div>
            </div>
            {crate && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lab}>Half crate price ({currency})</label><input className={input} type="number" step="0.01" placeholder="empty = half" value={f.halfPrice} onChange={e => setF({ ...f, halfPrice: e.target.value })} /></div>
                <div><label className={lab}>Half crate cost ({currency})</label><input className={input} type="number" step="0.01" placeholder="empty = half" value={f.halfCost} onChange={e => setF({ ...f, halfCost: e.target.value })} /></div>
              </div>
            )}
            <p className="text-[11px] text-slate-500">Price and cost above are for ONE bottle. Stock is counted in bottles; selling a {crate ? 'crate (or half crate)' : 'box'} takes its bottles out of stock. {crate ? 'Leave the half crate price empty to charge exactly half.' : 'Leave empty if it is only sold per bottle.'}</p>
          </div>
        )}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2">
          <p className="text-xs font-bold text-amber-400">Bulk (wholesale) price, optional</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lab}>Buy this many or more</label><input className={input} type="number" min="2" placeholder="e.g. 10" value={f.bulkQty} onChange={e => setF({ ...f, bulkQty: e.target.value })} /></div>
            <div><label className={lab}>Price each ({currency})</label><input className={input} type="number" step="0.01" placeholder="e.g. 245.00" value={f.bulkPrice} onChange={e => setF({ ...f, bulkPrice: e.target.value })} /></div>
          </div>
          <p className="text-[11px] text-slate-500">The bulk price is used automatically when the customer buys this many or more. Leave empty if there is only one price.</p>
        </div>
        <div><label className={lab}>Warn me when stock is at or below</label><input className={input} type="number" value={f.minThreshold} onChange={e => setF({ ...f, minThreshold: e.target.value })} /></div>
        {err && <p className="text-xs text-rose-400">{err}</p>}
        <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl">Save changes</button>
      </form>
    </div>
  );
}

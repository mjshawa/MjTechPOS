import React, { useState } from 'react';
import { X, Store, Printer } from 'lucide-react';
import { BusinessInfo, BRAND, QrMode, SignatureMode, DocTitle } from './brand';

/** Owner-only: the name, contact details and receipt layout that appear on receipts and reports. Saved on this device. */
export default function BusinessModal({ business, onSave, onClose, onTestPrint }: {
  business: BusinessInfo; onSave: (b: BusinessInfo) => void; onClose: () => void; onTestPrint?: (b: BusinessInfo) => void;
}) {
  const [f, setF] = useState<BusinessInfo>({ ...business });
  const set = (patch: Partial<BusinessInfo>) => setF(prev => ({ ...prev, ...patch }));
  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500';
  const lab = 'text-xs text-slate-400 font-bold';
  const head = 'text-[11px] uppercase tracking-wider text-amber-400 font-extrabold pt-2 border-t border-slate-800';
  const check = 'flex items-center gap-2 text-xs text-slate-300 cursor-pointer';

  const clean = (): BusinessInfo => {
    const t = (v: string) => (v || '').trim();
    return { ...f, name: t(f.name), address: t(f.address), phone: t(f.phone), tpin: t(f.tpin), footer: t(f.footer),
      tagline: t(f.tagline), email: t(f.email), website: t(f.website), hours: t(f.hours), vatNo: t(f.vatNo),
      payNote: t(f.payNote), policy: t(f.policy), qrText: t(f.qrText), qrCaption: t(f.qrCaption),
      feedMm: Math.max(0, Math.min(40, Number(f.feedMm) || 0)) };
  };
  const needsText = f.qrMode === 'payment' || f.qrMode === 'website' || f.qrMode === 'custom';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <form onSubmit={e => { e.preventDefault(); onSave(clean()); }}
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl text-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-extrabold flex items-center gap-2"><Store className="h-5 w-5 text-amber-400" /> Business &amp; receipt details</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-slate-400">These appear on every receipt and printed report, and as the name at the top of the menu.</p>

        <div><label className={lab}>Business name</label><input className={input} placeholder="e.g. Chilanga Bar & Wholesale" value={f.name} onChange={e => set({ name: e.target.value })} autoFocus /></div>
        <div><label className={lab}>Slogan / what you sell (optional)</label><input className={input} placeholder="e.g. Cold drinks · Groceries · Wholesale" value={f.tagline} onChange={e => set({ tagline: e.target.value })} /></div>
        <div><label className={lab}>Address / location (optional)</label><input className={input} placeholder="e.g. Plot 123, Great East Rd, Lusaka" value={f.address} onChange={e => set({ address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>Phone (optional)</label><input className={input} placeholder="097XXXXXXX" value={f.phone} onChange={e => set({ phone: e.target.value })} /></div>
          <div><label className={lab}>Email (optional)</label><input className={input} value={f.email} onChange={e => set({ email: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>TPIN (optional)</label><input className={input} placeholder="10 digits" value={f.tpin} onChange={e => set({ tpin: e.target.value })} /></div>
          <div><label className={lab}>VAT reg. no. (only if VAT-registered)</label><input className={input} value={f.vatNo} onChange={e => set({ vatNo: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>Website / social (optional)</label><input className={input} placeholder="facebook.com/yourbar" value={f.website} onChange={e => set({ website: e.target.value })} /></div>
          <div><label className={lab}>Opening hours (optional)</label><input className={input} placeholder="Open daily 10:00 - 02:00" value={f.hours} onChange={e => set({ hours: e.target.value })} /></div>
        </div>

        <p className={head}>Receipt layout</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>Heading on the receipt</label>
            <select className={input} value={f.docTitle} onChange={e => set({ docTitle: e.target.value as DocTitle })}>
              {['RECEIPT', 'CASH SALE', 'SALES RECEIPT', 'TAX INVOICE'].map(o => <option key={o} value={o}>{o}</option>)}
            </select></div>
          <div><label className={lab}>Paper (Xprinter roll)</label>
            <select className={input} value={f.paper} onChange={e => set({ paper: e.target.value as '80' | '58' })}>
              <option value="80">80 mm (XP-80 series)</option><option value="58">58 mm (XP-58 series)</option>
            </select></div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className={check}><input type="checkbox" checked={f.showCashier} onChange={e => set({ showCashier: e.target.checked })} /> Show who served</label>
          <label className={check}><input type="checkbox" checked={f.showItemCount} onChange={e => set({ showItemCount: e.target.checked })} /> Show number of items</label>
        </div>
        <div><label className={lab}>Payment details (optional)</label><input className={input} placeholder="Airtel Money 097XXXXXXX · MTN MoMo 096XXXXXXX (Chilanga Bar)" value={f.payNote} onChange={e => set({ payNote: e.target.value })} /></div>
        <div><label className={lab}>Returns / terms line (optional)</label><input className={input} value={f.policy} onChange={e => set({ policy: e.target.value })} /></div>
        <div><label className={lab}>Message at the bottom of receipts</label><input className={input} value={f.footer} onChange={e => set({ footer: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lab}>Signature lines</label>
            <select className={input} value={f.signature} onChange={e => set({ signature: e.target.value as SignatureMode })}>
              <option value="none">None</option><option value="customer">Customer signature</option><option value="both">Customer + authorised / stamp</option>
            </select></div>
          <div><label className={lab}>Blank space at the end (mm)</label><input type="number" min={0} max={40} className={input} value={f.feedMm} onChange={e => set({ feedMm: Number(e.target.value) })} /></div>
        </div>

        <p className={head}>QR code</p>
        <div><label className={lab}>What should the QR code hold?</label>
          <select className={input} value={f.qrMode} onChange={e => set({ qrMode: e.target.value as QrMode })}>
            <option value="none">No QR code</option>
            <option value="receipt">Receipt details (business, TPIN, receipt no., date, total)</option>
            <option value="payment">Payment link / mobile money number</option>
            <option value="website">Website / Facebook / WhatsApp link</option>
            <option value="custom">Any text I type</option>
          </select></div>
        {needsText && (
          <div><label className={lab}>{f.qrMode === 'payment' ? 'Payment link or number' : f.qrMode === 'website' ? 'Link' : 'Text'}</label>
            <input className={input} placeholder={f.qrMode === 'website' ? 'https://wa.me/260971234567' : ''} value={f.qrText} onChange={e => set({ qrText: e.target.value })} /></div>
        )}
        {f.qrMode !== 'none' && (
          <div><label className={lab}>Text under the QR code</label><input className={input} value={f.qrCaption} onChange={e => set({ qrCaption: e.target.value })} /></div>
        )}
        <p className="text-[11px] text-slate-500">The QR code is for your own use (verification, payment or contact). It is not a ZRA Smart Invoice / fiscal code.</p>

        <p className="text-[11px] text-slate-500">If your Bar and Wholesale are separate devices, enter this once on each device.</p>
        <div className="flex gap-2">
          {onTestPrint && (
            <button type="button" onClick={() => onTestPrint(clean())} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm rounded-2xl border border-slate-700 flex items-center gap-1.5">
              <Printer className="h-4 w-4" /> Test print
            </button>
          )}
          <button className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl">Save</button>
        </div>
        <p className="text-[10px] text-slate-600 text-center">{BRAND.product}</p>
      </form>
    </div>
  );
}

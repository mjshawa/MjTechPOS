import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Ban, Download, Lock, AlertCircle } from 'lucide-react';

/**
 * Expenses (money going OUT).
 *  - Recorded during the shift, so they flow straight into the End of Day figures.
 *  - After the shift is closed only the owner can still add one ("late expense"); it is attached to the shift that just closed.
 *  - Entries are never edited or deleted (sync is insert-only and money needs an audit trail). A mistake is VOIDED, which keeps the original visible.
 */
export const EXPENSE_CATEGORIES = [
  'Ice & Gas', 'Transport', 'Wages / Casuals', 'Utilities (ZESCO / Water)',
  'Airtime & Data', 'Repairs', 'Cleaning & Supplies', 'Licences & Fees', 'Security', 'Other',
];
export const PAID_FROM = [
  { id: 'till', label: 'Cash from till', hint: 'Reduces the cash that should be in the drawer' },
  { id: 'mobile', label: 'Mobile money', hint: 'Paid from the business wallet' },
  { id: 'owner', label: 'Owner / other', hint: 'Paid out of pocket, still a business cost' },
];
const paidLabel = (id: string) => PAID_FROM.find(p => p.id === id)?.label || id;

type Period = 'shift' | 'today' | '7d' | '30d' | 'all';

export default function ExpensesView({
  shiftList, shiftTotals, allLive, voidedIds, cashSales, isLocked, isOwner,
  onAdd, onVoid, money, fmtDateTime, currency,
}: {
  shiftList: any[]; shiftTotals: { total: number; till: number; mobile: number; owner: number };
  allLive: any[]; voidedIds: Set<string>; cashSales: number; isLocked: boolean; isOwner: boolean;
  onAdd: (e: { amount: number; category: string; paidFrom: string; payee: string; note: string }) => void;
  onVoid: (e: any) => void;
  money: (n: any) => string; fmtDateTime: (ts: number) => string; currency: string;
}) {
  const blank = { amount: '', category: EXPENSE_CATEGORIES[0], paidFrom: 'till', payee: '', note: '' };
  const [form, setForm] = useState(blank);
  const [period, setPeriod] = useState<Period>('shift');
  const [error, setError] = useState('');

  const canAdd = !isLocked || isOwner; // staff are locked out once the shift is closed
  const amountNum = parseFloat(form.amount);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(amountNum > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (form.category === 'Other' && !form.note.trim()) { setError('Add a short note so "Other" can be understood later.'); return; }
    if (isLocked && !window.confirm('The shift is already closed. This will be saved as a LATE expense on the shift that just closed. Continue?')) return;
    setError('');
    onAdd({ amount: amountNum, category: form.category, paidFrom: form.paidFrom, payee: form.payee.trim(), note: form.note.trim() });
    setForm({ ...blank, category: form.category, paidFrom: form.paidFrom }); // keep the last category/source: usually several in a row
  };

  // Owner history (staff only ever see the current shift)
  const history = useMemo(() => {
    if (period === 'shift') return shiftList;
    const now = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const from = period === 'today' ? startOfToday.getTime() : period === '7d' ? now - 7 * 864e5 : period === '30d' ? now - 30 * 864e5 : 0;
    return allLive.filter(x => x.ts >= from);
  }, [period, shiftList, allLive]);
  const historyTotal = history.reduce((a, x) => a + x.amount, 0);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    history.forEach(x => m.set(x.category, (m.get(x.category) || 0) + x.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [history]);

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Category', 'Amount', 'Paid from', 'Payee', 'Note', 'Recorded by', 'Late (after close)'],
      ...history.map(x => [new Date(x.ts).toLocaleString(), x.category, x.amount.toFixed(2), paidLabel(x.paidFrom), x.payee, x.note, x.by, x.afterClose ? 'yes' : ''])];
    const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const kpi = (label: string, value: React.ReactNode, tone = 'text-slate-100', sub?: string) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl min-w-0">
      <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
      <p className={`text-2xl font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{value}</p>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 } as React.CSSProperties;
  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500';

  return (
    <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-amber-400" /> Expenses
          </h2>
          <p className="text-sm text-slate-400">Write down money that goes out as it happens (ice, transport, wages, bills). Everything here is added to End of Day.</p>
        </div>

        <div style={grid}>
          {kpi('Expenses this shift', money(shiftTotals.total), 'text-rose-400', `${shiftList.length} entr${shiftList.length === 1 ? 'y' : 'ies'}`)}
          {kpi('Taken from till', money(shiftTotals.till), 'text-amber-400', 'Reduces drawer cash')}
          {isOwner
            ? kpi('Cash that should be in drawer', money(cashSales - shiftTotals.till), cashSales - shiftTotals.till < 0 ? 'text-rose-400' : 'text-emerald-400', `${money(cashSales)} cash sales − till expenses`)
            : kpi('Mobile + owner paid', money(shiftTotals.mobile + shiftTotals.owner), 'text-slate-100', 'Not from the till')}
        </div>

        {/* ADD FORM */}
        <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-100 flex items-center gap-2"><Plus className="h-4 w-4 text-amber-400" /> New expense</h3>
            {isLocked && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Shift closed{isOwner ? ' · owner late entry' : ''}
              </span>
            )}
          </div>

          {!canAdd ? (
            <p className="text-sm text-slate-400">The shift is closed. Ask the owner to record any further expense, or start a new shift.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <label className="text-xs font-bold text-slate-400">Amount ({currency})</label>
                  <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    className={input + ' text-xl font-mono font-bold'} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Paid to (optional)</label>
                  <input type="text" placeholder="Supplier / person" value={form.payee}
                    onChange={e => setForm({ ...form, payee: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Note {form.category === 'Other' ? '(required)' : '(optional)'}</label>
                  <input type="text" placeholder="e.g. 3 bags of ice" value={form.note}
                    onChange={e => setForm({ ...form, note: e.target.value })} className={input} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400">Category</label>
                <p className="text-[11px] text-slate-500 mt-0.5">For stock you bought, use Stock Tracking → Receive Stock. Do not enter it here.</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {EXPENSE_CATEGORIES.map(c => (
                    <button type="button" key={c} onClick={() => setForm({ ...form, category: c })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${form.category === c ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'}`}>{c}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400">Paid from</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }} className="mt-1.5">
                  {PAID_FROM.map(p => (
                    <button type="button" key={p.id} onClick={() => setForm({ ...form, paidFrom: p.id })}
                      className={`text-left px-4 py-3 rounded-xl border transition-all ${form.paidFrom === p.id ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}`}>
                      <span className="block text-sm font-bold">{p.label}</span>
                      <span className="block text-[11px] opacity-70">{p.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
              <button className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl">
                Save expense{amountNum > 0 ? ` · ${money(amountNum)}` : ''}
              </button>
            </>
          )}
        </form>

        {/* LIST + HISTORY */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-slate-100">{period === 'shift' ? 'This shift' : 'History'}</h3>
            {isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {([['shift', 'This shift'], ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']] as [Period, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setPeriod(id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
                  ))}
                </div>
                <button onClick={exportCsv} disabled={!history.length}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            )}
          </div>

          {isOwner && period !== 'shift' && byCategory.length > 0 && (
            <div className="space-y-1.5">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="text-xs">
                  <div className="flex justify-between text-slate-300"><span>{cat}</span><span className="font-mono font-bold">{money(amt)}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden"><div className="h-full bg-amber-500/70" style={{ width: `${(amt / (byCategory[0][1] || 1)) * 100}%` }} /></div>
                </div>
              ))}
              <p className="text-right text-xs font-bold text-slate-400 pt-1">Total {money(historyTotal)}</p>
            </div>
          )}

          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No expenses recorded{period === 'shift' ? ' this shift' : ' for this period'} yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((x: any) => (
                <div key={x.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-200 text-sm">
                      {x.category}
                      {x.afterClose && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">LATE</span>}
                    </p>
                    <p className="text-slate-500">{fmtDateTime(x.ts)} · {paidLabel(x.paidFrom)} · {x.by}</p>
                    {(x.payee || x.note) && <p className="text-slate-400">{[x.payee, x.note].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <div className="text-right flex items-start gap-3">
                    <p className="font-mono font-extrabold text-rose-400 text-base">-{money(x.amount)}</p>
                    {isOwner && (
                      <button onClick={() => onVoid(x)} title="Void this expense"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"><Ban className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {voidedIds.size > 0 && isOwner && <p className="text-[11px] text-slate-600">{voidedIds.size} voided entr{voidedIds.size === 1 ? 'y is' : 'ies are'} hidden from totals and kept on record.</p>}
        </div>
      </div>
    </div>
  );
}

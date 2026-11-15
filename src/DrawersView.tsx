import React, { useMemo, useState } from 'react';
import { Wallet, Check, X, ChevronDown, ChevronRight, AlertCircle, Lock, Unlock, Minus, Ban, Package } from 'lucide-react';
import { buildStaffRecords, OpenDrawer, STAFF_SEE_RESULT, Verdict, verdictOf, DayRow, Figures, expectedCash, dayKey } from './drawers';

/**
 * Staff cash drawers.
 *  - Staff: open "my drawer" (cash they were given to start), sell, then count their cash and hand it in. They never see the
 *    expected figure while counting (blind count), so nobody can "make the count fit".
 *  - Owner: sees every staff member, the days they worked, and for each drawer whether the money was right (tick) or not (cross),
 *    with the exact amount short or over. Can also close a drawer for someone who forgot.
 */

type Period = 'today' | '7d' | '30d' | 'all';
const DAY = 864e5;

/** Tick for exact, cross for short/over, dash for "not counted". */
export function VerdictBadge({ verdict, variance, money, compact }: { verdict: Verdict; variance: number | null; money: (n: any) => string; compact?: boolean }) {
  if (verdict === 'none') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500"><Minus className="h-3.5 w-3.5" />{!compact && 'Not counted'}</span>;
  if (verdict === 'ok') return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
      <span className="h-5 w-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center"><Check className="h-3.5 w-3.5" /></span>{!compact && 'Correct'}
    </span>
  );
  const short = verdict === 'short';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${short ? 'text-rose-400' : 'text-amber-400'}`}>
      <span className={`h-5 w-5 rounded-full border flex items-center justify-center ${short ? 'bg-rose-500/15 border-rose-500/40' : 'bg-amber-500/15 border-amber-500/40'}`}><X className="h-3.5 w-3.5" /></span>
      {short ? `Short ${money(Math.abs(variance || 0))}` : `Over ${money(variance || 0)}`}
    </span>
  );
}

export default function DrawersView({
  isOwner, user, staffList, openDrawers, drawers, sales, myOpen, figuresFor, canOpen,
  stockBuys, stockLog, onStockBuy, onVoid, onOpen, onClose, money, fmtDateTime, currency,
}: {
  isOwner: boolean; user: { id: string; name: string }; staffList: { id: string; name: string; role?: string }[];
  openDrawers: Record<string, OpenDrawer>; drawers: any[]; sales: any[]; myOpen: OpenDrawer | null;
  figuresFor: (d: OpenDrawer) => Figures; canOpen: boolean;
  stockBuys: any[]; stockLog: any[]; onStockBuy: (f: { amount: number; supplier: string; note: string }) => void; onVoid: (e: any) => void;
  onOpen: (float: number) => void; onClose: (counted: number, d: OpenDrawer) => void;
  money: (n: any) => string; fmtDateTime: (ts: number) => string; currency: string;
}) {
  const [period, setPeriod] = useState<Period>('7d');
  const [floatText, setFloatText] = useState('');
  const [countText, setCountText] = useState('');
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ownerCounts, setOwnerCounts] = useState<Record<string, string>>({});
  const [justClosed, setJustClosed] = useState(false);
  const [buy, setBuy] = useState({ amount: '', supplier: '', note: '' });

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 } as React.CSSProperties;
  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500';
  const kpi = (label: string, value: React.ReactNode, tone = 'text-slate-100', sub?: string) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl min-w-0">
      <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
      <p className={`text-2xl font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{value}</p>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  );
  const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };

  const from = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return period === 'today' ? t.getTime() : period === '7d' ? t.getTime() - 6 * DAY : period === '30d' ? t.getTime() - 29 * DAY : 0;
  }, [period]);

  const open = Object.values(openDrawers);
  const records = useMemo(
    () => (isOwner ? buildStaffRecords({ drawers, open, sales, staff: staffList, from }) : []),
    [isOwner, drawers, openDrawers, sales, staffList, from]
  );

  // ───────────── STAFF VIEW ─────────────
  if (!isOwner) {
    const mine = drawers.filter(d => d.staffId === user.id).slice(0, 14);
    const f = myOpen ? figuresFor(myOpen) : null;
    const submitOpen = (e: React.FormEvent) => {
      e.preventDefault();
      const v = floatText.trim() === '' ? 0 : parseFloat(floatText);
      if (!isFinite(v) || v < 0) { setError('Type the cash you were given to start. Use 0 if you were given none.'); return; }
      setError(''); setJustClosed(false); onOpen(v); setFloatText('');
    };
    const submitClose = (e: React.FormEvent) => {
      e.preventDefault();
      const v = parseFloat(countText);
      if (countText.trim() === '' || !isFinite(v) || v < 0) { setError('Count ALL the cash in your drawer and type the total.'); return; }
      if (!window.confirm(`Hand in your drawer with ${money(v)} counted?\n\nYou cannot change this afterwards.`)) return;
      setError(''); onClose(v, myOpen!); setCountText(''); setJustClosed(true);
    };
    return (
      <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2"><Wallet className="h-6 w-6 text-amber-400" /> My Drawer</h2>
            <p className="text-sm text-slate-400">Your own cash. Open it before you sell, count it when you finish.</p>
          </div>

          {!myOpen ? (
            <form onSubmit={submitOpen} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-slate-100 flex items-center gap-2"><Unlock className="h-4 w-4 text-amber-400" /> Open my drawer</h3>
              {justClosed && <p className="text-sm text-emerald-400 flex items-center gap-1.5"><Check className="h-4 w-4" /> Your drawer was handed in. The owner will check it.</p>}
              <div>
                <label className="text-xs font-bold text-slate-400">Cash you were given to start ({currency})</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={floatText} onChange={e => setFloatText(e.target.value)} className={input + ' text-xl font-mono font-bold'} />
                <p className="text-[11px] text-slate-500 mt-1">The change money in the drawer when you start. Leave it empty if the drawer started with nothing.</p>
              </div>
              {error && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
              <button disabled={!canOpen} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm rounded-2xl">Open drawer and start selling</button>
            </form>
          ) : (
            <form onSubmit={submitClose} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-slate-100 flex items-center gap-2"><Lock className="h-4 w-4 text-amber-400" /> Close my drawer</h3>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Open since {fmtDateTime(myOpen.openedAt)}</span>
              </div>
              <p className="text-sm text-slate-400">{f?.salesCount || 0} sale{f?.salesCount === 1 ? '' : 's'} on your drawer so far. Count only the CASH (not mobile money or card), then type the total.</p>
              <div>
                <label className="text-xs font-bold text-slate-400">Cash counted in my drawer ({currency})</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Count it, then type it" value={countText} onChange={e => setCountText(e.target.value)} className={input + ' text-xl font-mono font-bold'} />
              </div>
              {error && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
              <button className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl">Hand in my drawer{countText && isFinite(parseFloat(countText)) ? ` · ${money(parseFloat(countText))}` : ''}</button>
            </form>
          )}

          {myOpen && (
            <form onSubmit={e => {
              e.preventDefault();
              const v = parseFloat(buy.amount);
              if (!(v > 0)) { setError('Type how much cash you took for the stock.'); return; }
              if (!window.confirm(`Record ${money(v)} taken from your drawer to buy stock?\n\nThe drawer will expect ${money(v)} less cash. Only the owner can cancel it.`)) return;
              setError(''); onStockBuy({ amount: v, supplier: buy.supplier.trim(), note: buy.note.trim() }); setBuy({ amount: '', supplier: '', note: '' });
            }} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2"><Package className="h-4 w-4 text-amber-400" /> Took cash from my drawer to buy stock?</h3>
              <p className="text-xs text-slate-400">Record it here so your drawer still balances. This is a stock purchase, <b>not an expense</b>: it is not a loss, it becomes a cost only when the stock is sold. For ice, transport, wages and other running costs use <b>Expenses</b> instead.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div><label className="text-xs font-bold text-slate-400">Cash taken ({currency})</label>
                  <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={buy.amount} onChange={e => setBuy({ ...buy, amount: e.target.value })} className={input + ' font-mono font-bold'} /></div>
                <div><label className="text-xs font-bold text-slate-400">Supplier / where (optional)</label>
                  <input type="text" placeholder="e.g. Zambian Breweries" value={buy.supplier} onChange={e => setBuy({ ...buy, supplier: e.target.value })} className={input} /></div>
                <div><label className="text-xs font-bold text-slate-400">What for (optional)</label>
                  <input type="text" placeholder="e.g. 5 crates Mosi" value={buy.note} onChange={e => setBuy({ ...buy, note: e.target.value })} className={input} /></div>
              </div>
              <button className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm rounded-xl border border-slate-700">Record cash taken for stock</button>
              {stockBuys.filter(b => b.byId === user.id && b.ts >= myOpen.openedAt).length > 0 && (
                <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
                  <p className="font-bold uppercase">Taken from this drawer</p>
                  {stockBuys.filter(b => b.byId === user.id && b.ts >= myOpen.openedAt).map(b => (
                    <p key={b.id}>{hhmm(b.ts)} · {money(b.amount)}{b.payee ? ` · ${b.payee}` : ''}{b.note ? ` · ${b.note}` : ''}</p>
                  ))}
                </div>
              )}
            </form>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-100">My recent drawers</h3>
            {mine.length === 0 ? <p className="text-xs text-slate-500">Nothing handed in yet.</p> : (
              <div className="space-y-2">
                {mine.map((d: any) => (
                  <div key={d.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-2 items-center">
                    <div>
                      <p className="font-bold text-slate-200 text-sm">{dayLabel(dayKey(d.openedAt))}</p>
                      <p className="text-slate-500">{hhmm(d.openedAt)} → {hhmm(d.closedAt)} · {d.salesCount} sale{d.salesCount === 1 ? '' : 's'}</p>
                    </div>
                    {STAFF_SEE_RESULT
                      ? <VerdictBadge verdict={verdictOf(d.variance)} variance={d.variance} money={money} />
                      : <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Handed in</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────── OWNER VIEW ─────────────
  const total = records.reduce((a, r) => ({
    counted: a.counted + r.counted, ok: a.ok + r.ok, bad: a.bad + r.bad, short: a.short + r.shortTotal, over: a.over + r.overTotal, noCount: a.noCount + r.noCountDays,
  }), { counted: 0, ok: 0, bad: 0, short: 0, over: 0, noCount: 0 });

  const ownerClose = (d: OpenDrawer) => {
    const v = parseFloat(ownerCounts[d.staffId] || '');
    if (!isFinite(v) || v < 0) { setError(`Type the cash counted for ${d.staffName}.`); return; }
    if (!window.confirm(`Close ${d.staffName}'s drawer with ${money(v)} counted?\n\nIt will be recorded as closed by you.`)) return;
    setError(''); onClose(v, d); setOwnerCounts(p => ({ ...p, [d.staffId]: '' }));
  };

  const rowView = (x: DayRow) => (
    <div key={x.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-200 text-sm">{dayLabel(x.day)}</p>
          <p className="text-slate-500">
            {x.noCount ? `${x.salesCount} sale${x.salesCount === 1 ? '' : 's'} with no drawer opened` : x.open ? `Open since ${hhmm(x.openedAt)}` : `${hhmm(x.openedAt)} → ${hhmm(x.closedAt as number)} · ${x.salesCount} sale${x.salesCount === 1 ? '' : 's'}`}
            {x.closedBy && x.closedBy !== 'self' ? ` · closed by ${x.closedBy}` : ''}
          </p>
        </div>
        {x.open ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Open now</span>
          : <VerdictBadge verdict={x.verdict} variance={x.variance} money={money} />}
      </div>
      {!x.open && (
        <div className="mt-2 grid gap-x-4 gap-y-1 text-slate-400" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          <span>Sold <b className="font-mono text-slate-200">{money(x.salesTotal)}</b></span>
          {!x.noCount && x.stockBought > 0 && <span>Stock bought <b className="font-mono text-slate-200">{money(x.stockBought)}</b></span>}
          {!x.noCount && x.tillExpenses > 0 && <span>Expenses paid <b className="font-mono text-slate-200">{money(x.tillExpenses)}</b></span>}
          {!x.noCount && <span>Should have <b className="font-mono text-slate-200">{money(x.expected)}</b></span>}
          {!x.noCount && <span>Counted <b className="font-mono text-slate-200">{money(x.counted)}</b></span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2"><Wallet className="h-6 w-6 text-amber-400" /> Staff Drawers</h2>
            <p className="text-sm text-slate-400">Each staff member counts their own cash. See who is short, and which days each person worked.</p>
          </div>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']] as [Period, string][]).map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${period === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div style={grid}>
          {kpi('Total short', money(total.short), total.short > 0 ? 'text-rose-400' : 'text-emerald-400', total.over > 0 ? `plus ${money(total.over)} over` : 'Missing cash in this period')}
          {kpi('Drawers counted', total.counted, 'text-slate-100', `${total.ok} correct · ${total.bad} not`)}
          {kpi('Correct', <span className="flex items-center gap-2"><Check className="h-5 w-5" />{total.ok}</span>, 'text-emerald-400', 'Counted cash matched')}
          {kpi('Not correct', <span className="flex items-center gap-2"><X className="h-5 w-5" />{total.bad}</span>, total.bad ? 'text-rose-400' : 'text-slate-100', total.noCount ? `${total.noCount} day${total.noCount === 1 ? '' : 's'} sold with no count` : 'Short or over')}
        </div>

        {error && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}

        {open.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-100">Open drawers right now</h3>
            <p className="text-[11px] text-slate-500">Drawers opened on this device. Normally staff count and hand in their own. Use this if someone left without counting.</p>
            {open.map(d => {
              const f = figuresFor(d);
              const exp = expectedCash(d.float, f);
              return (
                <div key={d.staffId} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-200 text-sm">{d.staffName}</p>
                    <p className="text-slate-500">Open since {fmtDateTime(d.openedAt)} · {f.salesCount} sale{f.salesCount === 1 ? '' : 's'} · started with {money(d.float)}</p>
                    <p className="text-slate-400">Should have <b className="font-mono text-slate-200">{money(exp)}</b> so far</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={`Counted (${currency})`} value={ownerCounts[d.staffId] || ''}
                      onChange={e => setOwnerCounts(p => ({ ...p, [d.staffId]: e.target.value }))}
                      className="w-40 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500" />
                    <button onClick={() => ownerClose(d)} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700">Close drawer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2"><Package className="h-4 w-4 text-amber-400" /> Stock bought with drawer cash</h3>
          <p className="text-[11px] text-slate-500">Cash a staff member took from their drawer to buy stock. It is <b>not an expense</b> and not a loss: it only becomes a cost when the stock is sold. When the delivery arrives, tick it off in Stock Tracking → Restock (&quot;Paid with drawer cash?&quot;). Cash with no delivery recorded needs a question.</p>
          {(() => {
            const list = stockBuys.filter(b => b.ts >= from).sort((a, b) => b.ts - a.ts);
            if (!list.length) return <p className="text-xs text-slate-500">None in this period.</p>;
            return (
              <div className="space-y-2">
                {list.map(b => {
                  const got = stockLog.filter(l => l.buyId === b.id);
                  return (
                    <div key={b.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 text-sm">{money(b.amount)} <span className="font-normal text-slate-400">· {b.by}</span></p>
                        <p className="text-slate-500">{fmtDateTime(b.ts)}{b.payee ? ` · ${b.payee}` : ''}{b.note ? ` · ${b.note}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {got.length > 0
                          ? <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold"><span className="h-5 w-5 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center"><Check className="h-3.5 w-3.5" /></span>Delivery recorded: {got.map(l => `${l.name} ×${l.qty}`).join(', ')}</span>
                          : <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold"><span className="h-5 w-5 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center"><X className="h-3.5 w-3.5" /></span>No delivery recorded yet</span>}
                        <button onClick={() => onVoid(b)} title="Cancel this entry (it was a mistake)" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"><Ban className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-slate-100">By staff member</h3>
          {records.length === 0 ? <p className="text-xs text-slate-500">No staff accounts yet. Add people under Team.</p> : (
            <div className="space-y-2">
              {records.map(r => {
                const isOpen = openKey === r.key;
                const verdict: Verdict = r.counted === 0 ? 'none' : r.shortTotal > 0 ? 'short' : r.overTotal > 0 ? 'over' : 'ok';
                return (
                  <div key={r.key} className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                    <button onClick={() => setOpenKey(isOpen ? null : r.key)} className="w-full text-left p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/60">
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100 text-sm truncate">{r.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {r.daysWorked} day{r.daysWorked === 1 ? '' : 's'} worked · sold {money(r.salesTotal)}
                            {r.counted > 0 && <> · <span className="text-emerald-400">{r.ok} ✓</span> <span className={r.bad ? 'text-rose-400' : ''}>{r.bad} ✗</span></>}
                            {r.noCountDays > 0 && <span className="text-amber-400"> · {r.noCountDays} not counted</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {r.counted === 0 ? <span className="text-[11px] text-slate-500">{r.rows.length ? 'No count yet' : 'No work in this period'}</span>
                          : <VerdictBadge verdict={verdict} variance={verdict === 'short' ? -r.shortTotal : verdict === 'over' ? r.overTotal : 0} money={money} />}
                        {r.shortTotal > 0 && r.overTotal > 0 && <p className="text-[11px] text-amber-400">and over {money(r.overTotal)} on other days</p>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-800 p-3 space-y-2">
                        {r.rows.length === 0 ? <p className="text-xs text-slate-500">No days worked in this period.</p> : r.rows.map(rowView)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-600">Sales by the owner are not counted here. Shortage = cash counted minus the cash that should be there (start cash + cash sales − cash refunds − cash paid out of the till).</p>
        </div>
      </div>
    </div>
  );
}

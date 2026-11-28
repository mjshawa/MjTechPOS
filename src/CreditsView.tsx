import React, { useMemo, useState } from 'react';
import { HandCoins, Plus, Search, ChevronDown, ChevronRight, Ban, AlertCircle, Check, ShieldCheck } from 'lucide-react';
import { CreditCustomer, CreditPolicy, CustLedger, payLabel, r2 } from './credits';

/**
 * Credits: customers who take goods now and pay later.
 *  - Owner: approves customers, sets each customer's limit, blocks / unblocks, sets the credit rules, cancels a wrong payment.
 *  - Staff: see who owes what (to check a limit at the till), add a customer only if the owner allows it, and RECEIVE PAYMENT
 *    (cash goes into their own drawer, so the drawer still balances).
 */
type Props = {
  isOwner: boolean; user: { id: string; name: string };
  customers: CreditCustomer[]; policy: CreditPolicy; ledger: Map<string, CustLedger>; payments: any[];
  given: { count: number; total: number }; collected: { count: number; total: number; cash: number; mobile: number; card: number };
  canTakeCash: boolean; // false for a staff member with no open drawer (cash would have nowhere to go)
  onSaveCustomer: (c: CreditCustomer) => void; onSavePolicy: (p: CreditPolicy) => void;
  onReceive: (p: { customer: CreditCustomer; amount: number; method: string; note: string }) => string;
  onVoid: (payment: any) => void;
  money: (n: any) => string; fmtDateTime: (ts: number) => string; currency: string; newId: () => string;
};

const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500';
const parseLimit = (t: string): number | null | undefined => {           // '' = no limit, undefined = not a valid number
  if (t.trim() === '') return null;
  const v = parseFloat(t);
  return isFinite(v) && v >= 0 ? r2(v) : undefined;
};

export default function CreditsView(p: Props) {
  const { isOwner, user, customers, policy, ledger, payments, given, collected, canTakeCash, money, fmtDateTime, currency } = p;
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [add, setAdd] = useState({ name: '', phone: '', limit: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [limitEdit, setLimitEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);

  const canAdd = isOwner || policy.staffMayAdd;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers
      .filter(c => !t || c.name.toLowerCase().includes(t) || (c.phone || '').includes(t))
      .map(c => ({ c, L: ledger.get(c.id) }))
      .filter(x => !onlyOwing || (x.L?.balance || 0) > 0.005)
      .sort((a, b) => (b.L?.balance || 0) - (a.L?.balance || 0) || a.c.name.localeCompare(b.c.name));
  }, [customers, ledger, q, onlyOwing]);
  const outstanding = r2([...ledger.values()].reduce((a, l) => a + l.balance, 0));
  const owing = [...ledger.values()].filter(l => l.balance > 0.005).length;
  const overdueTotal = r2([...ledger.values()].reduce((a, l) => a + l.overdueAmount, 0));

  const kpi = (label: string, value: React.ReactNode, tone = 'text-slate-100', sub?: string) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl min-w-0">
      <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
      <p className={`text-2xl font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{value}</p>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  );

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = add.name.trim();
    if (!name) { setMsg('Type the customer\'s name.'); return; }
    if (customers.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) { setMsg(`${name} is already on the list.`); return; }
    let limit: number | null = policy.defaultLimit;
    if (isOwner) { const l = parseLimit(add.limit); if (l === undefined) { setMsg('The limit must be a number (leave it empty for no limit).'); return; } limit = l; }
    p.onSaveCustomer({ kind: 'cust', id: p.newId(), name, phone: add.phone.trim(), limit, blocked: false, createdAt: Date.now(), createdBy: user.name, addedByStaff: !isOwner });
    setAdd({ name: '', phone: '', limit: '' }); setShowAdd(false); setMsg('');
  };

  const submitPay = (e: React.FormEvent, c: CreditCustomer, balance: number) => {
    e.preventDefault();
    const amount = parseFloat(pay.amount);
    if (!(amount > 0)) { setMsg('Type the amount received.'); return; }
    if (amount > balance + 0.005) { setMsg(`${c.name} only owes ${money(balance)}.`); return; }
    if (pay.method === 'cash' && !canTakeCash) { setMsg('Open your drawer first (My Drawer). Cash you receive is counted in your drawer.'); return; }
    if (!window.confirm(`Receive ${money(amount)} by ${payLabel(pay.method)} from ${c.name}?\n\nAfter this they will owe ${money(Math.max(0, r2(balance - amount)))}.`)) return;
    const err = p.onReceive({ customer: c, amount, method: pay.method, note: pay.note.trim() });
    if (err) { setMsg(err); return; }
    setPay({ amount: '', method: 'cash', note: '' }); setPayFor(null); setMsg('');
  };

  const dateOnly = (ts: number) => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2"><HandCoins className="h-6 w-6 text-amber-400" /> Credits</h2>
            <p className="text-sm text-slate-400">Customers who take now and pay later. Credit is a sale, but no money comes in until the customer pays.</p>
          </div>
          {canAdd && <button onClick={() => { setShowAdd(!showAdd); setMsg(''); }} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl flex items-center gap-2"><Plus className="h-4 w-4" /> Add credit customer</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {kpi('Total owed to you', money(outstanding), outstanding > 0 ? 'text-amber-400' : 'text-slate-100', `${owing} customer${owing === 1 ? '' : 's'} owing`)}
          {kpi('Overdue', money(overdueTotal), overdueTotal > 0 ? 'text-rose-400' : 'text-emerald-400', 'Past the due date')}
          {kpi(isOwner ? 'Credit given this shift' : 'My credit this shift', money(given.total), 'text-slate-100', `${given.count} credit sale${given.count === 1 ? '' : 's'}`)}
          {kpi(isOwner ? 'Collected this shift' : 'I collected this shift', money(collected.total), 'text-emerald-400', `cash ${money(collected.cash)} · mobile ${money(collected.mobile)}${collected.card ? ` · card ${money(collected.card)}` : ''}`)}
        </div>

        {msg && <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {msg}</p>}

        {showAdd && canAdd && (
          <form onSubmit={submitAdd} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-100">New credit customer</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <div><label className="text-xs font-bold text-slate-400">Name</label><input className={input} value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} placeholder="e.g. Mr. Banda" /></div>
              <div><label className="text-xs font-bold text-slate-400">Phone (optional)</label><input className={input} inputMode="tel" value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} placeholder="097..." /></div>
              {isOwner
                ? <div><label className="text-xs font-bold text-slate-400">Credit limit ({currency})</label><input className={input + ' font-mono'} inputMode="decimal" value={add.limit} onChange={e => setAdd({ ...add, limit: e.target.value })} placeholder="Empty = no limit" /></div>
                : <div><label className="text-xs font-bold text-slate-400">Credit limit</label><p className="text-sm text-slate-300 mt-3">{policy.defaultLimit === null ? 'No limit' : `${money(policy.defaultLimit)} (set by the owner)`}</p></div>}
            </div>
            <div className="flex gap-2">
              <button className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl">Save customer</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-5 py-2.5 bg-slate-800 text-slate-200 font-bold text-sm rounded-xl border border-slate-700">Cancel</button>
            </div>
          </form>
        )}

        {isOwner && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-100 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-400" /> Credit rules (owner)</h3>
            <p className="text-xs text-slate-400">Staff can only give credit to customers on this list, and never above the customer's limit. Only you can raise a limit, block a customer, or sell above a limit.</p>
            <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={policy.staffMayAdd} onChange={e => p.onSavePolicy({ ...policy, staffMayAdd: e.target.checked })} />
              <span>Staff may add new credit customers themselves <span className="text-slate-500">(they get the default limit below, which you can change later)</span></span>
            </label>
            {policy.staffMayAdd && (
              <div className="max-w-xs">
                <label className="text-xs font-bold text-slate-400">Default limit for customers added by staff ({currency})</label>
                <input className={input + ' font-mono'} inputMode="decimal" defaultValue={policy.defaultLimit === null ? '' : String(policy.defaultLimit)} placeholder="Empty = no limit"
                  onBlur={e => { const l = parseLimit(e.target.value); if (l === undefined) { setMsg('The default limit must be a number.'); return; } if (l !== policy.defaultLimit) p.onSavePolicy({ ...policy, defaultLimit: l }); }} />
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <h3 className="font-bold text-slate-100">Credit customers ({customers.length})</h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer"><input type="checkbox" checked={onlyOwing} onChange={e => setOnlyOwing(e.target.checked)} /> Only who owes</label>
              <div className="relative"><Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone" className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500" /></div>
            </div>
          </div>

          {customers.length === 0 ? <p className="text-xs text-slate-500">{canAdd ? 'No credit customers yet. Tap "Add credit customer".' : 'No credit customers yet. Ask the owner to add the customer.'}</p>
            : rows.length === 0 ? <p className="text-xs text-slate-500">Nobody matches.</p> : (
            <div className="space-y-2">
              {rows.map(({ c, L }) => {
                const bal = L?.balance || 0;
                const isOpen = openId === c.id;
                const room = c.limit === null ? null : Math.max(0, r2(c.limit - bal));
                const status = c.blocked ? { t: 'Blocked', tone: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
                  : L?.overdue ? { t: `Overdue ${money(L.overdueAmount)}`, tone: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
                  : room === 0 ? { t: 'At limit', tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' }
                  : bal > 0 ? { t: 'Owing', tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30' }
                  : { t: 'Clear', tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
                return (
                  <div key={c.id} className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                    <button onClick={() => { setOpenId(isOpen ? null : c.id); setPayFor(null); setMsg(''); }} className="w-full text-left p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/60">
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-100 text-sm truncate">{c.name}{c.addedByStaff && <span className="ml-2 text-[10px] font-bold text-slate-500">added by {c.createdBy}</span>}</p>
                          <p className="text-[11px] text-slate-500">{c.phone || 'no phone'} · limit {c.limit === null ? 'none' : money(c.limit)}{room !== null && !c.blocked ? ` · can still take ${money(room)}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${status.tone}`}>{status.t}</span>
                        <span className={`font-mono font-extrabold text-base ${bal > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{money(bal)}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-800 p-3 space-y-3 text-xs">
                        {payFor === c.id ? (
                          <form onSubmit={e => submitPay(e, c, bal)} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                            <p className="font-bold text-slate-200 text-sm">Receive payment from {c.name} <span className="font-normal text-slate-500">· owes {money(bal)}</span></p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                              <div><label className="text-[11px] font-bold text-slate-400">Amount received ({currency})</label>
                                <input className={input + ' font-mono font-bold'} type="number" min="0" step="0.01" inputMode="decimal" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></div>
                              <div><label className="text-[11px] font-bold text-slate-400">Paid by</label>
                                <select className={input} value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
                                  <option value="cash">Cash (goes in my drawer)</option><option value="mobile">Mobile money</option><option value="card">Card</option>
                                </select></div>
                              <div><label className="text-[11px] font-bold text-slate-400">Note (optional)</label>
                                <input className={input} value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} placeholder="e.g. paid part" /></div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => setPay({ ...pay, amount: String(bal) })} className="px-3 py-1.5 bg-slate-800 text-slate-200 font-bold rounded-lg border border-slate-700">Pay everything ({money(bal)})</button>
                              <button className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Receive payment</button>
                              <button type="button" onClick={() => setPayFor(null)} className="px-4 py-1.5 bg-slate-800 text-slate-300 font-bold rounded-lg border border-slate-700">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {bal > 0.005 && <button onClick={() => { setPayFor(c.id); setPay({ amount: '', method: 'cash', note: '' }); setMsg(''); }} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg">Receive payment</button>}
                            {isOwner && (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <input className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500" inputMode="decimal" placeholder="Limit (empty = none)"
                                    value={limitEdit[c.id] ?? (c.limit === null ? '' : String(c.limit))} onChange={e => setLimitEdit({ ...limitEdit, [c.id]: e.target.value })} />
                                  <button onClick={() => { const l = parseLimit(limitEdit[c.id] ?? (c.limit === null ? '' : String(c.limit))); if (l === undefined) { setMsg('The limit must be a number.'); return; } p.onSaveCustomer({ ...c, limit: l }); setLimitEdit(({ [c.id]: _x, ...rest }) => rest); setMsg(''); }}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg border border-slate-700">Save limit</button>
                                </div>
                                <button onClick={() => p.onSaveCustomer({ ...c, blocked: !c.blocked })} className={`px-3 py-2 font-bold rounded-lg border flex items-center gap-1.5 ${c.blocked ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}><Ban className="h-3.5 w-3.5" /> {c.blocked ? 'Allow credit again' : 'Block credit'}</button>
                              </>
                            )}
                          </div>
                        )}

                        <div>
                          <p className="font-bold uppercase text-slate-500 mb-1">Unpaid credit sales</p>
                          {!L || L.openRows.length === 0 ? <p className="text-slate-500">Nothing unpaid.</p> : (
                            <div className="space-y-1">
                              {L.openRows.map(r => (
                                <div key={r.sale.id} className="flex flex-wrap justify-between gap-2 bg-slate-900/60 rounded-lg px-3 py-2">
                                  <span className="text-slate-300">#{r.sale.txId} · {fmtDateTime(r.sale.ts)} · {r.sale.cashier}{r.sale.credit?.note ? ` · ${r.sale.credit.note}` : ''}</span>
                                  <span className="font-mono">
                                    {r.sale.credit?.dueDate && <span className={`mr-2 ${r.overdue ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>due {r.sale.credit.dueDate}</span>}
                                    {r.paid > 0 && <span className="text-slate-500 mr-2">paid {money(r.paid)} of {money(r.due)}</span>}
                                    <b className="text-amber-400">{money(r.open)}</b>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="font-bold uppercase text-slate-500 mb-1">Payments received</p>
                          {!L || L.payments.length === 0 ? <p className="text-slate-500">No payments yet.</p> : (
                            <div className="space-y-1">
                              {L.payments.map(pm => (
                                <div key={pm.id} className="flex flex-wrap justify-between items-center gap-2 bg-slate-900/60 rounded-lg px-3 py-2">
                                  <span className="text-slate-300">{dateOnly(pm.ts)} · {payLabel(pm.method)} · received by {pm.by}{pm.note ? ` · ${pm.note}` : ''}</span>
                                  <span className="flex items-center gap-2"><b className="font-mono text-emerald-400">{money(pm.amount)}</b>
                                    {isOwner && <button onClick={() => { if (window.confirm(`Cancel this ${money(pm.amount)} payment? ${c.name} will owe it again.${pm.method === 'cash' ? ' The drawer of whoever received it will expect that cash less.' : ''}`)) p.onVoid(pm); }} title="Cancel (it was a mistake)" className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"><Ban className="h-3.5 w-3.5" /></button>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-600">What a customer owes = credit sales − refunds on them − payments received. A payment is matched to the oldest unpaid sale first.</p>
        </div>
      </div>
    </div>
  );
}

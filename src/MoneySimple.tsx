import React from 'react';

/**
 * "Your money, step by step": one shift's money in very short, plain words.
 *   Short answer on top  ->  1 Sales  2 Spending  3 Profit  4 Cash in the drawer
 * Built from the same report as the full shift record (shiftReport in App.tsx), so the numbers always match.
 * Also exports ShiftMoneyCard: the small card used in the Closed Shifts list.
 */
type Props = { r: any; money: (n: any) => string; heading?: string };

// "Today", "Yesterday" or the date, so people see WHICH day they are looking at
export const dayLabel = (ts: number) => {
  const d = new Date(ts); const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
};

// One sentence about the cash check, used by the card and the full view
export const cashVerdict = (r: any, money: (n: any) => string) => {
  const counted = r.cash.counted; const diff = r.cash.variance;
  if (counted == null) return { tone: 'bg-slate-800 border-slate-600 text-slate-200', icon: '?', text: 'Cash was not counted', sub: 'Count the cash in the drawer and type it in on the End of Day page.' };
  if (diff === 0) return { tone: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300', icon: '✓', text: 'Cash is correct', sub: 'The cash you counted is the same as the cash that should be there.' };
  if (diff < 0) return { tone: 'bg-rose-500/15 border-rose-500/50 text-rose-300', icon: '✗', text: `Cash is SHORT by ${money(Math.abs(diff))}`, sub: 'There is less cash than there should be. Money is missing.' };
  return { tone: 'bg-amber-500/15 border-amber-500/50 text-amber-300', icon: '!', text: `Cash is MORE by ${money(diff)}`, sub: 'There is more cash than there should be. Check for a mistake, for example change that was not given.' };
};

const Line = ({ label, hint, value, tone = 'text-slate-100', bold = false, sign = '' }: { label: string; hint?: string; value: string; tone?: string; bold?: boolean; sign?: string }) => (
  <div className={`flex items-start justify-between gap-3 py-2 ${bold ? 'border-t-2 border-slate-600 mt-1 pt-3' : ''}`}>
    <div className="min-w-0">
      <p className={`${bold ? 'text-base font-extrabold text-slate-100' : 'text-sm font-semibold text-slate-300'}`}>{label}</p>
      {hint && <p className="text-[12px] text-slate-500 leading-snug">{hint}</p>}
    </div>
    <p className={`font-mono whitespace-nowrap ${bold ? 'text-xl font-extrabold' : 'text-base font-bold'} ${tone}`}>{sign}{value}</p>
  </div>
);

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-1">
      <span className="h-7 w-7 shrink-0 rounded-full bg-amber-500 text-slate-950 font-extrabold text-sm flex items-center justify-center">{n}</span>
      <h4 className="text-base font-extrabold text-slate-100">{title}</h4>
    </div>
    <div className="divide-y divide-slate-800/60">{children}</div>
  </div>
);

const Big = ({ label, value, tone, note }: { label: string; value: string; tone: string; note?: string }) => (
  <div className="bg-slate-900 rounded-xl p-3 text-center min-w-0">
    <p className="text-[11px] text-slate-400 font-bold uppercase">{label}</p>
    <p className={`font-mono font-extrabold text-base sm:text-lg break-words ${tone}`}>{value}</p>
    {note && <p className="text-[10px] text-slate-500 mt-0.5">{note}</p>}
  </div>
);

// Where is the money? Cash is in the drawer; mobile money is on the phone; card is in the bank.
const Where = ({ r, money }: { r: any; money: (n: any) => string }) => (
  <div className={`grid ${r.byMethod.credit ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
    <div className="bg-slate-900 rounded-xl p-2"><p className="text-[11px] text-slate-500 font-bold">CASH</p><p className="font-mono text-sm font-bold text-slate-100">{money(r.byMethod.cash)}</p><p className="text-[10px] text-amber-400 font-bold mt-0.5">in the drawer</p></div>
    <div className="bg-slate-900 rounded-xl p-2"><p className="text-[11px] text-slate-500 font-bold">MOBILE MONEY</p><p className="font-mono text-sm font-bold text-slate-100">{money(r.byMethod.mobile)}</p><p className="text-[10px] text-slate-500 mt-0.5">on the phone</p></div>
    <div className="bg-slate-900 rounded-xl p-2"><p className="text-[11px] text-slate-500 font-bold">CARD</p><p className="font-mono text-sm font-bold text-slate-100">{money(r.byMethod.card)}</p><p className="text-[10px] text-slate-500 mt-0.5">in the bank</p></div>
    {!!r.byMethod.credit && <div className="bg-slate-900 rounded-xl p-2"><p className="text-[11px] text-slate-500 font-bold">ON CREDIT</p><p className="font-mono text-sm font-bold text-sky-300">{money(r.byMethod.credit)}</p><p className="text-[10px] text-sky-400 mt-0.5">not paid yet{r.credit?.count ? ` · ${r.credit.count} sale${r.credit.count === 1 ? '' : 's'}` : ''}</p></div>}
  </div>
);

/** Small card for the Closed Shifts list: the whole money story without opening anything. */
export function ShiftMoneyCard({ r, money, onOpen }: { r: any; money: (n: any) => string; onOpen: () => void }) {
  const v = cashVerdict(r, money);
  const handOver = Math.max(0, (r.cash.counted ?? r.cash.expected) - r.cash.float);
  const loss = r.netProfit < 0;
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-lg font-extrabold text-slate-100">{dayLabel(r.closedAt || r.openedAt)}</p>
        <p className="text-[12px] text-slate-500">Shift closed{r.closedBy ? ` by ${r.closedBy}` : ''}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Big label="Sales" value={money(r.netSales)} tone="text-emerald-400" note={`${r.salesCount} sale${r.salesCount === 1 ? '' : 's'}`} />
        <Big label="Spent" value={money(r.expenseTotal)} tone="text-rose-400" />
        <Big label={loss ? 'Loss' : 'Profit'} value={money(r.netProfit)} tone={loss ? 'text-rose-400' : 'text-amber-400'} note="what you earned" />
      </div>

      <Where r={r} money={money} />

      <div className={`rounded-xl border-2 p-3 flex items-start gap-3 ${v.tone}`}>
        <span className="text-2xl font-extrabold leading-none">{v.icon}</span>
        <div className="min-w-0">
          <p className="font-extrabold leading-tight">{v.text}</p>
          {r.cash.counted != null && <p className="text-[12px] opacity-90 mt-0.5">Cash to give the owner: <b className="font-mono">{money(handOver)}</b></p>}
        </div>
      </div>

      <button onClick={onOpen} className="w-full py-2.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-sm rounded-lg border border-slate-700 transition-colors">See the money step by step</button>
    </div>
  );
}

export default function MoneySimple({ r, money, heading }: Props) {
  const counted = r.cash.counted;
  const handOver = (counted ?? r.cash.expected) - r.cash.float; // the starting cash stays in the drawer for the next shift
  const verdict = cashVerdict(r, money);
  const loss = r.netProfit < 0;

  // spending grouped by what it was for (ice, transport...), biggest first
  const byCat = new Map<string, number>();
  r.expenses.forEach((e: any) => byCat.set(e.category || 'Other', (byCat.get(e.category || 'Other') || 0) + (e.amount || 0)));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {heading && <p className="text-sm text-slate-400">{heading}</p>}

      {/* The short answer: three numbers and the cash check */}
      <div className="bg-slate-950/60 border border-amber-500/30 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-extrabold text-amber-400 uppercase tracking-wide">The short answer</p>
        <div className="grid grid-cols-3 gap-2">
          <Big label="Sales" value={money(r.netSales)} tone="text-emerald-400" note="money from customers" />
          <Big label="Spent" value={money(r.expenseTotal)} tone="text-rose-400" note="money you paid out" />
          <Big label={loss ? 'Loss' : 'Profit'} value={money(r.netProfit)} tone={loss ? 'text-rose-400' : 'text-amber-400'} note="what you really earned" />
        </div>
        <div className={`rounded-xl border-2 p-3 flex items-start gap-3 ${verdict.tone}`}>
          <span className="text-2xl font-extrabold leading-none">{verdict.icon}</span>
          <p className="font-extrabold leading-tight">{verdict.text}</p>
        </div>
      </div>

      <Step n={1} title="Sales: money from customers">
        <Line label="Customers paid" hint={`${r.salesCount} sale${r.salesCount === 1 ? '' : 's'}`} value={money(r.grossSold)} />
        {r.refundTotal > 0 && <Line label="Money given back" hint="Refunds to customers" value={money(r.refundTotal)} tone="text-rose-400" sign="-" />}
        <Line label="Total sales" value={money(r.netSales)} tone="text-emerald-400" bold />
        <div className="pt-2"><Where r={r} money={money} /></div>
        <p className="text-[12px] text-slate-500 pt-2">Only the <b className="text-slate-300">cash</b> is in the drawer. Mobile money is on the phone. Card money is in the bank.{!!r.byMethod.credit && <> <b className="text-sky-300">Credit</b> is sold but not paid yet: the customer still owes it.</>}</p>
        {r.credit?.collected?.total > 0 && <Line label="Collected from credit customers" hint={`Paid back during this shift: cash ${money(r.credit.collected.cash)}, mobile ${money(r.credit.collected.mobile)}${r.credit.collected.card ? `, card ${money(r.credit.collected.card)}` : ''}`} value={money(r.credit.collected.total)} tone="text-emerald-400" sign="+" />}
      </Step>

      <Step n={2} title="Spending: money you paid out">
        {cats.length === 0
          ? <Line label="Nothing was spent" value={money(0)} />
          : cats.map(([c, amt]) => <Line key={c} label={c} value={money(amt)} tone="text-rose-400" sign="-" />)}
        <Line label="Total spent" hint="Ice, transport, and other things paid for" value={money(r.expenseTotal)} tone="text-rose-400" bold />
      </Step>

      <Step n={3} title={loss ? 'Profit: you lost money' : 'Profit: what you really earned'}>
        <Line label="Total sales" value={money(r.netSales)} tone="text-emerald-400" />
        <Line label="Cost of the drinks sold" hint="What you paid to buy the drinks that were sold" value={money(r.cogs)} tone="text-rose-400" sign="-" />
        <Line label="Total spent" hint="From step 2" value={money(r.expenseTotal)} tone="text-rose-400" sign="-" />
        <Line label="Lost stock" hint="Drinks that broke, spilled or went missing" value={money(r.shrinkValue)} tone="text-rose-400" sign="-" />
        <Line label={loss ? 'LOSS' : 'PROFIT'} value={money(r.netProfit)} tone={loss ? 'text-rose-400' : 'text-emerald-400'} bold />
        <p className="text-[12px] text-slate-500 pt-2">Profit is lower than sales because you must also pay for the drinks you sold.</p>
        {r.netSales > 0 && !loss && <p className="text-[12px] text-slate-500 pt-1">For every {money(100)} you sold, you kept about {money(Math.round((r.netProfit / r.netSales) * 100))}.</p>}
      </Step>

      <Step n={4} title="Cash in the drawer: is it correct?">
        <Line label="Cash at the start" hint="The money the drawer started with" value={money(r.cash.float)} />
        <Line label="Cash from sales" value={money(r.cash.sales)} tone="text-emerald-400" sign="+" />
        {r.cash.collected > 0 && <Line label="Cash collected from credit customers" hint="Debts paid back in cash" value={money(r.cash.collected)} tone="text-emerald-400" sign="+" />}
        <Line label="Cash taken out to pay for things" hint="Money taken from the drawer" value={money(r.cash.tillOut)} tone="text-rose-400" sign="-" />
        <Line label="Cash that SHOULD be there" value={money(r.cash.expected)} bold />
        <Line label="Cash you COUNTED" value={counted == null ? 'not counted' : money(counted)} bold />
        <div className={`mt-3 rounded-2xl border-2 p-4 flex items-start gap-3 ${verdict.tone}`}>
          <span className="text-3xl font-extrabold leading-none">{verdict.icon}</span>
          <div>
            <p className="text-lg font-extrabold leading-tight">{verdict.text}</p>
            <p className="text-[13px] opacity-90 mt-0.5">{verdict.sub}</p>
          </div>
        </div>
        <Line label="Cash to give the owner" hint={`Keep ${money(r.cash.float)} in the drawer for the next shift`} value={money(Math.max(0, handOver))} tone="text-amber-400" bold />
      </Step>
    </div>
  );
}

/**
 * Owner-only Excel export. Builds ONE workbook with everything the owner needs to do their own sums in Excel:
 * every sale, every item sold, per-staff totals, refunds, expenses, End-of-Day shifts, stock movements and current stock.
 * Both workspaces (Bar and Wholesale) are included, with a "Workspace" column. The library is loaded only when the button is pressed.
 */
import { Capacitor } from '@capacitor/core';
import { readCollection } from './storage';

type Opts = { currency: string; businessName: string; exportedBy: string; staffNames?: string[] };

const WORKSPACES: [string, string][] = [['bar', 'Bar'], ['retail', 'Wholesale']];
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const PAY: Record<string, string> = { cash: 'Cash', mobile: 'Mobile money', card: 'Card' };
const payLabel = (m: any) => PAY[m] || String(m || '');
const dayOf = (ts: number) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

export async function downloadExcel(o: Opts) {
  const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = o.businessName || 'MjTech POS';
  wb.created = new Date();
  const sm = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] }); // created first so it is the first tab
  const K = o.currency;
  const MONEY = `#,##0.00`;
  const DT = 'dd mmm yyyy hh:mm';
  const D = 'dd mmm yyyy';

  // ---------- gather ----------
  type Row = any;
  const sales: Row[] = [], items: Row[] = [], refunds: Row[] = [], expenses: Row[] = [], shifts: Row[] = [], stock: Row[] = [], products: Row[] = [];
  const staffSet = new Set<string>((o.staffNames || []).filter(Boolean));

  for (const [wsId, wsName] of WORKSPACES) {
    const S = readCollection(`${wsId}:salesHistory`).sort((a, b) => a.ts - b.ts);
    const R = readCollection(`${wsId}:refunds`).sort((a, b) => a.ts - b.ts);
    const E = readCollection(`${wsId}:expenses`).sort((a, b) => a.ts - b.ts);
    const C = readCollection(`${wsId}:closedShifts`).sort((a, b) => a.openedAt - b.openedAt);
    const L = readCollection(`${wsId}:stockLog`).sort((a, b) => a.ts - b.ts);
    const P = readCollection(`${wsId}:products`);

    const refundedBySale = new Map<string, number>();
    R.forEach(x => refundedBySale.set(x.saleId, (refundedBySale.get(x.saleId) || 0) + (x.amount || 0)));
    const saleById = new Map<string, any>(S.map(s => [s.id, s]));

    // which closed shift a sale belongs to (same till, between open and close); otherwise it is the current open shift
    const shiftOf = (ts: number, deviceId?: string) => {
      const c = C.find(c => ts >= c.openedAt && ts <= c.closedAt + 1 && (!c.deviceId || !deviceId || c.deviceId === deviceId));
      return c ? new Date(c.openedAt) : null;
    };

    S.forEach(s => {
      if (s.cashier) staffSet.add(s.cashier);
      const cogs = (s.items || []).reduce((a: number, i: any) => a + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
      const sh = shiftOf(s.ts, s.deviceId);
      const total = Number(s.total ?? s.grandTotal) || 0;
      sales.push({
        ws: wsName, dt: new Date(s.ts), day: dayOf(s.ts), tx: s.txId, staff: s.cashier || '', customer: s.customer || 'Walk-In Guest',
        method: payLabel(s.method || s.paymentMethod), lines: (s.items || []).length, bottles: s.bottlesCount ?? s.itemsCount ?? 0,
        subtotal: r2(s.subtotal), discount: r2(s.discountAmount), tax: r2(s.tax), total: r2(total),
        tendered: s.tendered ?? null, change: s.change ?? null, cogs: r2(cogs), refunded: r2(refundedBySale.get(s.id) || 0),
        shift: sh, shiftLabel: sh ? '' : 'Current shift',
      });
      const factor = s.subtotal > 0 ? (Number(s.discountAmount) || 0) / s.subtotal : 0;
      (s.items || []).forEach((i: any) => {
        const lineTotal = r2((Number(i.price) || 0) * (Number(i.qty) || 0));
        items.push({
          ws: wsName, dt: new Date(s.ts), day: dayOf(s.ts), tx: s.txId, staff: s.cashier || '', product: i.name, sku: i.sku || '', variant: i.variant || '',
          pack: i.pack === 'box' ? 'Box' : i.pack === 'half' ? 'Half box' : 'Single', qty: i.qty, unitPrice: r2(i.price), lineTotal,
          afterDiscount: r2(lineTotal * (1 - factor)), unitCost: r2(i.cost), lineCost: r2((Number(i.cost) || 0) * (Number(i.qty) || 0)),
          bottles: (Number(i.size) || 1) * (Number(i.qty) || 0),
        });
      });
    });

    R.forEach(x => {
      if (x.by) staffSet.add(x.by);
      const orig = saleById.get(x.saleId);
      refunds.push({
        ws: wsName, dt: new Date(x.ts), tx: x.txId, issuedBy: x.by || '', soldBy: orig?.cashier || '', method: payLabel(x.method), reason: x.reason || '',
        amount: r2(x.amount), items: (x.lines || []).map((l: any) => `${l.qty} x ${l.name}${l.variant ? ' (' + l.variant + ')' : ''}${l.restock ? ' [back to stock]' : ' [lost]'}`).join('; '),
      });
    });

    const voided = new Map<string, any>(E.filter(e => e.kind === 'void').map(e => [e.voidOf, e]));
    E.filter(e => e.kind !== 'void').forEach(e => {
      if (e.by) staffSet.add(e.by);
      const v = voided.get(e.id);
      expenses.push({
        ws: wsName, dt: new Date(e.ts), category: e.category, amount: r2(e.amount), paidFrom: ({ till: 'Cash drawer', mobile: 'Mobile money', owner: "Owner's pocket" } as any)[e.paidFrom] || e.paidFrom || '',
        payee: e.payee || '', note: e.note || '', by: e.by || '', late: e.afterClose ? 'Yes' : '', status: v ? 'Cancelled' : 'Active', cancelledBy: v?.by || '',
      });
    });

    const expByShift = new Map<string, number>();
    E.filter(e => e.kind !== 'void' && !voided.has(e.id)).forEach(e => expByShift.set(e.shiftKey, (expByShift.get(e.shiftKey) || 0) + (e.amount || 0)));
    C.forEach(c => {
      shifts.push({
        ws: wsName, opened: new Date(c.openedAt), closed: new Date(c.closedAt), closedBy: c.closedBy || '', count: c.count || 0, total: r2(c.total),
        cash: r2(c.cash), mobile: r2(c.mobile), card: r2(c.card), bar: r2(c.barSales), wholesale: r2(c.retailSales), refunds: r2(c.refundTotal),
        expenses: r2(expByShift.get(`${c.deviceId}:${c.openedAt}`) || 0), float: r2(c.cashFloat), expected: r2(c.cashExpected),
        counted: c.cashCounted ?? null, variance: c.cashVariance ?? null, shrinkUnits: c.shrinkageUnits || 0, shrinkValue: r2(c.shrinkageValue),
      });
    });

    L.forEach(l => stock.push({ ws: wsName, dt: new Date(l.ts), type: l.type === 'restock' ? 'Delivery / restock' : String(l.type || ''), product: l.name || '', qty: l.qty, cost: r2(l.cost), by: l.by || '' }));
    P.forEach(p => products.push({
      ws: wsName, sku: p.sku || '', name: p.name, category: p.subcategory || '', price: r2(p.price), cost: r2(p.cost), stock: p.stock ?? 0, opening: p.startingStock ?? 0,
      sold: p.unitsSold ?? 0, min: p.minThreshold ?? 0, boxQty: p.boxQty || '', boxPrice: p.boxPrice ? r2(p.boxPrice) : '', boxCost: p.boxCost ? r2(p.boxCost) : '',
      archived: p.archived ? 'Deleted/hidden' : 'Active',
    }));
  }

  const staffList = [...staffSet].sort((a, b) => a.localeCompare(b));

  // ---------- sheet helper ----------
  const header = (ws: any) => {
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    h.alignment = { vertical: 'middle', wrapText: true };
    h.height = 30;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const make = (name: string, cols: { h: string; k: string; w: number; f?: string }[], rows: Row[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(c => ({ header: c.h, key: c.k, width: c.w, style: c.f ? { numFmt: c.f } : {} }));
    rows.forEach(r => ws.addRow(r));
    header(ws);
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };
  const colL = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  // ---------- Sales (one row per sale) ----------
  const salesCols = [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date & time', k: 'dt', w: 18, f: DT }, { h: 'Date', k: 'day', w: 13, f: D }, { h: 'Receipt no.', k: 'tx', w: 11 },
    { h: 'Staff (cashier)', k: 'staff', w: 18 }, { h: 'Customer', k: 'customer', w: 18 }, { h: 'Payment method', k: 'method', w: 15 },
    { h: 'Lines', k: 'lines', w: 7 }, { h: 'Bottles / units', k: 'bottles', w: 9 }, { h: `Subtotal (${K})`, k: 'subtotal', w: 13, f: MONEY },
    { h: `Discount (${K})`, k: 'discount', w: 12, f: MONEY }, { h: `Tax (${K})`, k: 'tax', w: 10, f: MONEY }, { h: `TOTAL SOLD (${K})`, k: 'total', w: 14, f: MONEY },
    { h: `Cash received (${K})`, k: 'tendered', w: 14, f: MONEY }, { h: `Change given (${K})`, k: 'change', w: 13, f: MONEY },
    { h: `Cost of goods (${K})`, k: 'cogs', w: 14, f: MONEY }, { h: `Profit before refunds (${K})`, k: 'profit', w: 16, f: MONEY },
    { h: `Refunded later (${K})`, k: 'refunded', w: 13, f: MONEY }, { h: `Net after refunds (${K})`, k: 'net', w: 15, f: MONEY }, { h: 'Shift opened', k: 'shift', w: 18, f: DT },
  ];
  const wsSales = make('Sales', salesCols, sales);
  sales.forEach((s, i) => {
    const r = i + 2;
    wsSales.getCell(`Q${r}`).value = { formula: `M${r}-P${r}`, result: r2(s.total - s.cogs) };
    wsSales.getCell(`S${r}`).value = { formula: `M${r}-R${r}`, result: r2(s.total - s.refunded) };
    wsSales.getCell(`T${r}`).value = s.shift || s.shiftLabel;
  });

  // ---------- Sale items ----------
  const wsItems = make('Sale Items', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date & time', k: 'dt', w: 18, f: DT }, { h: 'Date', k: 'day', w: 13, f: D }, { h: 'Receipt no.', k: 'tx', w: 11 },
    { h: 'Staff (cashier)', k: 'staff', w: 18 }, { h: 'Product', k: 'product', w: 24 }, { h: 'SKU', k: 'sku', w: 11 }, { h: 'Variant', k: 'variant', w: 12 },
    { h: 'Sold as', k: 'pack', w: 10 }, { h: 'Qty', k: 'qty', w: 7 }, { h: `Unit price (${K})`, k: 'unitPrice', w: 12, f: MONEY },
    { h: `Line total (${K})`, k: 'lineTotal', w: 13, f: MONEY }, { h: `After discount (${K})`, k: 'afterDiscount', w: 14, f: MONEY },
    { h: `Unit cost (${K})`, k: 'unitCost', w: 12, f: MONEY }, { h: `Line cost (${K})`, k: 'lineCost', w: 12, f: MONEY },
    { h: `Line profit (${K})`, k: 'profit', w: 13, f: MONEY }, { h: 'Bottles / units out of stock', k: 'bottles', w: 13 },
  ], items);
  items.forEach((it, i) => { const r = i + 2; wsItems.getCell(`P${r}`).value = { formula: `M${r}-O${r}`, result: r2(it.afterDiscount - it.lineCost) }; });

  // ---------- Staff summary (formulas read the Sales sheet, so they update if the owner edits or filters) ----------
  const wsStaff = wb.addWorksheet('Staff Summary');
  const sCols = ['Workspace', 'Staff member', 'Number of sales', `Total sold (${K})`, `Cash (${K})`, `Mobile money (${K})`, `Card (${K})`, `Discounts given (${K})`,
    `Cost of goods (${K})`, `Profit before refunds (${K})`, `Refunds on their sales (${K})`, `Refunds they issued (${K})`, `Expenses they recorded (${K})`, `Average sale (${K})`];
  wsStaff.addRow(sCols); header(wsStaff);
  [14, 22, 12, 16, 14, 16, 14, 16, 16, 18, 18, 18, 18, 14].forEach((w, i) => { wsStaff.getColumn(i + 1).width = w; });
  const sN = Math.max(sales.length, 1) + 1, rN = Math.max(refunds.length, 1) + 1, eN = Math.max(expenses.length, 1) + 1;
  let sr = 2;
  for (const [, wsName] of WORKSPACES) {
    for (const st of staffList) {
      const mine = sales.filter(x => x.ws === wsName && x.staff === st);
      const myRef = refunds.filter(x => x.ws === wsName && x.issuedBy === st);
      const myExp = expenses.filter(x => x.ws === wsName && x.by === st && x.status === 'Active');
      if (!mine.length && !myRef.length && !myExp.length) continue;
      const crit = `Sales!$A$2:$A$${sN},$A${sr},Sales!$E$2:$E$${sN},$B${sr}`;
      const sum = (c: string) => `SUMIFS(Sales!$${c}$2:$${c}$${sN},${crit})`;
      const byMethod = (m: string) => `SUMIFS(Sales!$M$2:$M$${sN},${crit},Sales!$G$2:$G$${sN},"${m}")`;
      const tot = (f: (x: any) => number) => r2(mine.reduce((a, x) => a + f(x), 0));
      const row = wsStaff.addRow([wsName, st]);
      const set = (col: number, formula: string, result: number) => { row.getCell(col).value = { formula, result }; row.getCell(col).numFmt = MONEY; };
      row.getCell(3).value = { formula: `COUNTIFS(${crit})`, result: mine.length };
      set(4, sum('M'), tot(x => x.total));
      set(5, byMethod('Cash'), tot(x => (x.method === 'Cash' ? x.total : 0)));
      set(6, byMethod('Mobile money'), tot(x => (x.method === 'Mobile money' ? x.total : 0)));
      set(7, byMethod('Card'), tot(x => (x.method === 'Card' ? x.total : 0)));
      set(8, sum('K'), tot(x => x.discount));
      set(9, sum('P'), tot(x => x.cogs));
      set(10, `D${sr}-I${sr}`, tot(x => x.total - x.cogs));
      set(11, sum('R'), tot(x => x.refunded));
      set(12, `SUMIFS(Refunds!$G$2:$G$${rN},Refunds!$A$2:$A$${rN},$A${sr},Refunds!$D$2:$D$${rN},$B${sr})`, r2(myRef.reduce((a, x) => a + x.amount, 0)));
      set(13, `SUMIFS(Expenses!$D$2:$D$${eN},Expenses!$A$2:$A$${eN},$A${sr},Expenses!$H$2:$H$${eN},$B${sr},Expenses!$J$2:$J$${eN},"Active")`, r2(myExp.reduce((a, x) => a + x.amount, 0)));
      set(14, `IF(C${sr}=0,0,D${sr}/C${sr})`, mine.length ? r2(tot(x => x.total) / mine.length) : 0);
      sr++;
    }
  }
  if (sr > 2) {
    const t = wsStaff.addRow(['TOTAL', '']);
    t.font = { bold: true };
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].forEach(c => {
      const L = colL(c);
      let result = 0; for (let i = 2; i < sr; i++) { const v: any = wsStaff.getCell(`${L}${i}`).value; result += Number(v?.result) || 0; }
      t.getCell(c).value = { formula: `SUM(${L}2:${L}${sr - 1})`, result: r2(result) };
      if (c > 3) t.getCell(c).numFmt = MONEY;
    });
  }

  // ---------- Daily sales (by calendar date; one row per day per workspace) ----------
  const dayMap = new Map<string, any>();
  const dd = (ws: string, d: Date) => { const k = `${ws}|${d.getTime()}`; if (!dayMap.has(k)) dayMap.set(k, { ws, day: d, count: 0, total: 0, cash: 0, mobile: 0, card: 0, discount: 0, cogs: 0, refunds: 0, expenses: 0 }); return dayMap.get(k); };
  sales.forEach(s => { const x = dd(s.ws, s.day); x.count++; x.total += s.total; x.discount += s.discount; x.cogs += s.cogs; if (s.method === 'Cash') x.cash += s.total; else if (s.method === 'Mobile money') x.mobile += s.total; else if (s.method === 'Card') x.card += s.total; });
  refunds.forEach(r => { dd(r.ws, dayOf(r.dt.getTime())).refunds += r.amount; });
  expenses.filter(e => e.status === 'Active').forEach(e => { dd(e.ws, dayOf(e.dt.getTime())).expenses += e.amount; });
  const days = [...dayMap.values()].sort((a, b) => a.day - b.day || a.ws.localeCompare(b.ws)).map(x => ({ ...x, net: r2(x.total - x.refunds), profit: r2(x.total - x.refunds - x.cogs - x.expenses) }));
  const wsDays = make('Daily Sales', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date', k: 'day', w: 14, f: D }, { h: 'Number of sales', k: 'count', w: 10 }, { h: `Total sold (${K})`, k: 'total', w: 14, f: MONEY },
    { h: `Cash (${K})`, k: 'cash', w: 13, f: MONEY }, { h: `Mobile money (${K})`, k: 'mobile', w: 14, f: MONEY }, { h: `Card (${K})`, k: 'card', w: 12, f: MONEY },
    { h: `Discounts (${K})`, k: 'discount', w: 12, f: MONEY }, { h: `Refunds (${K})`, k: 'refunds', w: 12, f: MONEY }, { h: `Net sales (${K})`, k: 'net', w: 14, f: MONEY },
    { h: `Cost of goods (${K})`, k: 'cogs', w: 14, f: MONEY }, { h: `Expenses (${K})`, k: 'expenses', w: 13, f: MONEY }, { h: `Profit (${K})`, k: 'profit', w: 14, f: MONEY },
  ], days.map(x => ({ ...x, total: r2(x.total), cash: r2(x.cash), mobile: r2(x.mobile), card: r2(x.card), discount: r2(x.discount), refunds: r2(x.refunds), cogs: r2(x.cogs), expenses: r2(x.expenses) })));
  days.forEach((x, i) => {
    const r = i + 2;
    wsDays.getCell(`J${r}`).value = { formula: `D${r}-I${r}`, result: x.net };
    wsDays.getCell(`M${r}`).value = { formula: `D${r}-I${r}-K${r}-L${r}`, result: x.profit };
  });

  // ---------- Refunds ----------
  make('Refunds', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date & time', k: 'dt', w: 18, f: DT }, { h: 'Receipt no.', k: 'tx', w: 11 }, { h: 'Issued by', k: 'issuedBy', w: 18 },
    { h: 'Original sale by', k: 'soldBy', w: 18 }, { h: 'Refunded via', k: 'method', w: 14 }, { h: `Amount (${K})`, k: 'amount', w: 13, f: MONEY },
    { h: 'Reason', k: 'reason', w: 26 }, { h: 'Items', k: 'items', w: 60 },
  ], refunds);

  // ---------- Expenses ----------
  make('Expenses', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date & time', k: 'dt', w: 18, f: DT }, { h: 'Category', k: 'category', w: 18 }, { h: `Amount (${K})`, k: 'amount', w: 13, f: MONEY },
    { h: 'Paid from', k: 'paidFrom', w: 16 }, { h: 'Payee', k: 'payee', w: 20 }, { h: 'Note', k: 'note', w: 30 }, { h: 'Recorded by', k: 'by', w: 18 },
    { h: 'Entered after close', k: 'late', w: 10 }, { h: 'Status (ignore "Cancelled")', k: 'status', w: 14 }, { h: 'Cancelled by', k: 'cancelledBy', w: 16 },
  ], expenses);

  // ---------- Shifts / End of Day ----------
  const wsSh = make('End of Day Shifts', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Shift opened', k: 'opened', w: 18, f: DT }, { h: 'Shift closed', k: 'closed', w: 18, f: DT }, { h: 'Closed by', k: 'closedBy', w: 16 },
    { h: 'Number of sales', k: 'count', w: 9 }, { h: `Net sales (${K})`, k: 'total', w: 14, f: MONEY }, { h: `Cash (${K})`, k: 'cash', w: 13, f: MONEY },
    { h: `Mobile money (${K})`, k: 'mobile', w: 14, f: MONEY }, { h: `Card (${K})`, k: 'card', w: 12, f: MONEY }, { h: `Bar sales (${K})`, k: 'bar', w: 13, f: MONEY },
    { h: `Wholesale sales (${K})`, k: 'wholesale', w: 14, f: MONEY }, { h: `Refunds (${K})`, k: 'refunds', w: 12, f: MONEY }, { h: `Expenses (${K})`, k: 'expenses', w: 13, f: MONEY },
    { h: `Cash at start (${K})`, k: 'float', w: 13, f: MONEY }, { h: `Cash expected (${K})`, k: 'expected', w: 14, f: MONEY }, { h: `Cash counted (${K})`, k: 'counted', w: 14, f: MONEY },
    { h: `Extra / missing (${K})`, k: 'variance', w: 14, f: MONEY }, { h: 'Lost stock (units)', k: 'shrinkUnits', w: 10 }, { h: `Lost stock value (${K})`, k: 'shrinkValue', w: 14, f: MONEY },
  ], shifts);
  void wsSh;

  // ---------- Stock movements & current stock ----------
  make('Stock Deliveries', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'Date & time', k: 'dt', w: 18, f: DT }, { h: 'Type', k: 'type', w: 18 }, { h: 'Product', k: 'product', w: 26 },
    { h: 'Quantity (bottles)', k: 'qty', w: 12 }, { h: `Cost each (${K})`, k: 'cost', w: 13, f: MONEY }, { h: 'Recorded by', k: 'by', w: 18 },
  ], stock);
  const wsP = make('Products & Stock', [
    { h: 'Workspace', k: 'ws', w: 12 }, { h: 'SKU', k: 'sku', w: 11 }, { h: 'Product', k: 'name', w: 26 }, { h: 'Type', k: 'category', w: 12 },
    { h: `Selling price (${K})`, k: 'price', w: 13, f: MONEY }, { h: `Cost price (${K})`, k: 'cost', w: 12, f: MONEY }, { h: 'In stock now', k: 'stock', w: 10 },
    { h: 'Opening stock (this shift)', k: 'opening', w: 12 }, { h: 'Units sold (this shift)', k: 'sold', w: 12 }, { h: 'Low-stock alert at', k: 'min', w: 10 },
    { h: 'Bottles per box', k: 'boxQty', w: 10 }, { h: `Box price (${K})`, k: 'boxPrice', w: 12, f: MONEY }, { h: `Box cost (${K})`, k: 'boxCost', w: 12, f: MONEY },
    { h: 'Status', k: 'archived', w: 14 }, { h: `Stock value at cost (${K})`, k: 'valCost', w: 16, f: MONEY }, { h: `Stock value at selling price (${K})`, k: 'valSell', w: 18, f: MONEY },
    { h: `Profit per unit (${K})`, k: 'unitProfit', w: 13, f: MONEY },
  ], products);
  products.forEach((p, i) => {
    const r = i + 2;
    wsP.getCell(`O${r}`).value = { formula: `G${r}*F${r}`, result: r2(p.stock * p.cost) };
    wsP.getCell(`P${r}`).value = { formula: `G${r}*E${r}`, result: r2(p.stock * p.price) };
    wsP.getCell(`Q${r}`).value = { formula: `E${r}-F${r}`, result: r2(p.price - p.cost) };
  });

  // ---------- Summary (first sheet) ----------
  sm.getColumn(1).width = 44; sm.getColumn(2).width = 20; sm.getColumn(3).width = 20; sm.getColumn(4).width = 20;
  const title = sm.addRow([o.businessName || 'Sales export']); title.font = { bold: true, size: 16 };
  sm.addRow([`Exported ${new Date().toLocaleString()} by ${o.exportedBy}`]).font = { color: { argb: 'FF666666' } };
  sm.addRow([`All amounts in ${K}. Figures below are worked out with formulas from the other sheets, so they update if you edit or delete rows.`]).font = { color: { argb: 'FF666666' } };
  sm.addRow([]);
  const hr = sm.addRow(['', 'Bar', 'Wholesale', 'Both']); hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.eachCell((c: any) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; c.alignment = { horizontal: 'center' }; });
  const sN2 = Math.max(sales.length, 1) + 1;
  const line = (label: string, fn: (ws: string) => { f: string; v: number }, bold = false) => {
    const r = sm.rowCount + 1;
    const row = sm.addRow([label]);
    const a = fn('Bar'), b = fn('Wholesale');
    row.getCell(2).value = { formula: a.f, result: a.v };
    row.getCell(3).value = { formula: b.f, result: b.v };
    row.getCell(4).value = { formula: `B${r}+C${r}`, result: r2(a.v + b.v) };
    [2, 3, 4].forEach(c => { row.getCell(c).numFmt = MONEY; });
    if (bold) { row.font = { bold: true }; row.eachCell((c: any) => { c.border = { top: { style: 'thin' } }; }); }
    return r;
  };
  const inWs = (arr: any[], ws: string) => arr.filter(x => x.ws === ws);
  const sumArr = (arr: any[], k: string) => r2(arr.reduce((a, x) => a + (Number(x[k]) || 0), 0));
  const rowTotal = line('Number of sales', ws => ({ f: `COUNTIFS(Sales!$A$2:$A$${sN2},"${ws}")`, v: inWs(sales, ws).length }));
  sm.getCell(`B${rowTotal}`).numFmt = '0'; sm.getCell(`C${rowTotal}`).numFmt = '0'; sm.getCell(`D${rowTotal}`).numFmt = '0';
  const rSold = line('Total sold', ws => ({ f: `SUMIFS(Sales!$M$2:$M$${sN2},Sales!$A$2:$A$${sN2},"${ws}")`, v: sumArr(inWs(sales, ws), 'total') }));
  ['Cash', 'Mobile money', 'Card'].forEach(m => line(`   of which ${m}`, ws => ({ f: `SUMIFS(Sales!$M$2:$M$${sN2},Sales!$A$2:$A$${sN2},"${ws}",Sales!$G$2:$G$${sN2},"${m}")`, v: sumArr(inWs(sales, ws).filter(s => s.method === m), 'total') })));
  const rDisc = line('Discounts given (already taken off)', ws => ({ f: `SUMIFS(Sales!$K$2:$K$${sN2},Sales!$A$2:$A$${sN2},"${ws}")`, v: sumArr(inWs(sales, ws), 'discount') }));
  void rDisc;
  const rRef = line('Refunds', ws => ({ f: `SUMIFS(Refunds!$G$2:$G$${rN},Refunds!$A$2:$A$${rN},"${ws}")`, v: sumArr(inWs(refunds, ws), 'amount') }));
  const rNet = line('NET SALES (sold minus refunds)', () => ({ f: '0', v: 0 }), true);
  ['B', 'C'].forEach((c, i) => { const ws = i ? 'Wholesale' : 'Bar'; sm.getCell(`${c}${rNet}`).value = { formula: `${c}${rSold}-${c}${rRef}`, result: r2(sumArr(inWs(sales, ws), 'total') - sumArr(inWs(refunds, ws), 'amount')) }; });
  sm.getCell(`D${rNet}`).value = { formula: `B${rNet}+C${rNet}`, result: r2(sumArr(sales, 'total') - sumArr(refunds, 'amount')) };
  const rCogs = line('Cost of goods sold', ws => ({ f: `SUMIFS(Sales!$P$2:$P$${sN2},Sales!$A$2:$A$${sN2},"${ws}")`, v: sumArr(inWs(sales, ws), 'cogs') }));
  const rExp = line('Expenses (active only)', ws => ({ f: `SUMIFS(Expenses!$D$2:$D$${eN},Expenses!$A$2:$A$${eN},"${ws}",Expenses!$J$2:$J$${eN},"Active")`, v: sumArr(inWs(expenses, ws).filter(e => e.status === 'Active'), 'amount') }));
  const rProfit = line('PROFIT (net sales − cost of goods − expenses)', () => ({ f: '0', v: 0 }), true);
  ['B', 'C'].forEach((c, i) => {
    const ws = i ? 'Wholesale' : 'Bar';
    const v = sumArr(inWs(sales, ws), 'total') - sumArr(inWs(refunds, ws), 'amount') - sumArr(inWs(sales, ws), 'cogs') - sumArr(inWs(expenses, ws).filter(e => e.status === 'Active'), 'amount');
    sm.getCell(`${c}${rProfit}`).value = { formula: `${c}${rNet}-${c}${rCogs}-${c}${rExp}`, result: r2(v) };
  });
  sm.getCell(`D${rProfit}`).value = { formula: `B${rProfit}+C${rProfit}`, result: r2(sumArr(sales, 'total') - sumArr(refunds, 'amount') - sumArr(sales, 'cogs') - sumArr(expenses.filter(e => e.status === 'Active'), 'amount')) };
  line('Lost stock found at End of Day (at cost, not yet in profit)', ws => ({ f: `SUMIFS('End of Day Shifts'!$S$2:$S$${Math.max(shifts.length, 1) + 1},'End of Day Shifts'!$A$2:$A$${Math.max(shifts.length, 1) + 1},"${ws}")`, v: sumArr(inWs(shifts, ws), 'shrinkValue') }));
  sm.addRow([]);
  const first = sales.length ? sales[0].dt : null, last = sales.length ? sales[sales.length - 1].dt : null;
  if (first && last) sm.addRow([`Sales from ${first.toLocaleDateString()} to ${last.toLocaleDateString()}`]).font = { color: { argb: 'FF666666' } };
  sm.addRow([]);
  sm.addRow(['What is in each sheet']).font = { bold: true };
  [
    ['Sales', 'One row per sale: who sold it, when, how it was paid, total, cost and profit.'],
    ['Sale Items', 'One row per product on every sale (use a PivotTable here for best-sellers).'],
    ['Staff Summary', 'Totals for each staff member, split by Bar and Wholesale.'],
    ['Daily Sales', 'One row per day: sales, payment types, refunds, expenses, profit.'],
    ['Refunds', 'Every refund, who issued it and why.'],
    ['Expenses', 'Every expense. "Cancelled" ones are kept for the record, filter them out.'],
    ['End of Day Shifts', 'Each closed shift: totals, cash drawer check, lost stock.'],
    ['Stock Deliveries', 'Every delivery / restock entry.'],
    ['Products & Stock', 'Current stock, prices, costs and stock value.'],
  ].forEach(([a, b]) => { const r = sm.addRow([a, b]); r.getCell(1).font = { bold: true }; });

  // ---------- download ----------
  const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
  const safe = (o.businessName || 'sales').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'sales';
  const fileName = `${safe}-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  // Android app: a webview ignores normal downloads, so save the file in the app's cache and open the share sheet
  // (WhatsApp, email, Google Drive, "Open with Excel"...).
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
    await Filesystem.writeFile({ path: fileName, data: btoa(bin), directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: fileName, text: 'Sales export', files: [uri], dialogTitle: 'Save or send the Excel file' });
    return;
  }

  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

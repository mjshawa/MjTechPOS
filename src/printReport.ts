/**
 * Printing without popups: the report is rendered into a hidden iframe and the browser/Electron print dialog is opened
 * ("Save as PDF" is available in that dialog). Popup windows are blocked by many webviews, an iframe is not.
 */
import qrcode from 'qrcode-generator';
import { BusinessInfo, EMPTY_BUSINESS } from './brand';

const esc = (v: any) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    try { frame.contentWindow!.focus(); frame.contentWindow!.print(); } catch (e) { alert('Printing is not available on this device.'); }
    setTimeout(() => frame.remove(), 2000);
  };
  setTimeout(go, 250);
}

export interface EodReportData {
  title: string; workspace: string; businessLine?: string; product?: string; cashier: string; opened: string; printed: string;
  money: (n: any) => string;
  sales: { total: number; count: number; cash: number; mobile: number; card: number; refunds?: number };
  expenses: { rows: { category: string; payee: string; note: string; paidFrom: string; amount: number; late?: boolean }[]; total: number; till: number };
  net: number;
  cash: { float: number; sales: number; tillExpenses: number; expected: number; counted: number | null; variance: number | null };
  stock: { name: string; sku: string; start: number; sold: number; expected: number; actual: number }[];
  shrinkage: { value: number; units: number };
}

export function buildEodReportHtml(d: EodReportData) {
  const m = d.money;
  const row = (a: string, b: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${esc(a)}</td><td class="r">${esc(b)}</td></tr>`;
  const varianceText = d.cash.variance === null ? 'Not counted'
    : d.cash.variance === 0 ? 'Correct' : d.cash.variance < 0 ? `MISSING ${m(Math.abs(d.cash.variance))}` : `EXTRA ${m(d.cash.variance)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>
    *{box-sizing:border-box} body{font:12px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px}
    h1{font-size:20px;margin:0} h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 6px;border-bottom:1.5px solid #111;padding-bottom:3px}
    .meta{color:#555;margin:2px 0 0} table{width:100%;border-collapse:collapse} td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
    th{font-size:10px;text-transform:uppercase;color:#555} .r{text-align:right;font-variant-numeric:tabular-nums} .strong td{font-weight:700;border-top:1.5px solid #111}
    .sign{display:flex;gap:40px;margin-top:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;color:#555}
    @media print{body{margin:10mm}}
  </style></head><body>
  <h1>${esc(d.title)}</h1>
  ${d.businessLine ? `<p class="meta">${esc(d.businessLine)}</p>` : ''}
  <p class="meta">${esc(d.workspace)} · Shift opened ${esc(d.opened)} · Printed ${esc(d.printed)} · Prepared by ${esc(d.cashier)}</p>

  <h2>Sales</h2><table>
    ${row('Number of sales', String(d.sales.count))}${row('Cash', m(d.sales.cash))}${row('Mobile money', m(d.sales.mobile))}${row('Card', m(d.sales.card))}${d.sales.refunds ? row('Refunds already taken off', m(d.sales.refunds)) : ''}${row('Total sales', m(d.sales.total), true)}
  </table>

  <h2>Expenses</h2>
  ${d.expenses.rows.length ? `<table><thead><tr><th>Category</th><th>Details</th><th>Paid from</th><th class="r">Amount</th></tr></thead><tbody>${
    d.expenses.rows.map(r => `<tr><td>${esc(r.category)}${r.late ? ' (late)' : ''}</td><td>${esc([r.payee, r.note].filter(Boolean).join(' · '))}</td><td>${esc(r.paidFrom)}</td><td class="r">${esc(m(r.amount))}</td></tr>`).join('')
  }</tbody></table>` : '<p class="meta">No expenses recorded.</p>'}
  <table>${row('Total expenses', m(d.expenses.total), true)}</table>
  <table>${row('Left after expenses (before stock cost and lost stock)', m(d.net), true)}</table>

  <h2>Cash check</h2><table>
    ${row('Cash at start of shift', m(d.cash.float))}${row('+ Cash sales', m(d.cash.sales))}${row('− Cash paid out', m(d.cash.tillExpenses))}${row('Should be in drawer', m(d.cash.expected), true)}
    ${row('Cash counted', d.cash.counted === null ? '—' : m(d.cash.counted))}${row('Result (extra or missing)', varianceText, true)}
  </table>

  <h2>Stock count</h2>
  <table><thead><tr><th>Product</th><th class="r">Start</th><th class="r">Sold</th><th class="r">Should be left</th><th class="r">You counted</th><th class="r">Difference</th></tr></thead><tbody>${
    d.stock.map(s => `<tr><td>${esc(s.name)} <span style="color:#777">${esc(s.sku)}</span></td><td class="r">${s.start}</td><td class="r">${s.sold}</td><td class="r">${s.expected}</td><td class="r">${s.actual}</td><td class="r">${s.actual - s.expected || '0'}</td></tr>`).join('')
  }</tbody></table>
  <table>${row(`Lost stock (${d.shrinkage.units} units, at cost price)`, m(d.shrinkage.value), true)}</table>

  <div class="sign"><div>Prepared by</div><div>Checked by (owner or manager)</div></div>
  ${d.product ? `<p class="meta" style="margin-top:24px;text-align:center;font-size:10px">${esc(d.product)}</p>` : ''}
  </body></html>`;
}

/** QR code as an inline SVG (works offline, prints sharp on a thermal head). Returns '' if the text is empty or too long. */
function qrSvg(text: string) {
  if (!text) return '';
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ scalable: true, margin: 0 }).replace('<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>', '');
  } catch { return ''; }
}

/**
 * 80mm (or 58mm) thermal receipt, e.g. Xprinter XP-80 / XP-58 series.
 * r = the sale + { business: BusinessInfo, product, taxPct, money }.
 */
export function buildReceiptHtml(r: any) {
  const b: BusinessInfo = { ...EMPTY_BUSINESS, ...(r.business || {}) };
  const m = r.money as (n: any) => string;
  const is58 = b.paper === '58';
  const width = is58 ? 48 : 72;          // printable width in mm (80mm paper prints ~72mm, 58mm paper ~48mm)
  const feed = Math.max(0, Math.min(40, Number(b.feedMm) || 0));
  const walkIn = !r.customer || r.customer === 'Walk-In Guest';
  const itemCount = (r.items || []).reduce((a: number, i: any) => a + (Number(i.qty) || 0), 0);

  const rows = (r.items || []).map((i: any) =>
    `<tr><td colspan="2" class="nm">${esc(i.name)}${i.variant ? ' (' + esc(i.variant) + ')' : ''}</td></tr>` +
    `<tr><td class="s">&nbsp;&nbsp;${esc(i.qty)} x ${esc(m(i.price))}</td><td class="r">${esc(m(i.price * i.qty))}</td></tr>`).join('');
  const line = (a: string, v: string, bold = false) => `<tr${bold ? ' class="b"' : ''}><td>${esc(a)}</td><td class="r">${esc(v)}</td></tr>`;

  // What the QR code holds
  let qrText = '';
  if (b.qrMode === 'receipt') {
    qrText = [r.businessName, b.tpin ? 'TPIN ' + b.tpin : '', 'Receipt ' + r.txId, `${r.date} ${r.timestamp}`, 'Total ' + m(r.grandTotal)].filter(Boolean).join('\n');
  } else if (b.qrMode === 'payment' || b.qrMode === 'website' || b.qrMode === 'custom') {
    qrText = (b.qrText || '').trim();
  }
  const qr = b.qrMode !== 'none' ? qrSvg(qrText) : '';
  const qrMm = is58 ? 30 : 38;

  const contact = [b.phone, b.email].filter(Boolean).join(' · ');
  const sig = (label: string) => `<div class="sig"><div class="sl"></div><div class="s">${esc(label)}</div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(r.txId)}</title><style>
    @page{size:${is58 ? 58 : 80}mm auto;margin:0} *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff}
    body{font:${is58 ? 11 : 12}px/1.35 Consolas,'Lucida Console','Courier New',monospace;font-weight:600;color:#000;width:${width}mm;margin:0 auto;padding:2mm 0 ${feed}mm}
    h1{font-size:${is58 ? 14 : 16}px;text-align:center;margin:0 0 2px;text-transform:uppercase;line-height:1.2;word-break:break-word}
    .c{text-align:center} .s{font-size:${is58 ? 9 : 10}px;font-weight:600} p{margin:0}
    table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top} .r{text-align:right;white-space:nowrap;padding-left:6px}
    .nm{padding-top:3px;word-break:break-word}
    .b td{font-weight:800;font-size:${is58 ? 13 : 14}px;border-top:1px solid #000;padding-top:3px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}
    .ttl{text-align:center;font-weight:800;letter-spacing:.08em;margin:2px 0}
    .qr{display:flex;flex-direction:column;align-items:center;margin:4px 0}.qr svg{width:${qrMm}mm;height:${qrMm}mm;shape-rendering:crispEdges}
    .sig{margin-top:9mm}.sl{border-top:1px solid #000;margin-bottom:2px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <h1>${esc(r.businessName)}</h1>
  ${b.tagline ? `<p class="c s">${esc(b.tagline)}</p>` : ''}
  ${b.address ? `<p class="c s">${esc(b.address)}</p>` : ''}
  ${contact ? `<p class="c s">${esc(contact)}</p>` : ''}
  ${b.website ? `<p class="c s">${esc(b.website)}</p>` : ''}
  ${b.tpin ? `<p class="c s">TPIN: ${esc(b.tpin)}</p>` : ''}
  ${b.vatNo ? `<p class="c s">VAT Reg: ${esc(b.vatNo)}</p>` : ''}
  ${b.hours ? `<p class="c s">${esc(b.hours)}</p>` : ''}
  <hr>
  <p class="ttl">${esc(b.docTitle)}</p>
  <table>
    ${line('No.', String(r.txId))}
    ${line('Date', `${r.date} ${r.timestamp}`)}
    ${b.showCashier && r.cashier ? line('Served by', String(r.cashier)) : ''}
    ${!walkIn ? line('Customer', String(r.customer)) : ''}
  </table><hr>
  <table>${rows}</table><hr>
  <table>
    ${b.showItemCount ? line('Items', String(itemCount)) : ''}
    ${line('Subtotal', m(r.subtotal))}
    ${r.discountAmount ? line('Discount', '-' + m(r.discountAmount)) : ''}
    ${r.tax ? line('VAT (' + r.taxPct + '%)', m(r.tax)) : ''}
    ${line('TOTAL', m(r.grandTotal), true)}
    ${line('Paid by', String(r.paymentMethod || ''))}
    ${r.tendered != null ? line('Cash received', m(r.tendered)) + line('Change', m(r.change || 0), true) : ''}
  </table><hr>
  ${b.payNote ? `<p class="c s">${esc(b.payNote)}</p><hr>` : ''}
  ${b.signature !== 'none' ? `${sig('Customer signature')}${b.signature === 'both' ? sig('Authorised signature / stamp') : ''}<hr>` : ''}
  ${b.policy ? `<p class="c s">${esc(b.policy)}</p>` : ''}
  ${r.footer ? `<p class="c" style="margin-top:4px">${esc(r.footer)}</p>` : ''}
  ${qr ? `<div class="qr">${qr}${b.qrCaption ? `<p class="c s" style="margin-top:2px">${esc(b.qrCaption)}</p>` : ''}</div>` : ''}
  <p class="c s" style="margin-top:6px">${esc(r.product || '')}</p>
  </body></html>`;
}

/** A made-up sale so the owner can print a test receipt while setting the options up. */
export function sampleReceipt(b: BusinessInfo, money: (n: any) => string, product: string) {
  return {
    txId: 'TX-0001', date: new Date().toLocaleDateString(), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    items: [{ name: 'Mosi Lager 375ml', variant: null, price: 18, qty: 4 }, { name: 'Coca-Cola 500ml', variant: null, price: 10, qty: 2 }, { name: 'Chicken & chips', variant: null, price: 65, qty: 1 }],
    subtotal: 157, discountAmount: 0, tax: 0, taxPct: 0, grandTotal: 157, paymentMethod: 'Cash', tendered: 200, change: 43,
    customer: 'Walk-In Guest', cashier: 'Test', business: b, businessName: b.name || product, footer: b.footer, product, money,
  };
}


/** Plain-text receipt for WhatsApp (uses *bold* markup that WhatsApp understands). */
export function buildReceiptText(r: any) {
  const b: BusinessInfo = { ...EMPTY_BUSINESS, ...(r.business || {}) };
  const m = r.money as (n: any) => string;
  const L: string[] = [];
  L.push(`*${r.businessName || r.product || 'Receipt'}*`);
  const contact = [b.address, b.phone, b.tpin ? `TPIN ${b.tpin}` : ''].filter(Boolean).join(' · ');
  if (contact) L.push(contact);
  L.push(`Receipt #${r.txId}`);
  L.push(`${r.date} ${r.timestamp || ''}`.trim());
  if (r.customer && r.customer !== 'Walk-In Guest') L.push(`Customer: ${r.customer}`);
  L.push('--------------------------');
  for (const i of r.items || []) {
    L.push(`${i.qty}x ${i.name}${i.variant ? ` (${i.variant})` : ''} - ${m(i.price * i.qty)}`);
  }
  L.push('--------------------------');
  L.push(`Subtotal: ${m(r.subtotal)}`);
  if (r.discountAmount) L.push(`Discount: -${m(r.discountAmount)}`);
  if (r.tax) L.push(`Tax (${r.taxPct ?? 0}%): ${m(r.tax)}`);
  L.push(`*Total paid (${r.paymentMethod}): ${m(r.grandTotal)}*`);
  if (r.tendered != null) { L.push(`Cash received: ${m(r.tendered)}`); L.push(`Change: ${m(r.change)}`); }
  if (r.footer) { L.push(''); L.push(r.footer); }
  return L.join('\n');
}

/** Turn what a cashier types (097..., +260 97..., 26097...) into digits wa.me accepts. Returns '' if it looks wrong. */
export function normalizeWhatsAppNumber(input: string, countryCode = '260') {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  else if (!d.startsWith(countryCode) && d.length <= 9) d = countryCode + d;
  return d.length >= 11 && d.length <= 15 ? d : '';
}

export function whatsAppLink(phoneDigits: string, text: string) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

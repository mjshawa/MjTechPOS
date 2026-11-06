import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Wine, 
  Beer, 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  CreditCard, 
  Banknote,
  CalendarDays,
  Sun,
  Moon,
  LogOut,
  UserCog,
  BarChart3, 
  Package, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  QrCode, 
  RefreshCw, 
  Check, 
  X, 
  Printer, 
  TrendingUp, 
  Tag,
  ShieldCheck,
  Percent,
  Layers,
  Sparkles,
  Zap,
  Filter,
  ClipboardList,
  Lock,
  Download,
  AlertCircle,
  FileText,
  Wallet,
  RotateCcw,
  Store,
  MessageCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area 
} from 'recharts';
import { usePersistentState, usePersistentCollection, resetAllData } from './storage';
import { STORE_ID } from './sync/supabase';
import { useSupabaseSync } from './sync/useSupabaseSync';
import SyncModal from './sync/SyncModal';
import TeamModal from './auth/TeamModal';
import CalendarView from './CalendarView';
import StockHistoryModal from './StockHistoryModal';
import ExpensesView, { PAID_FROM } from './ExpensesView';
import { BRAND, EMPTY_BUSINESS, businessLine, withDefaults } from './brand';
import BusinessModal from './BusinessModal';
import SalesView, { refundFactor } from './SalesView';
import { ProductThumb, PhotoPicker } from './ProductPhoto';
import QtyInput from './QtyInput';
import ItemEditModal from './ItemEditModal';
import { downloadExcel } from './exportExcel';
import { printHtml, buildEodReportHtml, buildReceiptHtml, sampleReceipt, buildReceiptText, normalizeWhatsAppNumber, whatsAppLink } from './printReport';

// ============================ CONFIG ============================
const CURRENCY = 'K';          // Zambian Kwacha
const TAX_RATE = 0;            // 0 = no tax added. Set e.g. 0.16 ONLY if your prices exclude VAT.
const DAY_MS = 24 * 60 * 60 * 1000;

const money = (n: any) =>
  `${CURRENCY} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const newId = () =>
  typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Live screen-size check, so layout never depends on which Tailwind responsive classes exist in your build.
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// Responsive card grid: as many columns as fit, never squashing a card below `min` px.
const cardGrid = (min: number, gap = 16): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap,
});

// --- STARTER ITEMS: none. A new device starts with an empty catalogue; the owner adds items in Stock Tracking > Add New Item. ---
const INITIAL_PRODUCTS: any[] = [];

const SEED_ORDER = INITIAL_PRODUCTS.map(p => p.id);

const EMPTY_ITEM = {
  name: '', sku: '', category: 'Bar', subcategory: 'Beer', price: '', cost: '', stock: '', minThreshold: '10', unit: 'pcs', image: '📦', photo: '', bulkQty: '', bulkPrice: '',
  boxQty: '', boxPrice: '', boxCost: '', halfPrice: '', halfCost: '',
};
const ITEM_TYPES = ['Beer', 'Spirits', 'Wine', 'Soft Drinks', 'Other'];

// ---- Box / single helpers (wholesale). Stock is always counted in bottles. ----
const hasBox = (p: any) => p?.category !== 'Bar' && (Number(p?.boxQty) || 0) >= 2 && (Number(p?.boxPrice) || 0) > 0; // the Bar sells everything per bottle
/** Wholesale lagers are sold by the crate or half crate (no single bottles). Spirits etc. are sold by the box or as one bottle. */
const isCrateItem = (p: any) => hasBox(p) && p.subcategory === 'Beer';
type PackDef = { id: 'single' | 'box' | 'half'; label: string; short: string; unit: string; size: number; price: number; cost: number };
/** The ways this product can be sold at the till. */
const packsOf = (p: any): PackDef[] => {
  const single: PackDef = { id: 'single', label: 'Single bottle', short: 'Bottle', unit: 'bottle', size: 1, price: p.price, cost: p.cost };
  if (!hasBox(p)) return [single];
  const q = Number(p.boxQty), bp = Number(p.boxPrice), bc = Number(p.boxCost) || (p.cost || 0) * q;
  if (isCrateItem(p)) {
    const half = Math.floor(q / 2);
    return [
      { id: 'box', label: `Crate of ${q}`, short: 'Crate', unit: 'crate', size: q, price: bp, cost: bc },
      { id: 'half', label: `Half crate (${half})`, short: 'Half crate', unit: 'half crate', size: half,
        price: Number(p.halfPrice) > 0 ? Number(p.halfPrice) : Math.round(bp * half / q * 100) / 100, // owner can set it; blank = exactly half
        cost: Number(p.halfCost) > 0 ? Number(p.halfCost) : bc * half / q },
    ];
  }
  return [single, { id: 'box', label: `Box of ${q}`, short: 'Box', unit: 'box', size: q, price: bp, cost: bc }];
};
const nounOf = (p: any) => (isCrateItem(p) ? 'crate' : 'box');
const countUnit = (n: number, unit: string) => `${n} ${n === 1 ? unit : unit === 'box' ? 'boxes' : unit + 's'}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "10 crates" or "10 boxes + 10 bottles" */
const boxesText = (p: any) => {
  const boxes = Math.floor(p.stock / p.boxQty), rest = p.stock - boxes * p.boxQty;
  return `${countUnit(boxes, nounOf(p))}${rest ? ` + ${rest}` : ''}`;
};
/** "240 bottles (10 boxes)" */
const stockText = (p: any) => (hasBox(p) ? `${p.stock} ${p.unit} (${boxesText(p)})` : `${p.stock} ${p.unit}`);
/** Bottles one cart line takes out of stock. */
const bottlesOf = (i: any) => (Number(i.qty) || 0) * (Number(i.size) || 1);
/** Largest quantity this cart line can have, given the stock and what the OTHER lines of the same product already use. */
const capQty = (list: any[], item: any, stock: number | undefined) => {
  if (stock === undefined) return Infinity;
  const others = list.filter(i => i.id === item.id && i.cartId !== item.cartId).reduce((a, i) => a + bottlesOf(i), 0);
  return Math.max(0, Math.floor((stock - others) / (Number(item.size) || 1)));
};

const INITIAL_TABS: any[] = [];

export default function App({ user, auth, workspace, theme, onToggleTheme }: any) {
  const isOwner = user.role === 'owner';
  // Bar and Retail are completely separate workspaces: own products, stock, tabs, sales, shifts, deliveries.
  const WS = workspace === 'retail' ? 'Retail' : 'Bar';
  const WS_LABEL = workspace === 'retail' ? 'Wholesale' : 'Bar'; // internal id stays 'retail' so saved data and Supabase store ids keep working
  const storeId = `${STORE_ID}-${workspace}`;
  const isWide = useMediaQuery('(min-width: 1024px)'); // sidebar expanded (labels + 256px)
  // Navigation State
  const [activeTab, setActiveTab] = useState('pos'); // 'pos', 'tabs', 'inventory', 'eod', 'analytics'
  const [mode, setMode] = useState(WS); // fixed to this workspace

  // POS State
  const [products, setProducts] = usePersistentCollection(`${workspace}:products`, INITIAL_PRODUCTS.filter((p: any) => p.category === WS));

  // ---------- WORKSPACE ----------
  const [deviceId] = usePersistentState('deviceId', newId()); // per physical device (shared by both workspaces)
  const scope: string = WS;
  const deviceName: string = WS;
  const inScope = (_p: any) => true;       // everything in this workspace belongs to it
  // Deleted items are only HIDDEN (archived): old sales, refunds and reports still point at them, and the cloud sync would bring a hard-deleted row back.
  // The starter items keep the order they are listed in (Small next to Big); items the owner adds follow, oldest first.
  const scopedProducts = useMemo(() => {
    const rank = (p: any) => { const i = SEED_ORDER.indexOf(p.id); return i < 0 ? 1e6 : i; };
    return products.filter((p: any) => !p.archived).sort((a: any, b: any) => rank(a) - rank(b));
  }, [products]);
  const deletedProducts = useMemo(() => products.filter((p: any) => p.archived), [products]);
  useEffect(() => { setMode(WS); }, [WS]);
  const [cart, setCart] = usePersistentState(`${workspace}:cart`, []);
  const [openTabs, setOpenTabs] = usePersistentCollection(`${workspace}:openTabs`, INITIAL_TABS, { newestFirst: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubcat, setSelectedSubcat] = useState('All');
  const [discount, setDiscount] = useState(0); // Percent
  const [customerName, setCustomerName] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  // Modals & Interactivity
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState(''); // cash handed over by the customer (optional); the change is worked out from it
  const [isPreAuthOpen, setIsPreAuthOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState(null);
  const [waOpen, setWaOpen] = useState(false);   // WhatsApp number box on the receipt
  const [waPhone, setWaPhone] = useState('');
  const [waError, setWaError] = useState('');

  // EOD State
  const [physicalCounts, setPhysicalCounts] = usePersistentState(`${workspace}:physicalCounts`, {});
  const [isEodLocked, setIsEodLocked] = usePersistentState(`${workspace}:eodLocked`, false);
  const [eodSummaryModal, setEodSummaryModal] = useState(false);
  // Cash drawer: opening float is entered at shift start, counted cash at the end. Both are saved on the device.
  const [cashFloat, setCashFloat] = usePersistentState(`${workspace}:cashFloat`, '');
  const [cashCounted, setCashCounted] = usePersistentState(`${workspace}:cashCounted`, '');
  const [profitPeriod, setProfitPeriod] = useState('7d');

  // New Item State for Inventory
  const [newItem, setNewItem] = useState({ ...EMPTY_ITEM });
  const [editItem, setEditItem] = useState<any>(null);

  // Analytics aggregate stats
  const [salesHistory, setSalesHistory] = usePersistentCollection(`${workspace}:salesHistory`, [], { newestFirst: true });
  const [closedShifts, setClosedShifts] = usePersistentCollection(`${workspace}:closedShifts`, [], { newestFirst: true });
  // A "shift" runs from open to close, NOT midnight to midnight, so a 3 AM close stays one business day.
  const [shiftStart, setShiftStart] = usePersistentState(`${workspace}:shiftStart`, Date.now());
  const [outbox, setOutbox] = usePersistentCollection(`${workspace}:outbox`, []);
  // Refunds: append-only records pointing at a sale. A refund reduces the sales of the shift it is ISSUED in.
  const [refunds, setRefunds] = usePersistentCollection(`${workspace}:refunds`, [], { newestFirst: true });
  const shiftKey = `${deviceId}:${shiftStart}`;
  const shiftRefundTotals = useMemo(() => {
    const t: any = { total: 0, cash: 0, mobile: 0, card: 0, bar: 0, retail: 0, count: 0 };
    refunds.filter((r: any) => r.shiftKey === shiftKey).forEach((r: any) => {
      t.total += r.amount; t[r.method] = (t[r.method] || 0) + r.amount; t.bar += r.barAmount || 0; t.retail += r.retailAmount || 0; t.count += 1;
    });
    return t;
  }, [refunds, shiftKey]);
  const refundedQty = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    refunds.forEach((r: any) => {
      const inner = m.get(r.saleId) || new Map<string, number>();
      (r.lines || []).forEach((l: any) => inner.set(l.key, (inner.get(l.key) || 0) + l.qty));
      m.set(r.saleId, inner);
    });
    return m;
  }, [refunds]);
  const refundsBySale = useMemo(() => {
    const m = new Map<string, number>();
    refunds.forEach((r: any) => m.set(r.saleId, (m.get(r.saleId) || 0) + r.amount));
    return m;
  }, [refunds]);

  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Rolling 24-hour total (always the last 24h from right now)
  const rolling24h = useMemo(
    () => salesHistory.filter((s: any) => s.ts > nowTs - DAY_MS).reduce((a: number, s: any) => a + s.total, 0),
    [salesHistory, nowTs]
  );
  // Current-shift sales (since last EOD close)
  const shiftSales = useMemo(
    () => salesHistory.filter((s: any) => s.ts >= shiftStart && (!s.deviceId || s.deviceId === deviceId)),
    [salesHistory, shiftStart, deviceId]
  );
  const totalSalesVolume = useMemo(() => shiftSales.reduce((a: number, s: any) => a + s.total, 0) - shiftRefundTotals.total, [shiftSales, shiftRefundTotals]); // net of refunds

  // Money taken per product this shift (list price x qty, minus refunded lines). A box sale is worth its box price, not bottles x bottle price.
  const shiftRevenueByProduct = useMemo(() => {
    const m = new Map<string, number>();
    shiftSales.forEach((x: any) => (x.items || []).forEach((i: any) => m.set(i.productId, (m.get(i.productId) || 0) + i.price * i.qty)));
    refunds.filter((r: any) => r.shiftKey === shiftKey).forEach((r: any) => (r.lines || []).forEach((l: any) => m.set(l.productId, (m.get(l.productId) || 0) - l.price * l.qty)));
    return m;
  }, [shiftSales, refunds, shiftKey]);

  // Hourly bar-vs-retail chart built from real sales in the last 24h
  const hourlyRevenue = useMemo(() => {
    const buckets = new Map<string, any>();
    [...salesHistory]
      .filter((s: any) => s.ts > nowTs - DAY_MS)
      .sort((a: any, b: any) => a.ts - b.ts)
      .forEach((s: any) => {
        const key = String(new Date(s.ts).getHours()).padStart(2, '0') + ':00';
        const b = buckets.get(key) || { time: key, barSales: 0, retailSales: 0 };
        b.barSales += s.barSales || 0;
        b.retailSales += s.retailSales || 0;
        buckets.set(key, b);
      });
    return Array.from(buckets.values());
  }, [salesHistory, nowTs]);

  const avgMargin = scopedProducts.length
    ? (scopedProducts.reduce((a: number, p: any) => a + (p.price > 0 ? (p.price - p.cost) / p.price : 0), 0) / scopedProducts.length) * 100
    : 0;

  // ---------- OFFLINE-FIRST SYNC (SQLite on device -> Supabase) ----------
  const [stockLog, setStockLog] = usePersistentCollection(`${workspace}:stockLog`, [], { newestFirst: true });
  // Expenses: append-only ledger (a mistake is voided, never edited), synced like sales and deliveries.
  const [expenses, setExpenses] = usePersistentCollection(`${workspace}:expenses`, [], { newestFirst: true });
  // The CLIENT's business details, typed by the owner (saved on this device and synced). The product name stays MjTech Point Of Sale.
  const [businessRaw, setBusiness] = usePersistentState('business', EMPTY_BUSINESS);
  const sync = useSupabaseSync({
    outbox, setOutbox, products, setProducts, tabs: openTabs, setTabs: setOpenTabs, business: businessRaw, setBusiness,
    collections: { sales: setSalesHistory, closed_shifts: setClosedShifts, stock_log: setStockLog, expenses: setExpenses, refunds: setRefunds },
    storeId, workspace,
  });
  const [showSync, setShowSync] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  // ---------- EXPENSES ----------
  // An expense belongs to the shift it was recorded in (key = device + shift opening time). A late expense entered
  // after close keeps the key of the shift that just closed, because shiftStart only changes when a new shift starts.
  const voidedIds = useMemo(() => new Set<string>(expenses.filter((e: any) => e.kind === 'void').map((e: any) => e.voidOf)), [expenses]);
  const liveExpenses = useMemo(() => expenses.filter((e: any) => e.kind !== 'void' && !voidedIds.has(e.id)), [expenses, voidedIds]);
  const expensesByShift = useMemo(() => {
    const m = new Map<string, { total: number; till: number; mobile: number; owner: number }>();
    liveExpenses.forEach((e: any) => {
      const t = m.get(e.shiftKey) || { total: 0, till: 0, mobile: 0, owner: 0 };
      t.total += e.amount;
      (t as any)[e.paidFrom] = ((t as any)[e.paidFrom] || 0) + e.amount;
      m.set(e.shiftKey, t);
    });
    return m;
  }, [liveExpenses]);
  const shiftExpenseList = useMemo(() => liveExpenses.filter((e: any) => e.shiftKey === shiftKey), [liveExpenses, shiftKey]);
  const shiftExpenseTotals = expensesByShift.get(shiftKey) || { total: 0, till: 0, mobile: 0, owner: 0 };
  const shiftCashSales = useMemo(() => shiftSales.filter((x: any) => x.method === 'cash').reduce((a: number, x: any) => a + x.total, 0) - shiftRefundTotals.cash, [shiftSales, shiftRefundTotals]);
  const cashFloatNum = parseFloat(cashFloat) || 0;
  const cashExpected = cashFloatNum + shiftCashSales - shiftExpenseTotals.till;
  const cashCountedNum = cashCounted === '' || isNaN(parseFloat(cashCounted)) ? null : parseFloat(cashCounted);
  const cashVariance = cashCountedNum === null ? null : cashCountedNum - cashExpected;
  const expensesFor = (sh: any) => expensesByShift.get(`${sh.deviceId || deviceId}:${sh.openedAt}`) || { total: 0, till: 0, mobile: 0, owner: 0 };

  const profit = useMemo(() => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const from = profitPeriod === 'today' ? startToday.getTime() : profitPeriod === '7d' ? startToday.getTime() - 6 * DAY_MS
      : profitPeriod === '30d' ? startToday.getTime() - 29 * DAY_MS : 0;
    const pad = (n: number) => String(n).padStart(2, '0');
    const dk = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const costOf = new Map<string, number>(products.map((p: any) => [p.id, p.cost || 0]));
    const days = new Map<string, any>();
    const day = (k: string) => { if (!days.has(k)) days.set(k, { day: k, revenue: 0, cogs: 0, expenses: 0 }); return days.get(k); };
    salesHistory.filter((x: any) => x.ts >= from).forEach((x: any) => {
      const d = day(dk(x.ts));
      d.revenue += x.total || 0;
      // new sales store cost per item; older sales fall back to the product's current cost
      (x.items || []).forEach((i: any) => { d.cogs += (i.qty || 0) * (i.cost ?? costOf.get(i.productId) ?? 0); });
    });
    refunds.filter((r: any) => r.ts >= from).forEach((r: any) => {
      const d = day(dk(r.ts));
      d.revenue -= r.amount || 0;
      // cost comes back only for items returned to stock; spilled/damaged items stay a loss
      (r.lines || []).filter((l: any) => l.restock).forEach((l: any) => { d.cogs -= l.qty * (l.cost ?? costOf.get(l.productId) ?? 0); });
    });
    const catMap = new Map<string, number>();
    liveExpenses.filter((x: any) => x.ts >= from).forEach((x: any) => {
      day(dk(x.ts)).expenses += x.amount;
      catMap.set(x.category, (catMap.get(x.category) || 0) + x.amount);
    });
    const shrink = closedShifts.filter((c: any) => c.openedAt >= from).reduce((a: number, c: any) => a + (c.shrinkageValue || 0), 0);
    const list = [...days.values()].map(d => ({ ...d, net: d.revenue - d.cogs - d.expenses })).sort((a, b) => b.day.localeCompare(a.day));
    const revenue = list.reduce((a, d) => a + d.revenue, 0);
    const cogs = list.reduce((a, d) => a + d.cogs, 0);
    const expensesTotal = list.reduce((a, d) => a + d.expenses, 0);
    return {
      revenue, cogs, expenses: expensesTotal, shrink, net: revenue - cogs - expensesTotal - shrink,
      days: list.slice(0, 14), byCat: [...catMap.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [profitPeriod, salesHistory, refunds, liveExpenses, closedShifts, products]);

  const queueExpense = (entry: any) => {
    setExpenses((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'expenses', payload: { ...entry, storeId }, failed: false }]);
  };
  const handleAddExpense = (f: { amount: number; category: string; paidFrom: string; payee: string; note: string }) => {
    queueExpense({ id: newId(), kind: 'expense', ts: Date.now(), shiftKey, ...f, by: user.name, afterClose: isEodLocked });
  };
  const handleVoidExpense = (e: any) => {
    if (!isOwner) return;
    if (!window.confirm(`Cancel this expense?\n\n${e.category}: ${money(e.amount)}\n\nIt will stay on record but will not count in the totals.`)) return;
    queueExpense({ id: newId(), kind: 'void', voidOf: e.id, ts: Date.now(), shiftKey: e.shiftKey, category: e.category, amount: e.amount, by: user.name });
  };

  // ---------- REFUNDS ----------
  const handleRefund = ({ sale, lines, method, reason }: { sale: any; lines: any[]; method: string; reason: string }) => {
    if (!isOwner || isEodLocked) return;
    const factor = refundFactor(sale);
    const catOf = new Map<string, string>(products.map((p: any) => [p.id, p.category]));
    let amount = 0, bar = 0, retail = 0;
    lines.forEach(l => {
      const v = l.qty * l.price * factor;
      amount += v;
      if (catOf.get(l.productId) === 'Retail') retail += v; else bar += v;
    });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const entry = {
      id: newId(), kind: 'refund', ts: Date.now(), shiftKey, saleId: sale.id, txId: sale.txId,
      lines, amount: r2(amount), barAmount: r2(bar), retailAmount: r2(retail), method, reason, by: user.name,
    };
    setRefunds((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'refunds', payload: { ...entry, storeId }, failed: false }]);
    // Items going back on the shelf return to stock (like a delivery, so the EOD count is not thrown off).
    const back = lines.filter(l => l.restock);
    if (back.length) {
      setProducts((prev: any[]) => prev.map(p => {
        const q = back.filter(l => l.productId === p.id).reduce((a, l) => a + l.qty * (l.size || 1), 0); // a returned box = all its bottles
        return q ? { ...p, stock: p.stock + q, unitsSold: Math.max(0, (p.unitsSold || 0) - q) } : p;
      }));
      setPhysicalCounts((prev: any) => {
        const next = { ...prev };
        back.forEach(l => { next[l.productId] = (next[l.productId] ?? 0) + l.qty * (l.size || 1); });
        return next;
      });
    }
  };

  // ---------- RECEIVE STOCK (restock after a delivery) ----------
  const [restockItem, setRestockItem] = useState<any>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  // The CLIENT's business details, typed by the owner (saved on this device). The product name stays MjTech Point Of Sale.
  const business = useMemo(() => withDefaults(businessRaw), [businessRaw]); // older saved settings lack the newer receipt options

  /** Open WhatsApp with the receipt typed out, addressed to the number the cashier entered. */
  const sendReceiptWhatsApp = () => {
    const r: any = currentReceipt;
    if (!r) return;
    const digits = normalizeWhatsAppNumber(waPhone);
    if (!digits) { setWaError('Enter a valid phone number, e.g. 0977123456'); return; }
    const text = buildReceiptText({ ...r, business, businessName: bizName || BRAND.product, footer: business.footer, product: BRAND.product, taxPct: Math.round(TAX_RATE * 100), money });
    window.open(whatsAppLink(digits, text), '_blank', 'noopener');
  };
  const [showBusiness, setShowBusiness] = useState(false);
  const bizName = (business?.name || '').trim();
  useEffect(() => { document.title = bizName ? `${bizName} · ${BRAND.product}` : BRAND.product; }, [bizName]);
  // Owner: one Excel file with every sale (per staff member), item, refund, expense, shift and stock record, Bar and Wholesale together.
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = async () => {
    if (!isOwner || exporting) return;
    setExporting(true);
    try {
      await downloadExcel({ currency: CURRENCY, businessName: bizName || BRAND.product, exportedBy: user.name, staffNames: (auth?.staff || []).map((x: any) => x.name) });
    } catch (e: any) {
      console.error('[export]', e);
      if (!/cancel/i.test(String(e?.message || e))) alert('Could not create the Excel file: ' + (e?.message || e)); // closing the share sheet is not an error
    }
    setExporting(false);
  };
  const [restockForm, setRestockForm] = useState({ qty: '', cost: '', by: 'bottle' }); // by: count what arrived in bottles or in boxes
  const [showStockHistory, setShowStockHistory] = useState(false);

  const handleRestock = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(restockForm.qty, 10);
    if (!restockItem || !count || count <= 0) return;
    const inBoxes = restockForm.by === 'box' && hasBox(restockItem);
    const qty = count * (inBoxes ? Number(restockItem.boxQty) : 1); // stock is always counted in bottles
    const typed = restockForm.cost !== '' ? parseFloat(restockForm.cost) : null;
    // The cost field is "each" for the unit chosen above: per box when counting boxes, per bottle otherwise.
    const newCost = typed === null ? restockItem.cost : inBoxes ? typed / restockItem.boxQty : typed;
    const newBoxCost = typed !== null && inBoxes ? typed : restockItem.boxCost;
    // Add to BOTH current and opening stock, so a delivery is never mistaken for a surplus/shrinkage at EOD.
    setProducts((prev: any[]) => prev.map(p => p.id === restockItem.id
      ? { ...p, stock: p.stock + qty, startingStock: p.startingStock + qty, cost: newCost, ...(newBoxCost !== undefined ? { boxCost: newBoxCost } : {}) } : p));
    setPhysicalCounts((prev: any) => ({ ...prev, [restockItem.id]: (prev[restockItem.id] ?? restockItem.stock) + qty }));
    const entry = { id: newId(), type: 'restock', ts: Date.now(), productId: restockItem.id, name: restockItem.name, qty, cost: newCost, by: user.name };
    setStockLog((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'stock_log', payload: { ...entry, storeId }, failed: false }]); // syncs to Supabase
    setRestockItem(null);
    setRestockForm({ qty: '', cost: '', by: 'bottle' });
  };

  // Staff can only use Terminal + Tabs
  useEffect(() => { if (!isOwner && !['pos', 'tabs', 'sales', 'inventory', 'expenses', 'calendar'].includes(activeTab)) setActiveTab('pos'); }, [isOwner, activeTab]);

  // Calendar feed: every closed shift + the shift still open
  const openShiftSummary = useMemo(() => {
    if (isEodLocked) return null;
    const by: Record<string, number> = { cash: 0, mobile: 0, card: 0 };
    shiftSales.forEach((x: any) => { by[x.method] = (by[x.method] || 0) + x.total; });
    ['cash', 'mobile', 'card'].forEach(k => { by[k] -= shiftRefundTotals[k] || 0; });
    return {
      id: 'open', deviceName, deviceId, openedAt: shiftStart, closedAt: null, total: totalSalesVolume, count: shiftSales.length,
      cash: by.cash, mobile: by.mobile, card: by.card,
      barSales: shiftSales.reduce((a: number, x: any) => a + (x.barSales || 0), 0) - shiftRefundTotals.bar,
      retailSales: shiftSales.reduce((a: number, x: any) => a + (x.retailSales || 0), 0) - shiftRefundTotals.retail,
      refundTotal: shiftRefundTotals.total,
      shrinkageValue: 0, shrinkageUnits: 0,
    };
  }, [isEodLocked, shiftSales, shiftStart, totalSalesVolume, shiftRefundTotals]);
  const calendarShifts = useMemo(
    () => (openShiftSummary ? [openShiftSummary, ...closedShifts] : closedShifts).map((sh: any) => {
      const x = expensesFor(sh);
      return { ...sh, expenses: x.total, tillExpenses: x.till };
    }),
    [openShiftSummary, closedShifts, expensesByShift]
  );

  // ---------- ONE-TIME CATALOG UPDATE (v2) ----------
  // Devices that already have saved items get the new layout without losing stock, prices or sales history:
  //  - Bar: "Black Label" becomes "Black Label Small" and a "Black Label Big" card is added.
  //  - Wholesale: each "X (single)" item + its separate "X Box" item are merged into ONE item that is sold per bottle or per box.
  //    The old box item is hidden (deleted items list) and its stock is added to the bottle count (boxes x bottles per box).
  const CATALOG_V = 2;
  const [catalogV, setCatalogV] = usePersistentState(`${workspace}:catalogV`, 0);
  useEffect(() => {
    if (catalogV >= CATALOG_V) return;
    let next: any[] = [...products];
    const counts: Record<string, number> = {};
    const find = (id: string) => next.find(p => p.id === id);
    const insertAfter = (afterId: string, item: any) => {
      const i = next.findIndex(p => p.id === afterId);
      next = i >= 0 ? [...next.slice(0, i + 1), item, ...next.slice(i + 1)] : [...next, item];
      counts[item.id] = item.stock;
    };
    const seed = (id: string) => INITIAL_PRODUCTS.find(p => p.id === id);
    if (WS === 'Bar') {
      const b1 = find('b1');
      if (b1 && b1.name === 'Black Label') next = next.map(p => (p.id === 'b1' ? { ...p, name: 'Black Label Small' } : p));
      if (!find('b7') && seed('b7') && !next.some(p => p.sku === 'BEER-007')) insertAfter('b1', { ...seed('b7') });
    } else {
      const pairs = [['r1', 'r7'], ['r2', 'r8'], ['r3', 'r9'], ['r4', 'r10'], ['r5', 'r11'], ['r6', 'r12']];
      for (const [sid, bid] of pairs) {
        const single = find(sid), box = find(bid);
        if (!single || !/ \(single\)$/.test(single.name || '')) continue; // already new, or renamed by the owner: leave it alone
        let name = single.name.replace(/ \(single\)$/, '');
        if (name === 'Black Label') name = 'Black Label Small';
        let merged: any = { ...single, name };
        const qtyInBox = box && !box.archived ? parseInt((String(box.name).match(/\((\d+)\s*bottles?\)/) || [])[1] || '0', 10) : 0;
        if (box && !box.archived && qtyInBox >= 2) {
          merged = {
            ...merged, boxQty: qtyInBox, boxPrice: box.price, boxCost: box.cost,
            stock: single.stock + box.stock * qtyInBox,
            startingStock: single.startingStock + box.startingStock * qtyInBox,
            unitsSold: (single.unitsSold || 0) + (box.unitsSold || 0) * qtyInBox,
            minThreshold: Math.max(single.minThreshold || 0, (box.minThreshold || 0) * qtyInBox),
          };
          counts[sid] = (physicalCounts[sid] ?? single.stock) + (physicalCounts[bid] ?? box.stock) * qtyInBox;
          counts[bid] = 0;
          next = next.map(p => (p.id === bid ? { ...p, archived: true, archivedAt: Date.now(), archivedBy: `System (merged into ${name})`, stock: 0, startingStock: 0 } : p));
        }
        next = next.map(p => (p.id === sid ? merged : p));
      }
      if (!find('r13') && seed('r13') && !next.some(p => p.sku === 'WHOL-013')) insertAfter('r1', { ...seed('r13') });
    }
    if (next.some((p, i) => p !== products[i]) || next.length !== products.length) {
      setProducts(next);
      setPhysicalCounts((prev: any) => ({ ...prev, ...counts }));
    }
    setCatalogV(CATALOG_V);
  }, [catalogV]);

  // Sync initial physical counts with system stock
  // Make sure every product has a physical-count entry (keeps saved counts if they exist)
  useEffect(() => {
    setPhysicalCounts((prev: any) => {
      const counts = { ...prev };
      products.forEach((p: any) => { if (counts[p.id] === undefined) counts[p.id] = p.stock; });
      return counts;
    });
  }, [products.length]);

  // Handle SKU Scanner Simulation
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const found = scopedProducts.find(p => p.sku.toLowerCase() === barcodeInput.toLowerCase().trim());
    if (found) {
      addToCart(found);
      setBarcodeInput('');
    } else {
      alert(`The item code "${barcodeInput}" was not found.`);
    }
  };

  // Bulk (wholesale) price: once qty reaches the item's bulkQty, every unit uses bulkPrice. Variant surcharges still apply.
  // Boxes have their own price, so the bulk price only applies to single bottles.
  const repriceItem = (it: any) => {
    if (it._base === undefined) return it;
    const bulk = (it.pack || 'single') === 'single' && it.bulkQty > 0 && it.bulkPrice > 0 && it.qty >= it.bulkQty;
    return { ...it, price: (bulk ? it.bulkPrice : it._base) + (it.variantExtra || 0), bulkApplied: bulk };
  };
  const stockOf = (id: string) => products.find((p: any) => p.id === id)?.stock;

  // Put `qty` of a product (one bottle/item, or one box) into a cart list. Returns the SAME list when nothing fits in stock.
  const addLine = (list: any[], product: any, variant: string | null, pack: 'single' | 'box' | 'half', qty: number) => {
    const defs = packsOf(product);
    const def = defs.find(d => d.id === pack) || defs.find(d => d.id === 'single') || defs[0];
    const isBox = def.id !== 'single';
    const size = def.size;
    const label = [variant, isBox ? def.label : null].filter(Boolean).join(' · ') || null;
    const itemKey = `${product.id}${variant ? '-' + variant : ''}${isBox ? '-' + def.id : ''}`;
    const existing = list.find(item => item.cartId === itemKey);
    const probe = { id: product.id, cartId: itemKey, size };
    const cap = capQty(list, probe, product.stock);
    if (existing) {
      const q = Math.min(existing.qty + qty, cap);
      return q === existing.qty ? list : list.map(item => (item.cartId === itemKey ? repriceItem({ ...item, qty: q }) : item));
    }
    if (cap < 1) return list;
    const extra = variant ? parseFloat((variant.match(/\+\s*[K$]?\s*([\d.]+)/) || [])[1] || '0') : 0;
    const base = def.price;
    const { photo: _photo, ...lean } = product; // the photo stays out of the saved cart
    return [...list, repriceItem({
      ...lean,
      cartId: itemKey,
      selectedVariant: label,
      pack: def.id,
      packUnit: def.unit,
      size,
      cost: def.cost, // cost of ONE sold unit (a bottle, a box, a crate or a half crate)
      price: base + extra,
      _base: base, variantExtra: extra, // so a bulk price can be applied/removed as the quantity changes
      qty: Math.min(qty, cap),
    })];
  };

  // Add Item to Cart (pack = sell one bottle/item, or a whole box)
  const addToCart = (product, variant = null, pack: 'single' | 'box' | 'half' = 'single') => {
    const def = packsOf(product).find(d => d.id === pack) || packsOf(product)[0];
    const size = def.size;
    const room = capQty(cart, { id: product.id, cartId: '', size }, product.stock);
    if (product.stock <= 0) {
      alert(`Warning: ${product.name} is finished (out of stock)!`);
      return;
    }
    if (room < 1) {
      alert(size > 1
        ? `Not enough ${product.name} left for another ${def.label.toLowerCase()}. Only ${product.stock} ${product.unit} in stock.`
        : `No more ${product.name} left to add (${product.stock} ${product.unit} in stock).`);
      return;
    }
    setCart(prevCart => addLine(prevCart, product, variant, pack, 1));
  };

  // Change an order line between "single bottle" and "box". The count starts again at 1 because the unit changed.
  const switchPack = (item: any, pack: 'single' | 'box' | 'half') => {
    if ((item.pack || 'single') === pack) return;
    const product = products.find((p: any) => p.id === item.id);
    if (!product || !hasBox(product)) return;
    setCart(prev => {
      const without = prev.filter(i => i.cartId !== item.cartId);
      const next = addLine(without, product, null, pack, 1);
      if (next === without) { alert(`Not enough ${product.name} in stock for that.`); return prev; }
      return next;
    });
  };

  // Cart Management
  const updateQty = (cartId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const cap = capQty(prev, item, stockOf(item.id)); // never more than is in stock (all lines of this product together)
        const newQty = Math.min(item.qty + delta, cap);
        return newQty > 0 ? repriceItem({ ...item, qty: newQty }) : delta < 0 ? null : item;
      }
      return item;
    }).filter(Boolean));
  };

  // Type an exact quantity (capped at what is in stock)
  const setCartQty = (cartId: string, n: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId !== cartId) return item;
      const cap = capQty(prev, item, stockOf(item.id));
      return repriceItem({ ...item, qty: Math.max(1, Math.min(n, cap)) });
    }));
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  useEffect(() => { if (isCheckoutOpen && cart.length === 0) setIsCheckoutOpen(false); }, [isCheckoutOpen, cart.length]);

  // Largest count a cart line may have (undefined = no limit known, e.g. an old tab item whose product was removed).
  const maxFor = (item: any) => { const c = capQty(cart, item, stockOf(item.id)); return Number.isFinite(c) ? c : undefined; };
  const productOf = (id: string) => products.find((p: any) => p.id === id);

  // "Single bottle | Box" switch for products that are also sold by the box. Used in the order list AND in the payment window.
  const packToggle = (item: any) => {
    const prod = productOf(item.id);
    if (!prod || !hasBox(prod)) return null;
    const defs = packsOf(prod);
    const on = item.pack || 'single';
    return (
      <div className="inline-flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-0.5 my-1">
        {defs.map(d => (
          <button
            key={d.id} type="button" onClick={() => switchPack(item, d.id)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${on === d.id ? (d.id === 'single' ? 'bg-amber-500 text-slate-950' : 'bg-indigo-500 text-white') : 'text-slate-400 hover:text-slate-200'}`}
          >{d.label}</button>
        ))}
      </div>
    );
  };

  // Financial Calculations
  const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart]);
  const discountAmount = useMemo(() => (subtotal * discount) / 100, [subtotal, discount]);
  const taxableSubtotal = subtotal - discountAmount;
  const tax = useMemo(() => taxableSubtotal * TAX_RATE, [taxableSubtotal]);
  const grandTotal = useMemo(() => taxableSubtotal + tax, [taxableSubtotal, tax]);

  // Complete Order & Deduct Inventory + Track Units Sold
  const handleCompleteOrder = () => {
    if (cart.length === 0) return;

    // Cash only: if the till person typed what the customer handed over, it must cover the total. Blank = exact money.
    const tendered = paymentMethod === 'cash' && amountReceived.trim() !== '' ? Number(amountReceived) : null;
    if (tendered !== null && (!isFinite(tendered) || tendered + 0.005 < grandTotal)) return;

    // Deduct stock and increment units sold
    setProducts(prevProducts => {
      return prevProducts.map(prod => {
        const inCart = cart.filter(c => c.id === prod.id);
        if (inCart.length > 0) {
          const totalQtyUsed = inCart.reduce((sum, item) => sum + bottlesOf(item), 0); // a box counts as all its bottles
          const updatedStock = Math.max(0, prod.stock - totalQtyUsed);
          
          // Also update physical count default
          setPhysicalCounts(prev => ({ ...prev, [prod.id]: updatedStock }));

          return { 
            ...prod, 
            stock: updatedStock,
            unitsSold: prod.unitsSold + totalQtyUsed 
          };
        }
        return prod;
      });
    });

    // Build the sale record (it is the receipt, the history entry AND the outbox payload)
    const saleTime = new Date();
    const saleId = newId();
    const factor = 1 - discount / 100;
    const catTotal = (cat: string) =>
      cart.filter((i: any) => i.category === cat).reduce((a: number, i: any) => a + i.price * i.qty, 0) * factor;
    const sale = {
      id: saleId,
      txId: `TX-${saleId.slice(0, 4).toUpperCase()}`,
      ts: saleTime.getTime(),
      timestamp: saleTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      time: saleTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: saleTime.toLocaleDateString(),
      items: cart.map((i: any) => ({ productId: i.id, sku: i.sku, name: i.name, variant: i.selectedVariant || null, pack: i.pack || 'single', packUnit: i.packUnit || null, size: i.size || 1, price: i.price, cost: i.cost || 0, qty: i.qty })),
      itemsCount: cart.reduce((a: number, b: any) => a + b.qty, 0), // lines sold (a box counts as 1)
      bottlesCount: cart.reduce((a: number, b: any) => a + bottlesOf(b), 0),
      subtotal,
      discountAmount,
      tax,
      grandTotal,
      total: grandTotal,
      barSales: catTotal('Bar'),
      retailSales: catTotal('Retail'),
      customer: customerName || 'Walk-In Guest',
      cashier: user.name,
      cashierId: user.id,
      deviceId,
      deviceName,
      paymentMethod,
      method: paymentMethod,
      tendered,
      change: tendered !== null ? Math.round((tendered - grandTotal) * 100) / 100 : null,
      type: mode,
    };

    setCurrentReceipt(sale);
    setSalesHistory((prev: any[]) => [sale, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: saleId, table: 'sales', payload: { ...sale, storeId }, failed: false }]);

    // Reset Cart
    setCart([]);
    setDiscount(0);
    setCustomerName('');
    setAmountReceived('');
    setIsCheckoutOpen(false);
  };

  // Physical stock count adjustment in EOD
  const handlePhysicalCountChange = (productId, val) => {
    const parsed = parseInt(val, 10);
    setPhysicalCounts(prev => ({
      ...prev,
      [productId]: isNaN(parsed) ? 0 : parsed
    }));
  };

  // Inventory: delete = hide (owner only). It can be restored; history is kept.
  const handleDeleteItem = (p: any) => {
    if (!isOwner) return;
    const tabsUsing = openTabs.filter((t: any) => (t.items || []).some((i: any) => i.name === p.name)).length;
    const lines = [
      `Delete "${p.name}"?`, '',
      'It will disappear from the Terminal, the stock list and End of Day. Old sales, refunds and reports will still show it.',
      p.stock > 0 ? `Its remaining ${p.stock} ${p.unit || 'units'} (worth ${money(p.stock * (p.cost || 0))} at cost price) will no longer be counted.` : '',
      tabsUsing ? `Warning: ${tabsUsing} open tab(s) still have this item. They can still be paid.` : '',
      '', 'You can bring it back later from "Deleted items".',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
    if (!window.confirm(lines.join('\n'))) return;
    setCart((prev: any[]) => prev.filter(i => i.id !== p.id));
    setProducts((prev: any[]) => prev.map(x => (x.id === p.id ? { ...x, archived: true, archivedAt: Date.now(), archivedBy: user.name } : x)));
  };
  const handleRestoreItem = (p: any) => {
    if (!isOwner) return;
    setProducts((prev: any[]) => prev.map(x => {
      if (x.id !== p.id) return x;
      const { archived, archivedAt, archivedBy, ...rest } = x;
      return rest;
    }));
  };

  // Inventory: edit an existing product (owner). Stock counts are changed through Restock / End of Day, never here.
  const handleSaveEdit = (changes: any) => {
    if (!editItem || !isOwner) return;
    setProducts((prev: any[]) => prev.map(p => (p.id === editItem.id ? { ...p, ...changes } : p)));
    setEditItem(null);
  };

  // Inventory Add Item
  const handleSaveNewItem = (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    const sku = String(newItem.sku || '').trim().toLowerCase();
    if (sku) {
      const clash = products.find((p: any) => String(p.sku).toLowerCase() === sku);
      if (clash) {
        alert(clash.archived
          ? `The item code "${newItem.sku}" belongs to a deleted item (${clash.name}). Restore that item from "Deleted items" instead of adding it again.`
          : `The item code "${newItem.sku}" is already used by ${clash.name}.`);
        return;
      }
    }

    const bq = parseInt(String(newItem.boxQty || 0), 10), bp = parseFloat(String(newItem.boxPrice || 0));
    if ((bq || bp) && (!(bq >= 2) || !(bp > 0))) {
      alert('For a box you need BOTH the number of bottles in the box (2 or more) and the box price. Fill both, or leave both empty.');
      return;
    }
    const initialStockNum = parseInt(String(newItem.stock || 0), 10);
    const created = {
      ...newItem,
      boxQty: bq >= 2 ? bq : 0,
      boxPrice: bq >= 2 ? bp : 0,
      boxCost: bq >= 2 ? parseFloat(String(newItem.boxCost || 0)) || 0 : 0,
      halfPrice: bq >= 2 && newItem.subcategory === 'Beer' ? parseFloat(String(newItem.halfPrice || 0)) || 0 : 0,
      halfCost: bq >= 2 && newItem.subcategory === 'Beer' ? parseFloat(String(newItem.halfCost || 0)) || 0 : 0,
      category: WS,
      id: 'p-' + Date.now(),
      price: parseFloat(newItem.price),
      cost: parseFloat(String(newItem.cost || 0)),
      startingStock: initialStockNum,
      unitsSold: 0,
      stock: initialStockNum,
      minThreshold: parseInt(String(newItem.minThreshold || 5), 10),
      bulkQty: parseInt(String(newItem.bulkQty || 0), 10) >= 2 && parseFloat(String(newItem.bulkPrice || 0)) > 0 && parseFloat(String(newItem.bulkPrice)) < parseFloat(newItem.price) ? parseInt(String(newItem.bulkQty), 10) : 0,
      bulkPrice: parseInt(String(newItem.bulkQty || 0), 10) >= 2 && parseFloat(String(newItem.bulkPrice || 0)) > 0 && parseFloat(String(newItem.bulkPrice)) < parseFloat(newItem.price) ? parseFloat(String(newItem.bulkPrice)) : 0,
      sku: newItem.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`
    };

    setProducts([...products, created]);
    setPhysicalCounts(prev => ({ ...prev, [created.id]: initialStockNum }));
    setNewItem({ ...EMPTY_ITEM });
    setIsItemModalOpen(false);
  };

  // EOD Calculations
  const eodMetrics = useMemo(() => {
    let totalStartingValue = 0;
    let totalExpectedValue = 0;
    let totalActualValue = 0;
    let totalShrinkageUnits = 0;
    let totalShrinkageValue = 0;

    scopedProducts.forEach(p => {
      const startingVal = p.startingStock * p.price;
      const expectedStock = p.stock;
      const actualStock = physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock;
      const diff = actualStock - expectedStock;

      totalStartingValue += startingVal;
      totalExpectedValue += expectedStock * p.price;
      totalActualValue += actualStock * p.price;

      if (diff < 0) {
        totalShrinkageUnits += Math.abs(diff);
        totalShrinkageValue += Math.abs(diff) * p.cost;
      }
    });

    return {
      totalStartingValue,
      totalExpectedValue,
      totalActualValue,
      totalShrinkageUnits,
      totalShrinkageValue
    };
  }, [products, physicalCounts, scopedProducts]);

  // End of Day: close the shift, record the totals, lock the register
  const handleCloseShift = () => {
    const warn = openTabs.length > 0 ? `\n\n${openTabs.length} tab(s) are still open and will stay open for the next shift.` : '';
    const noCount = cashCountedNum === null ? '\n\nYou have not typed the cash you counted, so we cannot check if cash is missing or extra.' : '';
    const exp = `\n\nExpenses saved this shift: ${money(shiftExpenseTotals.total)} (${shiftExpenseList.length} entr${shiftExpenseList.length === 1 ? 'y' : 'ies'}).\nDid you add ALL of tonight's expenses?${noCount}`;
    if (!window.confirm(`Close the shift now? Sales will be added up and the till will be locked.${exp}${warn}`)) return;
    const byMethod: Record<string, number> = { cash: 0, mobile: 0, card: 0 };
    shiftSales.forEach((s: any) => { byMethod[s.method] = (byMethod[s.method] || 0) + s.total; });
    ['cash', 'mobile', 'card'].forEach(k => { byMethod[k] -= shiftRefundTotals[k] || 0; });
    const shift = {
      id: newId(),
      openedAt: shiftStart,
      closedAt: Date.now(),
      total: totalSalesVolume,
      count: shiftSales.length,
      cash: byMethod.cash, mobile: byMethod.mobile, card: byMethod.card,
      barSales: shiftSales.reduce((a: number, s: any) => a + (s.barSales || 0), 0) - shiftRefundTotals.bar,
      retailSales: shiftSales.reduce((a: number, s: any) => a + (s.retailSales || 0), 0) - shiftRefundTotals.retail,
      refundTotal: shiftRefundTotals.total, refundCount: shiftRefundTotals.count,
      shrinkageUnits: eodMetrics.totalShrinkageUnits,
      shrinkageValue: eodMetrics.totalShrinkageValue,
      cashFloat: cashFloatNum, cashExpected, cashCounted: cashCountedNum, cashVariance, // null when no count was entered
      closedBy: user.name,
      deviceId,
      deviceName,
      scope,
    };
    setClosedShifts((prev: any[]) => [shift, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: shift.id, table: 'closed_shifts', payload: { ...shift, storeId }, failed: false }]);
    setIsEodLocked(true);
  };

  // Start a new shift: counted stock becomes the new opening stock
  const handleReopenShift = () => {
    setProducts((prev: any[]) => prev.map(p => {
      if (!inScope(p)) return p; // never touch the other device's stock
      const actual = physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock;
      return { ...p, stock: actual, startingStock: actual, unitsSold: 0 };
    }));
    setShiftStart(Date.now());
    setCashFloat('');
    setCashCounted('');
    setIsEodLocked(false);
  };

  const handlePrintReport = () => {
    const by: Record<string, number> = { cash: 0, mobile: 0, card: 0 };
    shiftSales.forEach((x: any) => { by[x.method] = (by[x.method] || 0) + x.total; });
    ['cash', 'mobile', 'card'].forEach(k => { by[k] -= shiftRefundTotals[k] || 0; });
    printHtml(buildEodReportHtml({
      title: 'End of Day Report', workspace: `${bizName || BRAND.product} · ${WS_LABEL}`, businessLine: businessLine(business), product: BRAND.product, cashier: user.name,
      opened: fmtDateTime(shiftStart), printed: fmtDateTime(Date.now()), money,
      sales: { total: totalSalesVolume, count: shiftSales.length, cash: by.cash, mobile: by.mobile, card: by.card, refunds: shiftRefundTotals.total },
      expenses: {
        rows: [...shiftExpenseList].reverse().map((x: any) => ({ category: x.category, payee: x.payee, note: x.note, amount: x.amount, late: x.afterClose, paidFrom: PAID_FROM.find(f => f.id === x.paidFrom)?.label || x.paidFrom })),
        total: shiftExpenseTotals.total, till: shiftExpenseTotals.till,
      },
      net: totalSalesVolume - shiftExpenseTotals.total,
      cash: { float: cashFloatNum, sales: shiftCashSales, tillExpenses: shiftExpenseTotals.till, expected: cashExpected, counted: cashCountedNum, variance: cashVariance },
      stock: scopedProducts.map((p: any) => ({ name: p.name, sku: p.sku, start: p.startingStock, sold: p.unitsSold, expected: p.stock, actual: physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock })),
      shrinkage: { value: eodMetrics.totalShrinkageValue, units: eodMetrics.totalShrinkageUnits },
    }));
  };

  const handleResetAllData = async () => {
    if (!window.confirm('Delete ALL sales, tabs, stock, shifts and accounts saved on this device?')) return;
    await resetAllData();
  };

  // Subcategories filter options
  const subcategories = useMemo(() => {
    const subs = scopedProducts.filter(p => p.category === mode).map(p => p.subcategory);
    return ['All', ...Array.from(new Set(subs))];
  }, [scopedProducts, mode]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return scopedProducts.filter(p => {
      const matchesCategory = p.category === mode;
      const matchesSubcat = selectedSubcat === 'All' || p.subcategory === selectedSubcat;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSubcat && matchesSearch;
    });
  }, [scopedProducts, mode, selectedSubcat, searchQuery]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      
      {/* LEFT NAVIGATION BAR */}
      <aside style={{ width: isWide ? 256 : 80 }} className="shrink-0 overflow-hidden bg-slate-900 border-r border-slate-800 flex flex-col gap-3 p-4 z-20">
        {/* Logo + menu scroll when the screen is short, so the user block and Sign out below are ALWAYS visible */}
        <div className="space-y-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* Logo / Title */}
          <div className="flex items-center gap-3 px-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              <Zap className="h-6 w-6" />
            </div>
            <div className={isWide ? 'block' : 'hidden'}>
              {bizName ? (
                <>
                  <h1 className="font-extrabold text-base leading-tight text-slate-100 max-w-[160px] break-words">{bizName}</h1>
                  <p className="text-[11px] text-slate-500 font-medium">{BRAND.product}</p>
                </>
              ) : (
                <>
                  <h1 className="font-extrabold text-lg tracking-wide text-slate-100">{BRAND.lead}<span className="text-amber-400">{BRAND.tail}</span></h1>
                  <p className="text-xs text-slate-400 font-medium">{BRAND.tagline}</p>
                </>
              )}
            </div>
          </div>

          {/* Nav Buttons (owner sees everything, staff sees Terminal + Tabs) */}
          <nav className="space-y-1.5">
            {[
              { id: 'pos', label: 'Terminal', icon: ShoppingBag, owner: false },
              { id: 'tabs', label: 'Open Bar Tabs', icon: Users, owner: false },
              { id: 'sales', label: 'Sales & Refunds', icon: RotateCcw, owner: false },
              { id: 'inventory', label: 'Stock Tracking', icon: Package, owner: false },
              { id: 'expenses', label: 'Expenses', icon: Wallet, owner: false },
              { id: 'eod', label: 'End of Day (EOD)', icon: ClipboardList, owner: true },
              { id: 'calendar', label: 'Calendar', icon: CalendarDays, owner: false },
              { id: 'analytics', label: 'Analytics & COGS', icon: BarChart3, owner: true },
            ].filter(i => !i.owner || isOwner).map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === item.id
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-md'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <item.icon className="h-5 w-5 shrink-0" />
                  {isWide && <span className="whitespace-nowrap">{item.label}</span>}
                </div>
                {item.id === 'tabs' && openTabs.length > 0 && isWide && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-slate-950">{openTabs.length}</span>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowSync(true)}
              title="Cloud Sync"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all"
            >
              <RefreshCw className={`h-5 w-5 shrink-0 ${sync.busy ? 'animate-spin' : ''}`} />
              {isWide && <span className="whitespace-nowrap">Cloud Sync</span>}
            </button>
            {isOwner && (
              <button
                onClick={() => setShowBusiness(true)}
                title="Business details"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all"
              >
                <Store className="h-5 w-5 shrink-0" />
                {isWide && <span className="whitespace-nowrap">Business details</span>}
              </button>
            )}
            {isOwner && (
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                title="Download everything as an Excel file"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all disabled:opacity-60"
              >
                <Download className={`h-5 w-5 shrink-0 ${exporting ? 'animate-pulse' : ''}`} />
                {isWide && <span className="whitespace-nowrap">{exporting ? 'Preparing Excel…' : 'Download Excel'}</span>}
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => setShowTeam(true)}
                title="Team"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all"
              >
                <UserCog className="h-5 w-5 shrink-0" />
                {isWide && <span className="whitespace-nowrap">Team</span>}
              </button>
            )}
          </nav>
        </div>

        {/* Signed-in user, theme, sign out */}
        <div className="border-t border-slate-800 pt-3 px-1 space-y-2.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-amber-400 border border-slate-700">
              {(user.name || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className={(isWide ? 'block' : 'hidden') + ' text-xs min-w-0'}>
              <p className="font-bold text-slate-200 truncate">{user.name}</p>
              <p className="text-slate-500 capitalize">{user.role} · {isEodLocked ? 'Shift closed' : 'Shift open'}</p>
              <p className="text-slate-500">{WS_LABEL} workspace</p>
              {isOwner && <p className="text-amber-400 font-mono" title="All registers combined">24h: {money(rolling24h)}</p>}
              <button onClick={() => setShowSync(true)} className={`block text-left hover:text-slate-200 ${sync.failed > 0 ? 'text-rose-400' : sync.pending > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {sync.label}
              </button>
            </div>
          </div>
          <div className={'flex gap-2 ' + (isWide ? 'flex-row' : 'flex-col')}>
            <button onClick={onToggleTheme} title="Light / dark mode" className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-bold">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isWide && (theme === 'dark' ? 'Light' : 'Dark')}
            </button>
            <button onClick={auth.logout} title="Sign out" className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-bold">
              <LogOut className="h-4 w-4" />
              {isWide && 'Sign out'}
            </button>
          </div>
          {isOwner && isWide && (
            <button onClick={handleResetAllData} className="text-[10px] text-slate-600 hover:text-rose-400 underline">Clear saved data</button>
          )}
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        
        {/* VIEW 1: POS TERMINAL */}
        {activeTab === 'pos' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Catalog Section */}
            <div className="flex-1 min-w-0 flex flex-col p-4 lg:p-6 overflow-hidden border-r border-slate-800">
              
              {/* Header Controls: Mode Switcher & Search */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
                
                {/* Mode Selector (replaced by a label when this device is dedicated to Bar or Retail) */}
                {scope === 'Both' ? (
                <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 w-full md:w-auto">
                  <button
                    onClick={() => { setMode('Bar'); setSelectedSubcat('All'); }}
                    className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      mode === 'Bar'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Beer className="h-4 w-4" />
                    Bar Operations
                  </button>
                  <button
                    onClick={() => { setMode('Retail'); setSelectedSubcat('All'); }}
                    className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      mode === 'Retail'
                        ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Wholesale
                  </button>
                </div>
                ) : (
                <div className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold w-full md:w-auto ${WS === 'Bar' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'}`}>
                    {WS === 'Bar' ? <Beer className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                    {WS === 'Bar' ? 'Bar Operations' : 'Wholesale'}
                  </div>
                )}

                {/* Search & Barcode Simulator */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* SKU Scanner Direct Input */}
                  <form onSubmit={handleBarcodeSubmit} className={isWide ? 'relative block' : 'relative hidden'}>
                    <input
                      type="text"
                      placeholder="Scan or type item code..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      className="w-48 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button type="submit" className="hidden">Add</button>
                  </form>
                </div>
              </div>

              {/* Subcategory Filter Pills */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
                {subcategories.map(subcat => (
                  <button
                    key={subcat}
                    onClick={() => setSelectedSubcat(subcat)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedSubcat === subcat
                        ? 'bg-slate-800 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    {subcat}
                  </button>
                ))}
              </div>

              {/* Product Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16, alignContent: 'start' }} className="flex-1 overflow-y-auto pr-1">
                {scopedProducts.length === 0 && (
                  <div style={{ gridColumn: '1 / -1' }} className="text-center text-slate-500 text-sm py-16">
                    No items yet.{isOwner ? ' Go to Stock Tracking and tap Add New Item to start.' : ' Ask the owner to add items in Stock Tracking.'}
                  </div>
                )}
                {filteredProducts.map(product => {
                  const isLowStock = product.stock <= product.minThreshold && product.stock > 0;
                  const isOutOfStock = product.stock <= 0;

                  return (
                    <div
                      key={product.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all group"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <ProductThumb product={product} size={84} />
                          
                          {/* Stock Status Pill */}
                          <span className={`min-w-0 text-center leading-tight text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOutOfStock 
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                              : isLowStock 
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {isOutOfStock ? 'Out of Stock' : `${stockText(product)} left`}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-100 text-sm group-hover:text-amber-400 transition-colors line-clamp-2">{product.name}</h3>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{product.sku}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        {hasBox(product) ? (
                          <div className="mb-2 space-y-0.5">
                            {packsOf(product).map(d => (
                              <div key={d.id} className="flex items-baseline justify-between gap-2">
                                <span className={`text-[10px] font-bold uppercase ${d.id === 'single' ? 'text-slate-500' : 'text-indigo-300'}`}>{d.label}</span>
                                <span className="font-extrabold text-slate-100 text-sm whitespace-nowrap">{money(d.price)}</span>
                              </div>
                            ))}
                            <p className="text-[10px] text-slate-400 font-mono text-right">Sold: {product.unitsSold} {product.unit}</p>
                          </div>
                        ) : (
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-extrabold text-slate-100 text-base whitespace-nowrap">{money(product.price)}</span>
                          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">Sold: {product.unitsSold}</span>
                        </div>
                        )}
                        {product.bulkQty > 0 && product.bulkPrice > 0 && (
                          <p className="text-[10px] font-bold text-amber-400 -mt-1 mb-2">Bulk: {product.bulkQty}+ at {money(product.bulkPrice)} each</p>
                        )}

                        {/* Add Button / Variants Dropdown */}
                        {product.variants ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {product.variants.map(varOpt => (
                              <button
                                key={varOpt}
                                disabled={isOutOfStock}
                                onClick={() => addToCart(product, varOpt)}
                                className="w-full py-1.5 px-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 font-bold text-[10px] rounded-lg transition-colors truncate disabled:opacity-50"
                              >
                                + {varOpt.split(' ')[0]}
                              </button>
                            ))}
                          </div>
                        ) : hasBox(product) ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            {packsOf(product).map(d => (
                              <button
                                key={d.id}
                                disabled={product.stock < d.size}
                                onClick={() => addToCart(product, null, d.id)}
                                className={d.id === 'single'
                                  ? 'py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-40'
                                  : 'py-2 bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500 hover:text-white text-indigo-200 font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-40'}
                              >
                                <Plus className="h-3 w-3" /> {d.short}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            disabled={isOutOfStock}
                            onClick={() => addToCart(product)}
                            className="w-full py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> {isOutOfStock ? 'Out of Stock' : 'Add to Order'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ORDER TICKET DRAWER */}
            <div className="shrink-0 w-80 lg:w-96 bg-slate-900 flex flex-col border-l border-slate-800">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-100 text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-amber-400" /> Current Order
                  </h2>
                  <p className="text-xs text-slate-500">Items to pay for now or keep on a tab</p>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Customer Name Input */}
              <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800">
                <input
                  type="text"
                  placeholder="Customer or Table Name (optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Itemized Cart List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-600">
                    <ShoppingBag className="h-12 w-12 stroke-[1.5] mb-2 opacity-50" />
                    <p className="text-sm font-medium">No items yet</p>
                    <p className="text-xs text-slate-600 mt-1">Tap an item on the left, or scan its code</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.cartId} className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex-1 pr-2">
                        <h4 className="text-xs font-bold text-slate-200">{item.name}</h4>
                        {item.selectedVariant && (item.pack || 'single') === 'single' && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">
                            {item.selectedVariant}
                          </span>
                        )}
                        {packToggle(item)}
                        <p className="text-xs font-mono text-slate-400 mt-0.5">
                          {money(item.price)}{(item.pack || 'single') !== 'single' ? ` / ${item.packUnit || 'box'}` : ''}{item.qty > 1 && <span className="text-slate-500"> × {item.qty} = <span className="text-slate-200 font-bold">{money(item.price * item.qty)}</span></span>}
                        </p>
                        {(item.pack || 'single') !== 'single' && (
                          <p className="text-[10px] font-bold text-indigo-300">{countUnit(item.qty, item.packUnit || 'box')} = {bottlesOf(item)} bottles</p>
                        )}
                        {item.bulkApplied ? (
                          <span className="text-[10px] font-bold text-emerald-400">Bulk price applied</span>
                        ) : item.bulkQty > 0 && item.bulkPrice > 0 ? (
                          <span className="text-[10px] text-amber-400">Buy {item.bulkQty}+ for {money(item.bulkPrice + (item.variantExtra || 0))} each</span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg">
                          <button
                            onClick={() => updateQty(item.cartId, -1)}
                            className="p-1 hover:text-amber-400 text-slate-400"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <QtyInput value={item.qty} max={maxFor(item)} onCommit={n => setCartQty(item.cartId, n)} />
                          <button
                            onClick={() => updateQty(item.cartId, 1)}
                            className="p-1 hover:text-amber-400 text-slate-400"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.cartId)}
                          className="text-slate-600 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Summary & Checkout Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-mono">{money(subtotal)}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-400">
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Discount</span>
                    <div className="flex items-center gap-1">
                      {[0, 10, 20].map(pct => (
                        <button
                          key={pct}
                          onClick={() => setDiscount(pct)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                            discount === pct ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between text-slate-400">
                    <span>Tax ({Math.round(TAX_RATE * 100)}%)</span>
                    <span className="font-mono">{money(tax)}</span>
                  </div>

                  <div className="flex justify-between text-slate-100 text-base font-extrabold pt-2 border-t border-slate-800">
                    <span>Total to Pay</span>
                    <span className="font-mono text-amber-400">{money(grandTotal)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    disabled={cart.length === 0}
                    onClick={() => setIsPreAuthOpen(true)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold text-xs rounded-xl transition-all border border-slate-700 flex flex-col items-center justify-center"
                  >
                    <span>Keep on Tab</span>
                    <span className="text-[9px] text-slate-400 font-normal">Pay later</span>
                  </button>

                  <button
                    disabled={cart.length === 0 || isEodLocked}
                    onClick={() => setIsCheckoutOpen(true)}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="h-4 w-4" /> Pay Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: OPEN TABS MANAGEMENT */}
        {activeTab === 'tabs' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-100">Open Tabs</h2>
                  <p className="text-sm text-slate-400">Customers who have not paid yet. Take their payment here.</p>
                </div>
                <button
                  onClick={() => setActiveTab('pos')}
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <Plus className="h-4 w-4" /> Open New Tab
                </button>
              </div>

              <div style={cardGrid(300, 24)}>
                {openTabs.map(tab => (
                  <div key={tab.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-slate-100 text-lg">{tab.customer}</h3>
                          <span className="text-xs text-slate-500 font-mono">Opened at {tab.openedAt}</span>
                        </div>
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-400 text-xs font-mono font-bold rounded-lg border border-amber-500/20">
                          {tab.items.reduce((a: number, i: any) => a + i.qty, 0)} items
                        </span>
                      </div>

                      <div className="bg-slate-950/60 rounded-xl p-3 space-y-2 border border-slate-800/80 my-3">
                        {tab.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-300">
                            <span>{it.qty}x {it.name}{it.variant ? ` (${it.variant})` : ''}</span>
                            <span className="font-mono text-slate-400">{money((it.price * it.qty))}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tab Total</span>
                        <p className="font-extrabold text-slate-100 text-xl font-mono">{money(tab.balance)}</p>
                      </div>

                      <button
                        onClick={() => {
                          const loadedCart = tab.items.map(ti => {
                            const found = products.find(p => p.id === ti.productId) || products.find(p => p.name === ti.name);
                            const { photo: _ph, ...match } = (found || { id: 'temp-' + Math.random(), stock: 99 }) as any;
                            return {
                              ...match,
                              cartId: match.id + '-' + Math.random(),
                              name: ti.name,
                              price: ti.price,
                              qty: ti.qty,
                              selectedVariant: ti.variant || null,
                              pack: ti.pack || 'single',
                              packUnit: ti.packUnit || null,
                              size: ti.size || 1,
                              cost: ti.cost ?? match.cost,
                            };
                          });
                          setCart(loadedCart);
                          setCustomerName(tab.customer);
                          setOpenTabs(openTabs.filter(t => t.id !== tab.id));
                          setActiveTab('pos');
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs rounded-xl transition-all border border-slate-700"
                      >
                        Pay and Close Tab
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: DETAILED INVENTORY & DAILY STOCK TRACKING */}
        {activeTab === 'inventory' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-100">Daily Stock</h2>
                  <p className="text-sm text-slate-400">The stock you started with, what you sold today, what is left, and how much money it can bring.</p>
                </div>

                {isOwner && (
                <div className="flex gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => setShowStockHistory(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" /> Delivery History
                  </button>
                  <button
                    onClick={() => setIsItemModalOpen(true)}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <Plus className="h-4 w-4" /> Add New Item
                  </button>
                </div>
                )}
              </div>

              {/* Detailed Inventory Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                <table style={{ minWidth: 760 }} className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-4">Item & Code</th>
                      <th className="px-6 py-4">Stock at Start</th>
                      <th className="px-6 py-4">Sold Today</th>
                      <th className="px-6 py-4">Stock Left</th>
                      <th className="px-6 py-4">Status</th>
                      {isOwner && <>
                      <th className="px-6 py-4">Money From Sales</th>
                      <th className="px-6 py-4 text-right">Stock Worth</th>
                      <th className="px-6 py-4 text-right">Receive</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {scopedProducts.map(product => {
                      const totalRevenue = shiftRevenueByProduct.get(product.id) ?? 0; // real money taken this shift (boxes and bottles at their own prices)
                      const potentialValue = product.stock * product.price; // counted at the single-bottle price
                      const isLow = product.stock <= product.minThreshold && product.stock > 0;
                      const isOut = product.stock <= 0;

                      return (
                        <tr key={product.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <ProductThumb product={product} size={48} />
                            <div>
                              <p className="font-bold text-slate-100">{product.name}</p>
                              <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-semibold text-slate-300">
                            {product.startingStock} {product.unit}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-amber-400">
                            {product.unitsSold}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-100">
                            {hasBox(product) ? <>{product.stock} {product.unit}<span className="block text-[11px] font-semibold text-indigo-300">{boxesText(product)}</span></> : <>{product.stock} {product.unit}</>}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                              isOut 
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                                : isLow 
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {isOut ? 'Out of Stock' : isLow ? 'Running Low' : 'In Stock'}
                            </span>
                          </td>
                          {isOwner && <>
                          <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                            {money(totalRevenue)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-300">
                            {money(potentialValue)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => { setRestockItem(product); setRestockForm({ qty: '', cost: '', by: hasBox(product) ? 'box' : 'bottle' }); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${isOut || isLow ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                            >
                              + Restock
                            </button>
                            <button
                              onClick={() => setEditItem(product)}
                              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-slate-800 text-slate-200 hover:bg-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem(product)}
                              title="Delete this item"
                              className="ml-2 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 inline-flex items-center"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {isOwner && deletedProducts.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <button onClick={() => setShowDeleted(v => !v)} className="w-full flex items-center justify-between text-left">
                    <span className="font-bold text-slate-200 text-sm">Deleted items ({deletedProducts.length})</span>
                    <span className="text-xs font-bold text-amber-400">{showDeleted ? 'Hide' : 'Show'}</span>
                  </button>
                  {showDeleted && (
                    <div className="space-y-2">
                      {deletedProducts.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                          <div className="flex items-center gap-3 min-w-0 opacity-70">
                            <ProductThumb product={p} size={40} />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-300 truncate">{p.name}</p>
                              <p className="text-[11px] text-slate-500">{p.sku} · {p.stock} {p.unit} left{p.archivedAt ? ` · deleted ${new Date(p.archivedAt).toLocaleDateString()}` : ''}{p.archivedBy ? ` by ${p.archivedBy}` : ''}</p>
                            </div>
                          </div>
                          <button onClick={() => handleRestoreItem(p)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400">Restore</button>
                        </div>
                      ))}
                      <p className="text-[11px] text-slate-500">Restoring brings the item back with the same stock it had when it was deleted. Count it again at End of Day if needed.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 4: END OF DAY (EOD) RECONCILIATION */}
        {activeTab === 'eod' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
                    <ClipboardList className="h-6 w-6 text-amber-400" /> End of Day: Count and Close
                  </h2>
                  <p className="text-sm text-slate-400">Count your stock, see what is missing, and close the shift.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEodSummaryModal(true)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-700"
                  >
                    <FileText className="h-4 w-4" /> See Full End of Day Report
                  </button>

                  <button
                    onClick={isEodLocked ? handleReopenShift : handleCloseShift}
                    className={`px-5 py-2.5 font-extrabold text-xs rounded-xl flex items-center gap-2 transition-all shadow-lg ${
                      isEodLocked
                        ? 'bg-rose-500 text-white shadow-rose-500/20'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    }`}
                  >
                    <Lock className="h-4 w-4" /> {isEodLocked ? 'Start New Shift' : 'Close Shift'}
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              <div style={cardGrid(250)}>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-xs text-slate-500 uppercase font-bold">Stock Worth at Start</span>
                  <p className="text-2xl font-extrabold text-slate-100 font-mono mt-1 whitespace-nowrap">{money(eodMetrics.totalStartingValue)}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-xs text-slate-500 uppercase font-bold">Stock Worth Expected</span>
                  <p className="text-2xl font-extrabold text-amber-400 font-mono mt-1">{money(eodMetrics.totalExpectedValue)}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-xs text-slate-500 uppercase font-bold">Stock Worth Counted</span>
                  <p className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">{money(eodMetrics.totalActualValue)}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-xs text-slate-500 uppercase font-bold">Stock Lost (missing or wasted)</span>
                  <p className="text-2xl font-extrabold text-rose-400 font-mono mt-1 whitespace-nowrap">
                    -{money(eodMetrics.totalShrinkageValue)}
                    <span className="block text-xs font-sans font-semibold text-slate-400">{eodMetrics.totalShrinkageUnits} units</span>
                  </p>
                </div>
              </div>

              {/* Money in / out for this shift */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2"><Wallet className="h-4 w-4 text-amber-400" /> Cash &amp; Expenses{isEodLocked ? ' (closed shift)' : ' (this shift)'}</h3>
                  <button onClick={() => setActiveTab('expenses')} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700">
                    {isEodLocked ? 'Add late expense' : 'Add / review expenses'}
                  </button>
                </div>
                <div style={cardGrid(200)}>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-500 uppercase font-bold">Sales</span>
                    <p className="text-xl font-extrabold text-emerald-400 font-mono mt-1 whitespace-nowrap">{money(totalSalesVolume)}</p>
                    {shiftRefundTotals.count > 0 && <span className="text-[11px] text-rose-400">after {money(shiftRefundTotals.total)} refunds ({shiftRefundTotals.count})</span>}
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-500 uppercase font-bold">Expenses</span>
                    <p className="text-xl font-extrabold text-rose-400 font-mono mt-1 whitespace-nowrap">-{money(shiftExpenseTotals.total)}</p>
                    <span className="text-[11px] text-slate-500">{shiftExpenseList.length} entries</span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-500 uppercase font-bold">Net after expenses</span>
                    <p className={`text-xl font-extrabold font-mono mt-1 whitespace-nowrap ${totalSalesVolume - shiftExpenseTotals.total < 0 ? 'text-rose-400' : 'text-amber-400'}`}>{money(totalSalesVolume - shiftExpenseTotals.total)}</p>
                    <span className="text-[11px] text-slate-500">Before stock cost and lost stock</span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-500 uppercase font-bold">Cash to hand over</span>
                    <p className="text-xl font-extrabold text-slate-100 font-mono mt-1 whitespace-nowrap">{money(shiftCashSales - shiftExpenseTotals.till)}</p>
                    <span className="text-[11px] text-slate-500">{money(shiftCashSales)} cash sales − {money(shiftExpenseTotals.till)} paid from till</span>
                  </div>
                </div>
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Cash drawer</p>
                  <div style={cardGrid(200)}>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Cash at start of shift ({CURRENCY})</label>
                      <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" disabled={isEodLocked} value={cashFloat} onChange={e => setCashFloat(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-100 mt-1 focus:outline-none focus:border-amber-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Cash counted in drawer ({CURRENCY})</label>
                      <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Count it, then type it" disabled={isEodLocked} value={cashCounted} onChange={e => setCashCounted(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-100 mt-1 focus:outline-none focus:border-amber-500 disabled:opacity-50" />
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <span className="text-xs text-slate-500 uppercase font-bold">Should be in drawer</span>
                      <p className="text-lg font-extrabold text-slate-100 font-mono whitespace-nowrap">{money(cashExpected)}</p>
                      <span className="text-[11px] text-slate-500">start cash + cash sales − cash paid out</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                      <span className="text-xs text-slate-500 uppercase font-bold">Extra / missing cash</span>
                      {cashVariance === null ? (
                        <p className="text-lg font-extrabold text-slate-500 font-mono">Not counted</p>
                      ) : (
                        <p className={`text-lg font-extrabold font-mono whitespace-nowrap ${cashVariance === 0 ? 'text-emerald-400' : cashVariance < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                          {cashVariance === 0 ? 'Balanced' : cashVariance < 0 ? `Short ${money(Math.abs(cashVariance))}` : `Over ${money(cashVariance)}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {!isEodLocked && shiftExpenseList.length === 0 && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> No expenses recorded this shift. If money went out (ice, transport, wages), add it before closing.</p>
                )}
              </div>

              {/* Physical Audit Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="font-bold text-slate-200 text-sm">Count Your Stock</h3>
                  <span className="text-xs text-slate-400">Type what you counted on the shelf before you close the shift</span>
                </div>

                <div className="overflow-x-auto">
                <table style={{ minWidth: 760 }} className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Product</th>
                      <th className="px-6 py-3.5">Stock at Start</th>
                      <th className="px-6 py-3.5">Should Be Left</th>
                      <th className="px-6 py-3.5">You Counted</th>
                      <th className="px-6 py-3.5">Difference</th>
                      <th className="px-6 py-3.5 text-right">Money Lost or Gained</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {scopedProducts.map(p => {
                      const actualCount = physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock;
                      const variance = actualCount - p.stock;
                      const costImpact = variance * p.cost;

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <ProductThumb product={p} size={36} />
                            <div>
                              <p className="font-bold text-slate-100">{p.name}</p>
                              <p className="text-xs text-slate-500 font-mono">{p.sku}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono">{p.startingStock}</td>
                          <td className="px-6 py-4 font-mono font-bold text-amber-400">{p.stock}</td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              disabled={isEodLocked}
                              value={actualCount}
                              onChange={(e) => handlePhysicalCountChange(p.id, e.target.value)}
                              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            />
                          </td>
                          <td className="px-6 py-4 font-mono font-bold">
                            {variance === 0 ? (
                              <span className="text-slate-500">0 (Correct)</span>
                            ) : variance < 0 ? (
                              <span className="text-rose-400">{variance} (Missing)</span>
                            ) : (
                              <span className="text-emerald-400">+{variance} (Extra)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold">
                            {costImpact < 0 ? (
                              <span className="text-rose-400">-{money(Math.abs(costImpact))}</span>
                            ) : costImpact > 0 ? (
                              <span className="text-emerald-400">+{money(costImpact)}</span>
                            ) : (
                              <span className="text-slate-500">{money(0)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Closed shift history */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="font-bold text-slate-100 mb-3">Closed Shifts</h3>
                {closedShifts.length === 0 ? (
                  <p className="text-xs text-slate-500">No shifts closed yet. Close the shift at the end of the night to record it here.</p>
                ) : (
                  <div className="space-y-2">
                    {closedShifts.map((c: any) => (
                      <div key={c.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-200">{fmtDateTime(c.openedAt)} → {fmtDateTime(c.closedAt)}</p>
                          <p className="text-slate-500">{c.count} sales · Bar {money(c.barSales)} · Wholesale {money(c.retailSales)}</p>
                          <p className="text-slate-500">Cash {money(c.cash)} · Mobile {money(c.mobile)} · Card {money(c.card)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-extrabold text-amber-400 text-base">{money(c.total)}</p>
                          <p className="text-rose-400">Lost stock {money(c.shrinkageValue)} ({c.shrinkageUnits} units)</p>
                          <p className="text-rose-400">Expenses -{money(expensesFor(c).total)}</p>
                          <p className="text-slate-300 font-bold">Left after expenses {money(c.total - expensesFor(c).total)}</p>
                          {c.cashVariance != null && (
                            <p className={c.cashVariance === 0 ? 'text-emerald-400' : c.cashVariance < 0 ? 'text-rose-400' : 'text-amber-400'}>
                              Cash {c.cashVariance === 0 ? 'correct' : c.cashVariance < 0 ? `missing ${money(Math.abs(c.cashVariance))}` : `extra ${money(c.cashVariance)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SALES & REFUNDS */}
        {activeTab === 'sales' && (
          <SalesView
            shiftSales={shiftSales} allSales={salesHistory} refundedQty={refundedQty} refundsBySale={refundsBySale}
            isOwner={isOwner} isLocked={isEodLocked} shiftStart={shiftStart} onRefund={handleRefund}
            money={money} fmtDateTime={fmtDateTime} currency={CURRENCY}
          />
        )}

        {/* VIEW: EXPENSES */}
        {activeTab === 'expenses' && (
          <ExpensesView
            shiftList={shiftExpenseList} shiftTotals={shiftExpenseTotals} allLive={liveExpenses} voidedIds={voidedIds}
            cashSales={shiftCashSales} isLocked={isEodLocked} isOwner={isOwner}
            onAdd={handleAddExpense} onVoid={handleVoidExpense}
            money={money} fmtDateTime={fmtDateTime} currency={CURRENCY}
          />
        )}

        {/* VIEW: CALENDAR OF EOD RESULTS (owner) */}
        {activeTab === 'calendar' && (
          <CalendarView shifts={calendarShifts} money={money} fmtDateTime={fmtDateTime} currency={CURRENCY} showLosses={isOwner} />
        )}

        {/* VIEW 5: ANALYTICS & REVENUE */}
        {activeTab === 'analytics' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-100">Sales & Profit</h2>
                  <p className="text-sm text-slate-400">See how much money the Bar and the Wholesale are making</p>
                </div>
                <button onClick={handleExportExcel} disabled={exporting} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-60">
                  <Download className="h-4 w-4" /> {exporting ? 'Preparing Excel…' : 'Download Excel (all sales, staff, expenses)'}
                </button>
              </div>

              {/* KPI Metrics */}
              <div style={cardGrid(250, 24)}>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Sales This Shift</span>
                  <p className="text-3xl font-extrabold text-amber-400 font-mono mt-2">{money(totalSalesVolume)}</p>
                  <span className="text-xs text-emerald-400 flex items-center gap-1 mt-2">
                    <TrendingUp className="h-3.5 w-3.5" /> Last 24 hours: {money(rolling24h)}
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Money on Open Tabs</span>
                  <p className="text-3xl font-extrabold text-slate-100 font-mono mt-2">
                    {money(openTabs.reduce((a, b) => a + b.balance, 0))}
                  </p>
                  <span className="text-xs text-slate-400 mt-2 block">{openTabs.length} open tabs</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Average Profit</span>
                  <p className="text-3xl font-extrabold text-emerald-400 font-mono mt-2">{avgMargin.toFixed(1)}%</p>
                  <span className="text-xs text-slate-400 mt-2 block">Average for all your items</span>
                </div>
              </div>

              {/* Profit: revenue - cost of goods - expenses - shrinkage */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-100">Profit &amp; Expenses</h3>
                    <p className="text-xs text-slate-500">Profit = Sales − cost of the items sold − expenses − lost stock. Stock you add with Receive Stock is counted when it is sold, so do not enter it as an expense.</p>
                  </div>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {[['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']].map(([id, label]) => (
                      <button key={id} onClick={() => setProfitPeriod(id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${profitPeriod === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div style={cardGrid(170, 12)}>
                  {[
                    ['Revenue', profit.revenue, 'text-emerald-400', ''],
                    ['Cost of goods', profit.cogs, 'text-slate-100', '-'],
                    ['Gross profit', profit.revenue - profit.cogs, 'text-amber-400', ''],
                    ['Expenses', profit.expenses, 'text-rose-400', '-'],
                    ['Shrinkage', profit.shrink, 'text-rose-400', '-'],
                    ['Net profit', profit.net, profit.net < 0 ? 'text-rose-400' : 'text-emerald-400', ''],
                  ].map(([label, value, tone, sign]: any) => (
                    <div key={label} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 min-w-0">
                      <span className="text-[11px] text-slate-500 uppercase font-bold">{label}</span>
                      <p className={`text-lg font-extrabold font-mono mt-1 whitespace-nowrap ${tone}`}>{sign}{money(value)}</p>
                    </div>
                  ))}
                </div>
                {profit.revenue > 0 && (
                  <p className="text-xs text-slate-400">Profit {((profit.net / profit.revenue) * 100).toFixed(1)}% of sales · Expenses are {((profit.expenses / profit.revenue) * 100).toFixed(1)}% of sales</p>
                )}
                <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                  <div className="overflow-x-auto">
                    <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">By day (latest 14)</p>
                    <table className="w-full text-xs text-slate-300" style={{ minWidth: 380 }}>
                      <thead className="text-slate-500 uppercase text-[10px]"><tr><th className="text-left py-1">Day</th><th className="text-right">Sales</th><th className="text-right">Item Cost</th><th className="text-right">Expenses</th><th className="text-right">Profit</th></tr></thead>
                      <tbody className="divide-y divide-slate-800">
                        {profit.days.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-500">No sales or expenses in this period.</td></tr>}
                        {profit.days.map((d: any) => (
                          <tr key={d.day}>
                            <td className="py-1.5">{d.day}</td>
                            <td className="text-right font-mono">{money(d.revenue)}</td>
                            <td className="text-right font-mono">{money(d.cogs)}</td>
                            <td className="text-right font-mono text-rose-400">{money(d.expenses)}</td>
                            <td className={`text-right font-mono font-bold ${d.net < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{money(d.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Expenses by category</p>
                    {profit.byCat.length === 0 ? <p className="text-xs text-slate-500">No expenses in this period.</p> : (
                      <div className="space-y-1.5">
                        {profit.byCat.map(([cat, amt]: any) => (
                          <div key={cat} className="text-xs">
                            <div className="flex justify-between text-slate-300"><span>{cat}</span><span className="font-mono font-bold">{money(amt)}</span></div>
                            <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden"><div className="h-full bg-amber-500/70" style={{ width: `${(amt / (profit.byCat[0][1] || 1)) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sales Split Chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="font-bold text-slate-100 mb-4">Sales by Hour (Bar and Wholesale)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                      <Bar dataKey="barSales" name="Bar Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="retailSales" name="Wholesale" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* --- MODALS --- */}

      {editItem && isOwner && <ItemEditModal item={editItem} currency={CURRENCY} onSave={handleSaveEdit} onClose={() => setEditItem(null)} />}

      {restockItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleRestock} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-extrabold">Receive Stock</h3>
                <p className="text-xs text-slate-400">{restockItem.name} · now {stockText(restockItem)}</p>
              </div>
              <button type="button" onClick={() => setRestockItem(null)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            {hasBox(restockItem) && (
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                {[['box', `${nounOf(restockItem) === 'crate' ? 'Crates' : 'Boxes'} (${restockItem.boxQty} each)`], ['bottle', 'Single bottles']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setRestockForm({ ...restockForm, by: id })}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${restockForm.by === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>{label}</button>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-400">{hasBox(restockItem) ? (restockForm.by === 'box' ? (nounOf(restockItem) === 'crate' ? 'Crates received' : 'Boxes received') : 'Bottles received') : 'Quantity received'}</label>
              <input autoFocus type="number" min="1" required value={restockForm.qty} onChange={e => setRestockForm({ ...restockForm, qty: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-mono text-slate-100 mt-1 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">New cost for each {hasBox(restockItem) && restockForm.by === 'box' ? nounOf(restockItem) : ''} ({CURRENCY}), optional</label>
              <input type="number" min="0" step="0.01" placeholder={String(hasBox(restockItem) && restockForm.by === 'box' ? (restockItem.boxCost || restockItem.cost * restockItem.boxQty) : restockItem.cost)} value={restockForm.cost} onChange={e => setRestockForm({ ...restockForm, cost: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-slate-100 mt-1 focus:outline-none focus:border-amber-500" />
            </div>
            {restockForm.qty && parseInt(restockForm.qty, 10) > 0 && (
              <p className="text-xs text-emerald-400">
                {hasBox(restockItem) && restockForm.by === 'box' && <>Adds {parseInt(restockForm.qty, 10) * restockItem.boxQty} bottles. </>}
                New stock: {stockText({ ...restockItem, stock: restockItem.stock + parseInt(restockForm.qty, 10) * (hasBox(restockItem) && restockForm.by === 'box' ? restockItem.boxQty : 1) })}
              </p>
            )}
            {stockLog.filter((l: any) => l.productId === restockItem.id).length > 0 && (
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p className="font-bold uppercase">Recent deliveries</p>
                {stockLog.filter((l: any) => l.productId === restockItem.id).slice(0, 3).map((l: any) => (
                  <p key={l.id}>{fmtDateTime(l.ts)} · +{l.qty} · {money(l.cost)} each · {l.by}</p>
                ))}
              </div>
            )}
            <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl">Add to stock</button>
          </form>
        </div>
      )}

      {showStockHistory && <StockHistoryModal log={stockLog} money={money} fmtDateTime={fmtDateTime} onClose={() => setShowStockHistory(false)} />}
      {showSync && <SyncModal sync={sync} onClose={() => setShowSync(false)} />}
      {showBusiness && isOwner && <BusinessModal business={business} onSave={b => { setBusiness(b); setShowBusiness(false); }} onClose={() => setShowBusiness(false)} onTestPrint={b => printHtml(buildReceiptHtml(sampleReceipt(b, money, BRAND.product)))} />}
      {showTeam && isOwner && <TeamModal auth={auth} onClose={() => setShowTeam(false)} />}

      {/* 1. EOD PRINTABLE SUMMARY MODAL */}
      {eodSummaryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl">
            
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-xl font-extrabold text-slate-100">End of Day Summary</h3>
                <p className="text-xs text-slate-400">Shift Report</p>
              </div>
              <button onClick={() => setEodSummaryModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <p className="text-slate-500">Stock Worth at Start</p>
                  <p className="text-base font-bold text-slate-200">{money(eodMetrics.totalStartingValue)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Stock Expected to Remain</p>
                  <p className="text-base font-bold text-amber-400">{money(eodMetrics.totalExpectedValue)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Stock Worth Counted</p>
                  <p className="text-base font-bold text-emerald-400">{money(eodMetrics.totalActualValue)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Stock Lost</p>
                  <p className="text-base font-bold text-rose-400">-{money(eodMetrics.totalShrinkageValue)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <p className="text-slate-500">Sales</p>
                  <p className="text-base font-bold text-emerald-400">{money(totalSalesVolume)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Expenses</p>
                  <p className="text-base font-bold text-rose-400">-{money(shiftExpenseTotals.total)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Net after expenses</p>
                  <p className="text-base font-bold text-amber-400">{money(totalSalesVolume - shiftExpenseTotals.total)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Cash to hand over</p>
                  <p className="text-base font-bold text-slate-200">{money(shiftCashSales - shiftExpenseTotals.till)}</p>
                </div>
              </div>
              {shiftExpenseList.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 text-slate-300">
                  {shiftExpenseList.map((x: any) => (
                    <div key={x.id} className="flex justify-between"><span>{x.category}{x.payee ? ` · ${x.payee}` : ''}</span><span>-{money(x.amount)}</span></div>
                  ))}
                </div>
              )}

              <div className="max-h-48 overflow-y-auto space-y-2 border-t border-slate-800 pt-3">
                {scopedProducts.map(p => {
                  const actualCount = physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock;
                  const diff = actualCount - p.stock;
                  return (
                    <div key={p.id} className="flex justify-between items-center text-slate-300">
                      <span>{p.name} ({p.sku})</span>
                      <span>Start: {p.startingStock} | Sold: {p.unitsSold} | Counted: {actualCount} {diff !== 0 && `(${diff})`}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePrintReport}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700"
              >
                <Printer className="h-4 w-4" /> Print Report
              </button>
              <button
                onClick={() => setEodSummaryModal(false)}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 2. CHECKOUT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl max-h-[94vh] overflow-y-auto">
            
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-slate-100">Take Payment</h3>
              <button onClick={() => { setIsCheckoutOpen(false); setAmountReceived(''); }} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
              <span className="text-xs text-slate-500 font-bold uppercase">Total to Pay</span>
              <p className="text-4xl font-extrabold text-amber-400 font-mono mt-1">{money(grandTotal)}</p>
            </div>

            {cart.some((i: any) => hasBox(productOf(i.id))) && (
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-bold">What is being sold (choose the pack, then the count)</label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {cart.map((item: any) => (
                    <div key={item.cartId} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-200">{item.name}</span>
                        <span className="font-mono font-bold text-slate-100">{money(item.price * item.qty)}</span>
                      </div>
                      {packToggle(item)}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg">
                          <button type="button" onClick={() => updateQty(item.cartId, -1)} className="p-1.5 hover:text-amber-400 text-slate-400"><Minus className="h-3.5 w-3.5" /></button>
                          <QtyInput value={item.qty} max={maxFor(item)} onCommit={n => setCartQty(item.cartId, n)} />
                          <button type="button" onClick={() => updateQty(item.cartId, 1)} className="p-1.5 hover:text-amber-400 text-slate-400"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 text-right">
                          {(item.pack || 'single') !== 'single'
                            ? <>{countUnit(item.qty, item.packUnit || 'box')} × {item.size} = <b className="text-indigo-300">{bottlesOf(item)} bottles</b></>
                            : <>{item.qty} {plural(item.qty, 'bottle', 'bottles')}</>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] font-bold text-slate-400 px-1">
                  <span>Total bottles going out</span>
                  <span className="font-mono text-slate-200">{cart.reduce((a: number, i: any) => a + bottlesOf(i), 0)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-bold">How is the customer paying?</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'mobile', label: 'Mobile Money', icon: QrCode },
                  { id: 'card', label: 'Card', icon: CreditCard }
                ].map(pm => {
                  const Icon = pm.icon;
                  return (
                    <button
                      key={pm.id}
                      onClick={() => { setPaymentMethod(pm.id); setAmountReceived(''); }}
                      className={`py-3 px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                        paymentMethod === pm.id
                          ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {pm.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === 'cash' && (() => {
              const got = amountReceived.trim() === '' ? null : Number(amountReceived);
              const short = got !== null && (!isFinite(got) || got + 0.005 < grandTotal);
              const change = got !== null && !short ? Math.round((got - grandTotal) * 100) / 100 : null;
              const round = (n: number) => Math.ceil(grandTotal / n - 1e-9) * n;
              const quick = Array.from(new Set([round(10), round(50), round(100), round(200)].filter(v => v >= grandTotal && v > 0))).slice(0, 3);
              return (
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-bold">Cash given by customer (optional)</label>
                  <input
                    type="number" inputMode="decimal" min={0} step="0.01"
                    value={amountReceived}
                    onChange={e => setAmountReceived(e.target.value)}
                    placeholder={`e.g. ${money(round(50)).replace(/\.00$/, '')}`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-base font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setAmountReceived(String(grandTotal))} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">Exact</button>
                    {quick.map(v => (
                      <button type="button" key={v} onClick={() => setAmountReceived(String(v))} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700">{money(v).replace(/\.00$/, '')}</button>
                    ))}
                  </div>
                  {short && <p className="text-xs font-bold text-rose-400">Not enough: {money(grandTotal - (got || 0))} short.</p>}
                  {change !== null && (
                    <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
                      <span className="text-xs font-bold text-emerald-400 uppercase">Change to give</span>
                      <span className="text-2xl font-extrabold font-mono text-emerald-400">{money(change)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <button
              onClick={handleCompleteOrder}
              disabled={paymentMethod === 'cash' && amountReceived.trim() !== '' && (!isFinite(Number(amountReceived)) || Number(amountReceived) + 0.005 < grandTotal)}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-5 w-5" /> Finish Sale
            </button>
          </div>
        </div>
      )}

      {/* 3. PRE-AUTH TAB MODAL */}
      {isPreAuthOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-slate-100">Open a Tab</h3>
              <button onClick={() => setIsPreAuthOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-bold">Customer or Table Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mutale or Table 12"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 mt-1 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-1">
                <ShieldCheck className="h-8 w-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 font-bold">The tab will be saved under this name</p>
                <p className="text-[10px] text-slate-500">The items stay on the tab. The customer can pay later with cash, mobile money or card.</p>
              </div>
            </div>

            <button
              onClick={() => {
                if (!customerName) {
                  alert('Please type the customer or table name.');
                  return;
                }
                if (cart.length === 0) {
                  alert('Add some items first, then open the tab.');
                  return;
                }

                const newTab = {
                  id: `t-${newId().slice(0, 8)}`,
                  customer: customerName,
                  openedTs: Date.now(),
                  balance: grandTotal,
                  openedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  items: cart.map(i => ({ productId: i.id, name: i.name, variant: i.selectedVariant || null, pack: i.pack || 'single', packUnit: i.packUnit || null, size: i.size || 1, cost: i.cost || 0, price: i.price, qty: i.qty }))
                };

                setOpenTabs([newTab, ...openTabs]);
                setCart([]);
                setCustomerName('');
                setIsPreAuthOpen(false);
              }}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
            >
              Save Tab
            </button>
          </div>
        </div>
      )}

      {/* 4. NEW ITEM INVENTORY MODAL */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveNewItem} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[94vh] overflow-y-auto">
            
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-slate-100">Add New Item</h3>
              <button type="button" onClick={() => setIsItemModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-bold">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mosi Lager 6-Pack"
                  value={newItem.name}
                  onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-bold">Category</label>
                  <select
                    value={newItem.category}
                    onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                  >
                    <option value="Bar">Bar</option>
                    <option value="Retail">Wholesale</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold">Type</label>
                  <select
                    value={newItem.subcategory}
                    onChange={e => setNewItem({ ...newItem, subcategory: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                  >
                    {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-bold">Item Code (barcode)</label>
                  <input
                    type="text"
                    placeholder="e.g. BEER-999"
                    value={newItem.sku}
                    onChange={e => setNewItem({ ...newItem, sku: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-bold">{WS === 'Retail' ? 'Cost per bottle (K)' : 'Cost Price (K)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newItem.cost}
                    onChange={e => setNewItem({ ...newItem, cost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold">{WS === 'Retail' ? 'Price per bottle (K)' : 'Selling Price (K)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={newItem.price}
                    onChange={e => setNewItem({ ...newItem, price: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold">{WS === 'Retail' ? 'Stock at Start (bottles)' : 'Stock at Start'}</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={newItem.stock}
                    onChange={e => setNewItem({ ...newItem, stock: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 mt-1"
                  />
                </div>
              </div>
            </div>

            <PhotoPicker value={newItem.photo} emoji={newItem.image} onChange={photo => setNewItem({ ...newItem, photo })} />

            {WS === 'Retail' && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-indigo-300">{newItem.subcategory === 'Beer' ? 'Lager: sold by the crate and half crate' : 'Sold by the box too (spirits, gin...), optional'}</p>
                <div className="grid grid-cols-3 gap-3">
                  <input type="number" min="2" placeholder={newItem.subcategory === 'Beer' ? 'Bottles in a crate' : 'Bottles in a box'} value={newItem.boxQty} onChange={e => setNewItem({ ...newItem, boxQty: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                  <input type="number" step="0.01" placeholder={newItem.subcategory === 'Beer' ? 'Crate price (K)' : 'Box price (K)'} value={newItem.boxPrice} onChange={e => setNewItem({ ...newItem, boxPrice: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                  <input type="number" step="0.01" placeholder={newItem.subcategory === 'Beer' ? 'Crate cost (K)' : 'Box cost (K)'} value={newItem.boxCost} onChange={e => setNewItem({ ...newItem, boxCost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                </div>
                {newItem.subcategory === 'Beer' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="0.01" placeholder="Half crate price (K)" value={newItem.halfPrice} onChange={e => setNewItem({ ...newItem, halfPrice: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                    <input type="number" step="0.01" placeholder="Half crate cost (K)" value={newItem.halfCost} onChange={e => setNewItem({ ...newItem, halfCost: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                  </div>
                )}
                <p className="text-[11px] text-slate-500">{newItem.subcategory === 'Beer' ? 'The till will offer "Crate" and "Half crate" (no single bottles). Leave the half crate price empty to charge exactly half.' : 'The till will offer "Bottle" and "Box" for this item.'} Stock is kept in bottles.</p>
              </div>
            )}

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-bold text-amber-400">Bulk (wholesale) price, optional</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min="2" placeholder="Buy this many or more" value={newItem.bulkQty} onChange={e => setNewItem({ ...newItem, bulkQty: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
                <input type="number" step="0.01" placeholder="Price each (K)" value={newItem.bulkPrice} onChange={e => setNewItem({ ...newItem, bulkPrice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 mt-4"
            >
              Save Item
            </button>
          </form>
        </div>
      )}

      {/* 5. DIGITAL RECEIPT MODAL */}
      {currentReceipt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            
            <div className="text-center space-y-1 pb-3 border-b border-slate-800">
              <h3 className="font-extrabold text-lg text-slate-100">{bizName || BRAND.product}</h3>
              {businessLine(business) && <p className="text-[10px] text-slate-500">{businessLine(business)}</p>}
              <p className="text-xs text-slate-500">Receipt #{currentReceipt.txId}</p>
              <p className="text-[10px] text-slate-600 font-mono">{currentReceipt.date} • {currentReceipt.timestamp}</p>
            </div>

            <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
              {currentReceipt.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-slate-300">{it.qty}x {it.name}{it.variant ? ` (${it.variant})` : ''}</span>
                  <span className="font-mono text-slate-400">{money((it.price * it.qty))}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono">{money(currentReceipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax ({Math.round(TAX_RATE * 100)}%)</span>
                <span className="font-mono">{money(currentReceipt.tax)}</span>
              </div>
              <div className="flex justify-between text-slate-100 font-bold text-sm pt-1">
                <span>Total Paid ({currentReceipt.paymentMethod})</span>
                <span className="font-mono text-amber-400">{money(currentReceipt.grandTotal)}</span>
              </div>
              {currentReceipt.tendered != null && (
                <>
                  <div className="flex justify-between text-slate-400"><span>Cash received</span><span className="font-mono">{money(currentReceipt.tendered)}</span></div>
                  <div className="flex justify-between text-emerald-400 font-bold"><span>Change</span><span className="font-mono">{money(currentReceipt.change)}</span></div>
                </>
              )}
            </div>

            {waOpen && (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    autoFocus type="tel" inputMode="tel" value={waPhone}
                    onChange={e => { setWaPhone(e.target.value); setWaError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') sendReceiptWhatsApp(); }}
                    placeholder="Customer WhatsApp e.g. 0977123456"
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  />
                  <button onClick={sendReceiptWhatsApp} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl">Send</button>
                </div>
                {waError && <p className="text-[11px] text-rose-400">{waError}</p>}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => printHtml(buildReceiptHtml({ ...currentReceipt, business, businessName: bizName || BRAND.product, footer: business.footer, product: BRAND.product, tax: currentReceipt.tax, taxPct: Math.round(TAX_RATE * 100), money }))}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button
                onClick={() => { setWaOpen(o => !o); setWaError(''); }}
                className="flex-1 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </button>
              <button
                onClick={() => { setCurrentReceipt(null); setWaOpen(false); setWaPhone(''); setWaError(''); }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
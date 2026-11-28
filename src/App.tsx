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
  MessageCircle,
  HandCoins
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
  Area, 
  LineChart, 
  Line, 
  Legend 
} from 'recharts';
import { usePersistentState, usePersistentCollection, resetAllData } from './storage';
import { STORE_ID } from './sync/supabase';
import { useSupabaseSync } from './sync/useSupabaseSync';
import SyncModal from './sync/SyncModal';
import TeamModal from './auth/TeamModal';
import CalendarView from './CalendarView';
import StockHistoryModal from './StockHistoryModal';
import ShiftRecordModal from './ShiftRecordModal';
import MySalesView from './MySalesView';
import CreditsView from './CreditsView';
import { buildLedger, balanceOf, checkGive, creditGiven, DEFAULT_POLICY, CreditCustomer } from './credits';
import MoneySimple, { ShiftMoneyCard } from './MoneySimple';
import ReprintView from './ReprintView';
import ExpensesView, { PAID_FROM } from './ExpensesView';
import DrawersView, { VerdictBadge } from './DrawersView';
import { drawerFigures, expectedCash, r2 as round2, verdictOf, type OpenDrawer } from './drawers';
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
// Owner stock adjustments (outside a delivery). `loss` reasons count as lost stock (cost x quantity) in profit; the others do not.
const ADJUST_OUT = [
  { id: 'damaged', label: 'Damaged / spilled / broken', loss: true },
  { id: 'expired', label: 'Expired', loss: true },
  { id: 'staff', label: 'Used by staff / given free', loss: true },
  { id: 'missing', label: 'Missing / stolen', loss: true },
  { id: 'supplier', label: 'Returned to supplier', loss: false },
  { id: 'count', label: 'Counting correction', loss: false },
];
const ADJUST_IN = [
  { id: 'count', label: 'Counting correction (found extra)' },
  { id: 'customer', label: 'Returned by a customer' },
  { id: 'transfer', label: 'Moved in from another place' },
  { id: 'other', label: 'Other' },
];
const BIN_DAYS = 5; // a deleted stock item waits in the Bin this long, then is removed for good

const r2n = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
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

// --- STARTER ITEMS (sample items and PLACEHOLDER prices: the owner must change them in the Stock Tracking tab) ---
const INITIAL_PRODUCTS = [
  // BAR: sold one bottle at a time. Each size is its own card (Black Label Small / Big, Mosi Small / Big).
  { id: 'b1', sku: 'BEER-001', name: 'Black Label Small', category: 'Bar', subcategory: 'Beer', price: 35.00, cost: 24.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b7', sku: 'BEER-007', name: 'Black Label Big', category: 'Bar', subcategory: 'Beer', price: 50.00, cost: 36.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b2', sku: 'BEER-002', name: 'Castle', category: 'Bar', subcategory: 'Beer', price: 35.00, cost: 24.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b3', sku: 'BEER-003', name: 'Castle Lite', category: 'Bar', subcategory: 'Beer', price: 38.00, cost: 26.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b4', sku: 'BEER-004', name: 'Mosi Small', category: 'Bar', subcategory: 'Beer', price: 30.00, cost: 20.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b5', sku: 'BEER-005', name: 'Mosi Big', category: 'Bar', subcategory: 'Beer', price: 45.00, cost: 32.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },
  { id: 'b6', sku: 'BEER-006', name: 'Heineken', category: 'Bar', subcategory: 'Beer', price: 45.00, cost: 32.00, startingStock: 48, unitsSold: 0, stock: 48, minThreshold: 12, unit: 'bottles', image: '🍺' },

  // WHOLESALE (internal category id stays 'Retail'). ONE card per product, stock counted in BOTTLES.
  // boxQty / boxPrice / boxCost let the till sell it per bottle OR per box; a box takes boxQty bottles out of stock.
  // Spirits are added the same way (Stock Tracking > Add New Item, fill in the "Sold by the box too" part).
  { id: 'r1', sku: 'WHOL-001', name: 'Black Label Small', category: 'Retail', subcategory: 'Beer', price: 32.00, cost: 24.00, boxQty: 24, boxPrice: 696.00, boxCost: 552.00, startingStock: 240, unitsSold: 0, stock: 240, minThreshold: 48, unit: 'bottles', image: '🍺' },
  { id: 'r13', sku: 'WHOL-013', name: 'Black Label Big', category: 'Retail', subcategory: 'Beer', price: 42.00, cost: 32.00, boxQty: 12, boxPrice: 468.00, boxCost: 372.00, startingStock: 120, unitsSold: 0, stock: 120, minThreshold: 24, unit: 'bottles', image: '🍺' },
  { id: 'r2', sku: 'WHOL-002', name: 'Castle', category: 'Retail', subcategory: 'Beer', price: 32.00, cost: 24.00, boxQty: 24, boxPrice: 696.00, boxCost: 552.00, startingStock: 240, unitsSold: 0, stock: 240, minThreshold: 48, unit: 'bottles', image: '🍺' },
  { id: 'r3', sku: 'WHOL-003', name: 'Castle Lite', category: 'Retail', subcategory: 'Beer', price: 35.00, cost: 26.00, boxQty: 24, boxPrice: 768.00, boxCost: 600.00, startingStock: 240, unitsSold: 0, stock: 240, minThreshold: 48, unit: 'bottles', image: '🍺' },
  { id: 'r4', sku: 'WHOL-004', name: 'Mosi Small', category: 'Retail', subcategory: 'Beer', price: 27.00, cost: 20.00, boxQty: 24, boxPrice: 576.00, boxCost: 456.00, startingStock: 240, unitsSold: 0, stock: 240, minThreshold: 48, unit: 'bottles', image: '🍺' },
  { id: 'r5', sku: 'WHOL-005', name: 'Mosi Big', category: 'Retail', subcategory: 'Beer', price: 42.00, cost: 32.00, boxQty: 12, boxPrice: 468.00, boxCost: 372.00, startingStock: 120, unitsSold: 0, stock: 120, minThreshold: 24, unit: 'bottles', image: '🍺' },
  { id: 'r6', sku: 'WHOL-006', name: 'Heineken', category: 'Retail', subcategory: 'Beer', price: 42.00, cost: 32.00, boxQty: 24, boxPrice: 936.00, boxCost: 744.00, startingStock: 240, unitsSold: 0, stock: 240, minThreshold: 48, unit: 'bottles', image: '🍺' },
];

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
  const deletedProducts = useMemo(() => products.filter((p: any) => p.archived && !p.purged), [products]); // the Bin (purged = gone for good)
  useEffect(() => { setMode(WS); }, [WS]);
  const [cart, setCart] = usePersistentState(`${workspace}:cart`, []);
  // Bottles of each product that were ALREADY taken out of stock when a tab was saved. They sit in the cart again while the tab is
  // being paid, so they must not be taken out a second time. { productId: bottles }
  const [cartCredit, setCartCredit] = usePersistentState(`${workspace}:cartCredit`, {});
  const [openTabs, setOpenTabs] = usePersistentCollection(`${workspace}:openTabs`, INITIAL_TABS, { newestFirst: true });
  const [searchQuery, setSearchQuery] = useState('');
  // Stock Tracking search: type part of a name, code or category (e.g. "castle", "mosi big", "whol"); all words must match.
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const stockSearchRef = useRef<HTMLInputElement>(null);
  const areaOf = (p: any) => (p.category === 'Retail' ? 'Wholesale' : p.category || '');
  const stockRows = useMemo(() => {
    const words = stockSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hay = (p: any) => `${p.name} ${p.sku} ${areaOf(p)} ${p.category || ''} ${p.subcategory || ''}`.toLowerCase();
    let list = scopedProducts.filter((p: any) => words.every(w => hay(p).includes(w)));
    if (stockFilter === 'out') list = list.filter((p: any) => p.stock <= 0);
    else if (stockFilter === 'low') list = list.filter((p: any) => p.stock > 0 && p.stock <= p.minThreshold);
    if (words.length) { const q = words.join(' '); list = [...list].sort((a: any, b: any) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))); } // names that START with what you typed come first
    return list;
  }, [scopedProducts, stockSearch, stockFilter]);
  const lowCount = scopedProducts.filter((p: any) => p.stock > 0 && p.stock <= p.minThreshold).length;
  const outCount = scopedProducts.filter((p: any) => p.stock <= 0).length;
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
  const [viewShift, setViewShift] = useState<any>(null); // the shift whose full record is open
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
  // Staff cash drawers: each staff member opens and counts their OWN drawer. Open ones stay on this device; closed ones are
  // append-only records (synced like sales) the owner reviews under Staff Drawers.
  const [drawers, setDrawers] = usePersistentCollection(`${workspace}:drawers`, [], { newestFirst: true });
  const [openDrawers, setOpenDrawers] = usePersistentState(`${workspace}:openDrawers`, {});
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

  // ---------- CUSTOMER CREDIT ----------
  // Credit customers + the owner's credit rules (synced through the settings table), and the money received later (append-only, synced).
  const [creditCustomers, setCreditCustomers] = usePersistentState(`${workspace}:creditCustomers`, []);
  const [creditPolicy, setCreditPolicy] = usePersistentState(`${workspace}:creditPolicy`, DEFAULT_POLICY);
  const [creditPayments, setCreditPayments] = usePersistentCollection(`${workspace}:creditPayments`, [], { newestFirst: true });
  // A cancelled payment is a 'void' row pointing at the original; both are dropped here so nothing downstream has to think about it.
  const liveCreditPayments = useMemo(() => {
    const gone = new Set<string>(creditPayments.filter((x: any) => x.kind === 'void').map((x: any) => x.voidOf));
    return creditPayments.filter((x: any) => x.kind === 'creditpay' && !gone.has(x.id));
  }, [creditPayments]);
  const creditLedger = useMemo(() => buildLedger(salesHistory, refunds, liveCreditPayments), [salesHistory, refunds, liveCreditPayments]);
  const [creditCustId, setCreditCustId] = useState('');
  const [creditDue, setCreditDue] = useState('');
  const [creditNote, setCreditNote] = useState('');
  // Money received from credit customers in THIS shift (cash joins the drawer, mobile/card are kept apart)
  const shiftCollected = useMemo(() => {
    const t: any = { cash: 0, mobile: 0, card: 0, total: 0, count: 0 };
    liveCreditPayments.filter((x: any) => x.shiftKey === shiftKey).forEach((x: any) => { t[x.method] = (t[x.method] || 0) + x.amount; t.total += x.amount; t.count += 1; });
    return t;
  }, [liveCreditPayments, shiftKey]);

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
  // Sidebar "24h": the last 24 hours, but never before the current shift began, so it goes back to zero when a shift is closed.
  const sidebar24h = useMemo(
    () => salesHistory.filter((s: any) => s.ts > Math.max(nowTs - DAY_MS, shiftStart)).reduce((a: number, s: any) => a + s.total, 0),
    [salesHistory, nowTs, shiftStart]
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
    credit: { customers: creditCustomers, setCustomers: setCreditCustomers, policy: creditPolicy, setPolicy: setCreditPolicy },
    collections: { sales: setSalesHistory, closed_shifts: setClosedShifts, stock_log: setStockLog, expenses: setExpenses, refunds: setRefunds, drawers: setDrawers, credit_payments: setCreditPayments },
    storeId, workspace,
  });
  const [showSync, setShowSync] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  // ---------- EXPENSES ----------
  // An expense belongs to the shift it was recorded in (key = device + shift opening time). A late expense entered
  // after close keeps the key of the shift that just closed, because shiftStart only changes when a new shift starts.
  const voidedIds = useMemo(() => new Set<string>(expenses.filter((e: any) => e.kind === 'void').map((e: any) => e.voidOf)), [expenses]);
  // Stock bought with drawer cash is stored beside the expenses (same table, kind 'stockbuy') but is NOT an expense: it only
  // becomes a cost when the stock is sold (cost of goods). So it stays out of liveExpenses (profit, End of Day net, Calendar)
  // while still counting as cash that left the drawer.
  const liveExpenses = useMemo(() => expenses.filter((e: any) => e.kind !== 'void' && e.kind !== 'stockbuy' && !voidedIds.has(e.id)), [expenses, voidedIds]);
  const liveStockBuys = useMemo(() => expenses.filter((e: any) => e.kind === 'stockbuy' && !voidedIds.has(e.id)), [expenses, voidedIds]);
  const expensesByShift = useMemo(() => {
    const m = new Map<string, { total: number; till: number; mobile: number; owner: number; stock?: number }>();
    liveExpenses.forEach((e: any) => {
      const t = m.get(e.shiftKey) || { total: 0, till: 0, mobile: 0, owner: 0 };
      t.total += e.amount;
      (t as any)[e.paidFrom] = ((t as any)[e.paidFrom] || 0) + e.amount;
      m.set(e.shiftKey, t);
    });
    // Stock bought with drawer cash: not in `total` (not a cost), but it IS cash out of the till, so it joins `till`.
    liveStockBuys.forEach((e: any) => {
      const t = m.get(e.shiftKey) || { total: 0, till: 0, mobile: 0, owner: 0 };
      t.stock = (t.stock || 0) + e.amount;
      if (e.paidFrom === 'till') t.till += e.amount;
      m.set(e.shiftKey, t);
    });
    return m;
  }, [liveExpenses, liveStockBuys]);
  const shiftExpenseList = useMemo(() => liveExpenses.filter((e: any) => e.shiftKey === shiftKey), [liveExpenses, shiftKey]);
  const shiftExpenseTotals = expensesByShift.get(shiftKey) || { total: 0, till: 0, mobile: 0, owner: 0 };
  const shiftCashSales = useMemo(() => shiftSales.filter((x: any) => x.method === 'cash').reduce((a: number, x: any) => a + x.total, 0) - shiftRefundTotals.cash, [shiftSales, shiftRefundTotals]);
  const cashFloatNum = parseFloat(cashFloat) || 0;
  const cashExpected = cashFloatNum + shiftCashSales + shiftCollected.cash - shiftExpenseTotals.till;
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
    let orders = 0, itemsSold = 0;
    const day = (k: string) => { if (!days.has(k)) days.set(k, { day: k, revenue: 0, cogs: 0, expenses: 0 }); return days.get(k); };
    salesHistory.filter((x: any) => x.ts >= from).forEach((x: any) => {
      const d = day(dk(x.ts));
      orders += 1;
      (x.items || []).forEach((i: any) => { itemsSold += i.qty || 0; });
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
    const shrink = closedShifts.filter((c: any) => c.openedAt >= from).reduce((a: number, c: any) => a + (c.shrinkageValue || 0), 0)
      + stockLog.filter((l: any) => l.type === 'adjust_out' && l.loss && l.ts >= from).reduce((a: number, l: any) => a + (l.qty || 0) * (l.cost || 0), 0); // recorded write-offs (spilled, expired...)
    const list = [...days.values()].map(d => ({ ...d, net: d.revenue - d.cogs - d.expenses })).sort((a, b) => b.day.localeCompare(a.day));
    const revenue = list.reduce((a, d) => a + d.revenue, 0);
    const cogs = list.reduce((a, d) => a + d.cogs, 0);
    const expensesTotal = list.reduce((a, d) => a + d.expenses, 0);
    return {
      orders, itemsSold, revenue, cogs, expenses: expensesTotal, shrink, net: revenue - cogs - expensesTotal - shrink,
      // oldest -> newest, for the line chart (last 60 days max so 'All' stays readable)
      series: [...list].reverse().slice(-60).map(d => ({ day: d.day.slice(5), revenue: Math.round(d.revenue * 100) / 100, expenses: Math.round(d.expenses * 100) / 100, net: Math.round(d.net * 100) / 100 })),
      days: list.slice(0, 14), byCat: [...catMap.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [profitPeriod, salesHistory, refunds, liveExpenses, closedShifts, products, stockLog]);

  const queueExpense = (entry: any) => {
    setExpenses((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'expenses', payload: { ...entry, storeId }, failed: false }]);
  };
  const handleAddExpense = (f: { amount: number; category: string; paidFrom: string; payee: string; note: string }) => {
    queueExpense({ id: newId(), kind: 'expense', ts: Date.now(), shiftKey, ...f, by: user.name, byId: user.id, afterClose: isEodLocked });
  };
  const handleVoidExpense = (e: any) => {
    if (!isOwner) return;
    if (!window.confirm(`Cancel this expense?\n\n${e.category}: ${money(e.amount)}\n\nIt will stay on record but will not count in the totals.`)) return;
    queueExpense({ id: newId(), kind: 'void', voidOf: e.id, ts: Date.now(), shiftKey: e.shiftKey, category: e.category, amount: e.amount, by: user.name });
  };

  // Cash taken out of a drawer to pay for stock. Recorded here so the drawer still balances; the owner then links the delivery to it.
  const handleStockBuy = (f: { amount: number; supplier: string; note: string }) => {
    queueExpense({ id: newId(), kind: 'stockbuy', category: 'Stock purchase', ts: Date.now(), shiftKey, amount: f.amount, paidFrom: 'till', payee: f.supplier, note: f.note, by: user.name, byId: user.id, afterClose: isEodLocked });
  };

  // ---------- STAFF DRAWERS ----------
  // The owner's own sales need no drawer; every staff member opens one before selling.
  const myOpenDrawer: OpenDrawer | null = !isOwner ? (openDrawers[user.id] || null) : null;
  const needsDrawer = !isOwner && !myOpenDrawer;
  const figuresFor = (d: OpenDrawer, to = Date.now()) =>
    drawerFigures({ staffId: d.staffId, staffName: d.staffName, from: d.openedAt, to, deviceId: d.deviceId, sales: salesHistory, refunds, liveExpenses: [...liveExpenses, ...liveStockBuys], payments: liveCreditPayments });
  const handleOpenDrawer = (float: number) => {
    if (isOwner) return;
    setOpenDrawers((prev: any) => ({ ...prev, [user.id]: { staffId: user.id, staffName: user.name, openedAt: Date.now(), float: round2(float), deviceId } }));
  };
  const handleCloseDrawer = (counted: number, d: OpenDrawer) => {
    const closedAt = Date.now();
    const f = figuresFor(d, closedAt);
    const expected = expectedCash(d.float, f);
    const rec = {
      id: newId(), ts: closedAt, staffId: d.staffId, staffName: d.staffName, openedAt: d.openedAt, closedAt, deviceId: d.deviceId,
      float: d.float, ...f, expected, counted: round2(counted), variance: round2(counted - expected),
      closedBy: d.staffId === user.id ? 'self' : user.name, // the owner can close a drawer for someone who left without counting
    };
    setDrawers((prev: any[]) => [rec, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: rec.id, table: 'drawers', payload: { ...rec, storeId }, failed: false }]);
    setOpenDrawers((prev: any) => { const n = { ...prev }; delete n[d.staffId]; return n; });
  };
  // ---------- CREDIT: customers, receiving payments ----------
  const handleSaveCreditCustomer = (c: CreditCustomer) => {
    if (!isOwner && !(creditPolicy as any).staffMayAdd && !creditCustomers.some((x: any) => x.id === c.id)) return; // staff may add only when the owner allows it
    if (!isOwner && creditCustomers.some((x: any) => x.id === c.id)) return;                                           // only the owner edits limits / blocks
    setCreditCustomers((prev: any[]) => (prev.some(x => x.id === c.id) ? prev.map(x => (x.id === c.id ? c : x)) : [...prev, c]));
  };
  const handleSaveCreditPolicy = (pol: any) => { if (isOwner) setCreditPolicy(pol); };
  const handleReceiveCredit = ({ customer, amount, method, note }: { customer: CreditCustomer; amount: number; method: string; note: string }): string => {
    const bal = balanceOf(creditLedger, customer.id);
    if (!(amount > 0) || amount > bal + 0.005) return `${customer.name} owes ${money(bal)}.`;
    if (!isOwner && method === 'cash' && !myOpenDrawer) return 'Open your drawer first (My Drawer). Cash you receive is counted in your drawer.';
    const entry = {
      id: newId(), kind: 'creditpay', ts: Date.now(), shiftKey, customerId: customer.id, customerName: customer.name,
      amount: round2(amount), method, note, by: user.name, byId: user.id, deviceId, deviceName,
    };
    setCreditPayments((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'credit_payments', payload: { ...entry, storeId }, failed: false }]);
    return '';
  };
  const handleVoidCreditPayment = (pm: any) => {
    if (!isOwner) return;
    const entry = { id: newId(), kind: 'void', voidOf: pm.id, ts: Date.now(), shiftKey, customerId: pm.customerId, customerName: pm.customerName, amount: pm.amount, method: pm.method, by: user.name, byId: user.id, deviceId };
    setCreditPayments((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'credit_payments', payload: { ...entry, storeId }, failed: false }]);
  };
  // credit given in this shift: all staff for the owner, only my own for staff
  const shiftCreditGiven = useMemo(
    () => creditGiven(shiftSales, (s: any) => isOwner || !s.cashierId || s.cashierId === user.id),
    [shiftSales, isOwner, user.id]
  );
  const myShiftCollected = useMemo(() => {
    if (isOwner) return shiftCollected;
    const t: any = { cash: 0, mobile: 0, card: 0, total: 0, count: 0 };
    liveCreditPayments.filter((x: any) => x.shiftKey === shiftKey && x.byId === user.id).forEach((x: any) => { t[x.method] = (t[x.method] || 0) + x.amount; t.total += x.amount; t.count += 1; });
    return t;
  }, [liveCreditPayments, shiftKey, isOwner, user.id, shiftCollected]);

  const drawerStaff = useMemo(() => (auth?.staff || []).map((x: any) => ({ id: x.id, name: x.name || x.email, role: x.role })), [auth?.staff]);
  const shiftDrawers = useMemo(() => drawers.filter((d: any) => d.closedAt >= shiftStart && (!d.deviceId || d.deviceId === deviceId)), [drawers, shiftStart, deviceId]);

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
    const text = buildReceiptText({ ...receiptForOutput(r), business, businessName: bizName || BRAND.product, product: BRAND.product, taxPct: Math.round(TAX_RATE * 100), money });
    window.open(whatsAppLink(digits, text), '_blank', 'noopener');
  };
  // Reprint of an old sale: the same receipt, clearly marked as a copy so it cannot pass for the original.
  const handleReprint = (sale: any) => {
    const t = new Date(sale.ts);
    setCurrentReceipt({
      ...sale,
      paymentMethod: sale.paymentMethod || sale.method || 'cash',
      grandTotal: sale.grandTotal ?? sale.total,
      date: sale.date || t.toLocaleDateString(),
      timestamp: sale.timestamp || sale.time || t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isReprint: true, reprintedAt: Date.now(), reprintedBy: user.name,
    } as any);
  };
  const receiptForOutput = (r: any) => r?.isReprint
    ? { ...r, txId: `${r.txId} (DUPLICATE COPY)`, footer: `DUPLICATE COPY - reprinted ${fmtDateTime(r.reprintedAt)} by ${r.reprintedBy}${business.footer ? ` · ${business.footer}` : ''}` }
    : { ...r, footer: business.footer };
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
  const [restockForm, setRestockForm] = useState({ qty: '', cost: '', by: 'bottle', buyId: '' }); // by: count what arrived in bottles or in boxes
  const [showStockHistory, setShowStockHistory] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({ dir: 'out', by: 'bottle', qty: '', reason: 'damaged', note: '' });
  const adjustQty = (p: any, f = adjustForm) => (parseInt(f.qty, 10) || 0) * (f.by === 'box' && hasBox(p) ? Number(p.boxQty) : 1); // always bottles

  // Owner: take stock off or put stock on outside a delivery (spillage, staff use, a counting mistake...). It is written to the stock history.
  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !adjustItem) return;
    const out = adjustForm.dir === 'out';
    const qty = adjustQty(adjustItem);
    if (qty <= 0) return;
    if (out && qty > adjustItem.stock) { alert(`There are only ${stockText(adjustItem)} in stock, so you cannot take off more than that.`); return; }
    const reason = (out ? ADJUST_OUT : ADJUST_IN).find(r => r.id === adjustForm.reason) || (out ? ADJUST_OUT : ADJUST_IN)[0];
    const sign = out ? -1 : 1;
    // Like a delivery, the opening stock moves too, so the change is not mistaken for missing/extra stock at End of Day.
    setProducts((prev: any[]) => prev.map(p => (p.id === adjustItem.id
      ? { ...p, stock: Math.max(0, p.stock + sign * qty), startingStock: Math.max(0, p.startingStock + sign * qty) } : p)));
    setPhysicalCounts((prev: any) => ({ ...prev, [adjustItem.id]: Math.max(0, (prev[adjustItem.id] ?? adjustItem.stock) + sign * qty) }));
    const entry = {
      id: newId(), type: out ? 'adjust_out' : 'adjust_in', ts: Date.now(), productId: adjustItem.id, name: adjustItem.name, qty, cost: adjustItem.cost || 0,
      reason: reason.label, loss: out && (reason as any).loss === true, note: adjustForm.note.trim(), by: user.name,
    };
    setStockLog((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'stock_log', payload: { ...entry, storeId }, failed: false }]);
    setAdjustItem(null);
    setAdjustForm({ dir: 'out', by: 'bottle', qty: '', reason: 'damaged', note: '' });
  };

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
    const entry = { id: newId(), type: 'restock', ts: Date.now(), productId: restockItem.id, name: restockItem.name, qty, cost: newCost, by: user.name, buyId: restockForm.buyId || null };
    setStockLog((prev: any[]) => [entry, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: entry.id, table: 'stock_log', payload: { ...entry, storeId }, failed: false }]); // syncs to Supabase
    setRestockItem(null);
    setRestockForm({ qty: '', cost: '', by: 'bottle', buyId: '' });
    setStockSearch(''); setStockFilter('all'); // ready to search the next item
    setTimeout(() => stockSearchRef.current?.focus(), 80);
  };

  // Staff can only use Terminal + Tabs
  useEffect(() => { if (!isOwner && !['pos', 'tabs', 'sales', 'reprint', 'inventory', 'expenses', 'drawer', 'credits', 'mysales', 'eod'].includes(activeTab)) setActiveTab('pos'); }, [isOwner, activeTab]);

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
  const creditOf = (id: string) => Number((cartCredit as any)[id]) || 0;
  // What the till can still sell of a product: stock minus everything already clicked into the current order.
  // (Stock already taken out for a tab being paid is added back, because those bottles are in the order too.)
  const inOrderOf = (id: string, list: any[] = cart) => list.filter((i: any) => i.id === id).reduce((a: number, i: any) => a + bottlesOf(i), 0);
  const availOf = (p: any) => Math.max(0, p.stock + creditOf(p.id) - inOrderOf(p.id));
  // Stock for the cap checks: real stock plus the bottles a tab already took out.
  const stockOf = (id: string) => { const st = products.find((p: any) => p.id === id)?.stock; return st === undefined ? undefined : st + creditOf(id); };
  // Take a cart out of stock. Bottles already taken out for a tab (credit) are not taken twice; a smaller order gives the rest back.
  const applyCartToStock = (items: any[]) => {
    setProducts((prevProducts: any[]) => prevProducts.map((prod: any) => {
      const bottles = inOrderOf(prod.id, items), credit = creditOf(prod.id);
      if (!bottles && !credit) return prod;
      const net = bottles - credit; // can be negative: the order shrank after the tab was saved
      return { ...prod, stock: Math.max(0, prod.stock - net), unitsSold: Math.max(0, (prod.unitsSold || 0) + net) };
    }));
    const counts: Record<string, number> = {};
    products.forEach((prod: any) => {
      const bottles = inOrderOf(prod.id, items), credit = creditOf(prod.id);
      if (bottles || credit) counts[prod.id] = Math.max(0, prod.stock - (bottles - credit));
    });
    setPhysicalCounts((prev: any) => ({ ...prev, ...counts }));
    setCartCredit({});
  };

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
    const cap = capQty(list, probe, product.stock + creditOf(product.id));
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
    const left = availOf(product); // what is still free after what is already in the order
    const room = capQty(cart, { id: product.id, cartId: '', size }, product.stock + creditOf(product.id));
    if (left <= 0) {
      alert(`Warning: ${product.name} is finished (out of stock)!`);
      return;
    }
    if (room < 1) {
      alert(size > 1
        ? `Not enough ${product.name} left for another ${def.label.toLowerCase()}. Only ${left} ${product.unit} left.`
        : `No more ${product.name} left to add (${left} ${product.unit} left).`);
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

    // Credit: the customer must be on the approved list and inside their limit. Staff are stopped; the owner may override.
    let creditInfo: any = null;
    if (paymentMethod === 'credit') {
      const cust: any = creditCustomers.find((c: any) => c.id === creditCustId);
      const chk = checkGive(cust, balanceOf(creditLedger, creditCustId), grandTotal);
      if (!cust) { alert('Choose the customer who is taking credit.'); return; }
      if (!chk.ok) {
        if (!isOwner) { alert(chk.reason); return; }
        if (!window.confirm(`${chk.reason}\n\nSell on credit anyway (as the owner)?`)) return;
      }
      creditInfo = { customerId: cust.id, customerName: cust.name, phone: cust.phone || '', dueDate: creditDue || null, note: creditNote.trim(), limitAtSale: cust.limit ?? null };
    }

    // Take the order out of stock (bottles a saved tab already took out are not taken again)
    applyCartToStock(cart);

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
      customer: creditInfo ? creditInfo.customerName : (customerName || 'Walk-In Guest'),
      ...(creditInfo ? { credit: creditInfo } : {}),
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
    if (creditInfo) { setCreditCustId(''); setCreditDue(''); setCreditNote(''); setPaymentMethod('cash'); } // never leave Credit selected for the next sale by accident
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
      '', `It goes to the Bin. You can bring it back from there for ${BIN_DAYS} days, then it is deleted for good.`,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
    if (!window.confirm(lines.join('\n'))) return;
    setCart((prev: any[]) => prev.filter(i => i.id !== p.id));
    setProducts((prev: any[]) => prev.map(x => (x.id === p.id ? { ...x, archived: true, archivedAt: Date.now(), archivedBy: user.name } : x)));
  };
  const handleRestoreItem = (p: any) => {
    if (!isOwner || p.purged) return;
    setProducts((prev: any[]) => prev.map(x => {
      if (x.id !== p.id) return x;
      const { archived, archivedAt, archivedBy, ...rest } = x;
      return rest;
    }));
  };
  // Removing for good. The row itself must stay (old sales, refunds and the cloud sync still point at it, and a hard-deleted row
  // would be brought back by another device), so it becomes an empty tombstone: it leaves the Bin, can no longer be restored,
  // frees its item code and drops its photo. Stock numbers are left alone so no stock movement is created.
  const purgeProduct = (x: any) => { const { photo: _photo, ...rest } = x; return { ...rest, purged: true, purgedAt: Date.now() }; };
  const handleDeleteForever = (p: any) => {
    if (!isOwner) return;
    if (!window.confirm(`Delete \"${p.name}\" for good now? It cannot be brought back.`)) return;
    setProducts((prev: any[]) => prev.map(x => (x.id === p.id && x.archived ? purgeProduct(x) : x)));
  };
  // Automatic: anything that has been in the Bin for BIN_DAYS days is removed for good (checked every 30 seconds while the app is open).
  useEffect(() => {
    const due = (x: any) => x.archived && !x.purged && x.archivedAt && x.archivedAt <= Date.now() - BIN_DAYS * DAY_MS;
    if (!products.some(due)) return;
    setProducts((prev: any[]) => prev.map(x => (due(x) ? purgeProduct(x) : x)));
  }, [products, nowTs]);

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
      const clash = products.find((p: any) => !p.purged && String(p.sku).toLowerCase() === sku);
      if (clash) {
        alert(clash.archived
          ? `The item code "${newItem.sku}" belongs to an item in the Bin (${clash.name}). Restore it from the Bin instead of adding it again.`
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

  // The complete record of one shift (closed, or the one still open), worked out from that same shift's own sales, refunds and expenses.
  const shiftReport = (sh: any) => {
    const dev = sh.deviceId || deviceId;
    const from = sh.openedAt, to = sh.closedAt ?? Date.now();
    const key = `${dev}:${sh.openedAt}`;
    const costOf = new Map<string, number>(products.map((p: any) => [p.id, p.cost || 0]));
    const sales = salesHistory.filter((x: any) => x.ts >= from && x.ts <= to && (!x.deviceId || x.deviceId === dev)).sort((a: any, b: any) => a.ts - b.ts);
    const refs = refunds.filter((x: any) => x.shiftKey === key).sort((a: any, b: any) => a.ts - b.ts);
    const exps = liveExpenses.filter((x: any) => x.shiftKey === key).sort((a: any, b: any) => a.ts - b.ts);
    const buys = liveStockBuys.filter((x: any) => x.shiftKey === key).sort((a: any, b: any) => a.ts - b.ts);
    const methodOf = (x: any) => x.method || x.paymentMethod || 'cash';

    const grossSold = sales.reduce((a: number, x: any) => a + (x.total || 0), 0);
    const refundTotal = refs.reduce((a: number, x: any) => a + (x.amount || 0), 0);
    const byMethod: Record<string, number> = { cash: 0, mobile: 0, card: 0, credit: 0 };
    sales.forEach((x: any) => { byMethod[methodOf(x)] = (byMethod[methodOf(x)] || 0) + (x.total || 0); });
    refs.forEach((x: any) => { byMethod[x.method] = (byMethod[x.method] || 0) - (x.amount || 0); });
    // money received from credit customers in this shift (cash joins the drawer)
    const pays = liveCreditPayments.filter((x: any) => x.shiftKey === key).sort((a: any, b: any) => a.ts - b.ts);
    const collected: any = { cash: 0, mobile: 0, card: 0, total: 0, count: pays.length };
    pays.forEach((x: any) => { collected[x.method] = (collected[x.method] || 0) + (x.amount || 0); collected.total += x.amount || 0; });
    const creditSalesN = sales.filter((x: any) => methodOf(x) === 'credit');

    // cost of goods: what was sold, minus the cost of refunded items that went back on the shelf
    let cogs = 0;
    sales.forEach((x: any) => (x.items || []).forEach((i: any) => { cogs += (i.qty || 0) * (i.cost ?? costOf.get(i.productId) ?? 0); }));
    refs.forEach((x: any) => (x.lines || []).filter((l: any) => l.restock).forEach((l: any) => { cogs -= (l.qty || 0) * (l.cost ?? costOf.get(l.productId) ?? 0); }));

    const itemMap = new Map<string, any>();
    sales.forEach((x: any) => (x.items || []).forEach((i: any) => {
      const label = [i.name, i.variant, i.pack && i.pack !== 'single' ? (i.packUnit || i.pack) : null].filter(Boolean).join(' · ');
      const k = `${i.productId}|${i.variant || ''}|${i.pack || 'single'}`;
      const r = itemMap.get(k) || { name: label, qty: 0, bottles: 0, revenue: 0, cost: 0 };
      r.qty += i.qty || 0; r.bottles += (i.qty || 0) * (i.size || 1); r.revenue += (i.price || 0) * (i.qty || 0);
      r.cost += (i.qty || 0) * (i.cost ?? costOf.get(i.productId) ?? 0);
      itemMap.set(k, r);
    }));
    const staffMap = new Map<string, any>();
    sales.forEach((x: any) => {
      const k = x.cashierId || x.cashier || '?';
      const r = staffMap.get(k) || { name: x.cashier || 'Unknown', count: 0, total: 0, cash: 0, mobile: 0, card: 0, credit: 0, creditCount: 0 };
      r.count += 1; r.total += x.total || 0; r[methodOf(x)] = (r[methodOf(x)] || 0) + (x.total || 0);
      if (methodOf(x) === 'credit') r.creditCount += 1;
      staffMap.set(k, r);
    });
    const expenseTotal = exps.reduce((a: number, x: any) => a + (x.amount || 0), 0);
    const tillOut = exps.filter((x: any) => x.paidFrom === 'till').reduce((a: number, x: any) => a + (x.amount || 0), 0)
      + buys.reduce((a: number, x: any) => a + (x.amount || 0), 0);
    const cashSales = (byMethod.cash || 0);
    const closed = sh.closedAt != null;
    const float = closed ? (sh.cashFloat || 0) : cashFloatNum;
    const expected = closed ? (sh.cashExpected ?? float + cashSales + collected.cash - tillOut) : cashExpected;
    const counted = closed ? (sh.cashCounted ?? null) : cashCountedNum;
    const writeOffs = stockLog.filter((l: any) => l.type === 'adjust_out' && l.loss && l.ts >= from && l.ts <= to); // spilled, expired, staff use... recorded by the owner
    const shrinkValue = r2n((closed ? (sh.shrinkageValue || 0) : eodMetrics.totalShrinkageValue) + writeOffs.reduce((a: number, l: any) => a + (l.qty || 0) * (l.cost || 0), 0));
    const shrinkUnits = (closed ? (sh.shrinkageUnits || 0) : eodMetrics.totalShrinkageUnits) + writeOffs.reduce((a: number, l: any) => a + (l.qty || 0), 0);
    const netSales = grossSold - refundTotal;
    const grossProfit = netSales - cogs;
    const drawerRows = drawers.filter((d: any) => d.openedAt >= from && d.openedAt <= to && (!d.deviceId || d.deviceId === dev))
      .map((d: any) => ({ staffName: d.staffName, float: d.float || 0, salesCount: d.salesCount || 0, cashSales: d.cashSales || 0, mobileSales: d.mobileSales, creditCount: d.creditCount, creditTotal: d.creditTotal, collectedCash: d.collectedCash || 0, expected: d.expected || 0, counted: d.counted || 0, variance: d.variance || 0 }));
    return {
      openedAt: from, closedAt: closed ? sh.closedAt : null, closedBy: sh.closedBy || null, deviceName: sh.deviceName || null,
      salesCount: sales.length, grossSold: r2n(grossSold), refundTotal: r2n(refundTotal), refundCount: refs.length, netSales: r2n(netSales),
      byMethod: { cash: r2n(byMethod.cash || 0), mobile: r2n(byMethod.mobile || 0), card: r2n(byMethod.card || 0), credit: r2n(byMethod.credit || 0) },
      credit: { count: creditSalesN.length, total: r2n(creditSalesN.reduce((a: number, x: any) => a + (x.total || 0), 0)), collected: { cash: r2n(collected.cash), mobile: r2n(collected.mobile), card: r2n(collected.card), total: r2n(collected.total), count: collected.count }, payments: pays },
      cogs: r2n(cogs), grossProfit: r2n(grossProfit), expenseTotal: r2n(expenseTotal), shrinkValue, shrinkUnits,
      netProfit: r2n(grossProfit - expenseTotal - shrinkValue),
      cash: { float, sales: r2n(cashSales), collected: r2n(collected.cash), tillOut: r2n(tillOut), expected, counted, variance: counted == null ? null : r2n(counted - expected) },
      expenses: exps.map((x: any) => ({ ...x, paidFromLabel: PAID_FROM.find((f: any) => f.id === x.paidFrom)?.label || x.paidFrom || '' })),
      stockBuys: buys,
      items: [...itemMap.values()].sort((a, b) => b.revenue - a.revenue),
      staff: [...staffMap.values()].sort((a, b) => b.total - a.total),
      refundRows: refs.map((x: any) => ({ ...x })),
      drawers: drawerRows,
      sales,
      stock: sh.stock || (closed ? null : scopedProducts.map((p: any) => ({ name: p.name, start: p.startingStock, sold: p.unitsSold, expected: p.stock, actual: physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock }))),
      tabsOpen: sh.tabsOpen || null,
    };
  };
  // profit per closed shift, for the list (worked out once, not on every keystroke)
  const closedShiftProfit = useMemo(() => {
    const m = new Map<string, any>();
    closedShifts.forEach((c: any) => { const r = shiftReport(c); m.set(c.id, { cogs: r.cogs, net: r.netProfit, expenses: r.expenseTotal, gross: r.grossProfit, report: r }); });
    return m;
  }, [closedShifts, salesHistory, refunds, liveExpenses, liveStockBuys, products, stockLog, liveCreditPayments]);

  // End of Day: close the shift, record the totals, lock the register
  const handleCloseShift = () => {
    if (isOwner) return; // counting and closing is done from the staff login; the owner only reviews
    if (myOpenDrawer) { alert('Hand in your cash drawer first (My Drawer), then close the shift.'); return; }
    // Stock is counted AUTOMATICALLY from the system on close (opening stock - units sold + restocks). Nothing has to be typed.
    // If a staff member typed a different number for an item in Count & Close Shift, that number is used for that item.
    const warn = openTabs.length > 0 ? `\n\n${openTabs.length} tab(s) are still open and will stay open for the next shift.` : '';
    const noCount = ''; // each staff member's cash is counted in My Drawer
    const stillOpen = Object.values(openDrawers).map((d: any) => d.staffName);
    const drw = stillOpen.length ? `\n\nStaff drawers still open: ${stillOpen.join(', ')}. Ask them to count and hand in their cash.` : '';
    const exp = `\n\nExpenses saved this shift: ${money(shiftExpenseTotals.total)} (${shiftExpenseList.length} entr${shiftExpenseList.length === 1 ? 'y' : 'ies'}).\nDid you add ALL of tonight's expenses?${noCount}${drw}`;
    if (!window.confirm(`Close the shift now? Sales will be added up and the till will be locked.${exp}${warn}`)) return;
    const byMethod: Record<string, number> = { cash: 0, mobile: 0, card: 0, credit: 0 };
    shiftSales.forEach((s: any) => { byMethod[s.method] = (byMethod[s.method] || 0) + s.total; });
    ['cash', 'mobile', 'card', 'credit'].forEach(k => { byMethod[k] -= shiftRefundTotals[k] || 0; });
    const shift = {
      id: newId(),
      openedAt: shiftStart,
      closedAt: Date.now(),
      total: totalSalesVolume,
      count: shiftSales.length,
      cash: byMethod.cash, mobile: byMethod.mobile, card: byMethod.card, credit: byMethod.credit,
      creditCount: shiftSales.filter((s: any) => s.method === 'credit').length,
      collectedCash: shiftCollected.cash, collectedMobile: shiftCollected.mobile, collectedCard: shiftCollected.card, // debts paid by credit customers during this shift
      barSales: shiftSales.reduce((a: number, s: any) => a + (s.barSales || 0), 0) - shiftRefundTotals.bar,
      retailSales: shiftSales.reduce((a: number, s: any) => a + (s.retailSales || 0), 0) - shiftRefundTotals.retail,
      refundTotal: shiftRefundTotals.total, refundCount: shiftRefundTotals.count,
      shrinkageUnits: eodMetrics.totalShrinkageUnits,
      shrinkageValue: eodMetrics.totalShrinkageValue,
      cashFloat: cashFloatNum, cashExpected, cashCounted: cashCountedNum, cashVariance, // null when no count was entered
      // saved so the shift can be checked later exactly as it was at close
      stock: scopedProducts.map((p: any) => ({ name: p.name, sku: p.sku, start: p.startingStock, sold: p.unitsSold, expected: p.stock, actual: physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.stock })),
      tabsOpen: { count: openTabs.length, total: r2n(openTabs.reduce((a: number, t: any) => a + (t.balance || 0), 0)) },
      closedBy: user.name,
      deviceId,
      deviceName,
      scope,
    };
    setClosedShifts((prev: any[]) => [shift, ...prev]);
    setOutbox((prev: any[]) => [...prev, { id: shift.id, table: 'closed_shifts', payload: { ...shift, storeId }, failed: false }]);
    // The closed shift is saved above. Roll straight into a NEW shift that starts from zero:
    // counted stock becomes the opening stock, sales / money / counts for the new day start empty until the next close.
    handleReopenShift();
    alert('Shift closed and saved. A new shift has started from zero.');
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
              { id: 'reprint', label: 'Reprint Receipt', icon: Printer, owner: false },
              { id: 'inventory', label: 'Stock Tracking', icon: Package, owner: false },
              { id: 'expenses', label: 'Expenses', icon: Wallet, owner: false },
              { id: 'drawer', label: isOwner ? 'Staff Drawers' : 'My Drawer', icon: Banknote, owner: false },
              { id: 'credits', label: 'Credits', icon: HandCoins, owner: false },
              { id: 'eod', label: isOwner ? 'End of Day (EOD)' : 'Count & Close Shift', icon: ClipboardList, owner: false },
              { id: 'mysales', label: 'My Sales & Calendar', icon: CalendarDays, owner: false, staffOnly: true },
              { id: 'calendar', label: 'Calendar', icon: CalendarDays, owner: true },
              { id: 'analytics', label: 'Analytics & COGS', icon: BarChart3, owner: true },
            ].filter((i: any) => (!i.owner || isOwner) && (!i.staffOnly || !isOwner)).map((item: any) => (
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
                {item.id === 'drawer' && needsDrawer && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white">{isWide ? 'Open it' : '!'}</span>
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
              {isOwner && <p className="text-amber-400 font-mono" title="Last 24 hours. Starts again from zero when a shift is closed.">24h: {money(sidebar24h)}</p>}
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
              
              {needsDrawer && (
                <button onClick={() => setActiveTab('drawer')} className="mb-4 w-full text-left px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> Open your drawer before you take payment. Tap here.
                </button>
              )}

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
                {filteredProducts.map(product => {
                  // Live count: what is still free after what staff already clicked into the order
                  const left = availOf(product);
                  const isLowStock = left <= product.minThreshold && left > 0;
                  const isOutOfStock = left <= 0;

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
                            {isOutOfStock ? 'Out of Stock' : `${stockText({ ...product, stock: left })} left`}
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
                                disabled={left < d.size}
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
                    onClick={() => { setCart([]); setCartCredit({}); }}
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
                    onClick={() => (needsDrawer ? setActiveTab('drawer') : setIsCheckoutOpen(true))}
                    title={needsDrawer ? 'Open your drawer first' : undefined}
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
                          // Tabs saved by this version already left stock; older tabs still come out of stock when paid.
                          const credit: Record<string, number> = {};
                          if (tab.stockDeducted) tab.items.forEach((ti: any) => {
                            const pid = (products.find((p: any) => p.id === ti.productId) || products.find((p: any) => p.name === ti.name))?.id;
                            if (pid) credit[pid] = (credit[pid] || 0) + (Number(ti.qty) || 0) * (Number(ti.size) || 1);
                          });
                          setCartCredit(credit);
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

              {/* Search: find an item fast, then tap Restock */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="h-5 w-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={stockSearchRef}
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setStockSearch('');
                      if (e.key === 'Enter' && isOwner && stockRows.length === 1) { e.preventDefault(); const p = stockRows[0]; setRestockItem(p); setRestockForm({ qty: '', cost: '', by: hasBox(p) ? 'box' : 'bottle', buyId: '' }); }
                    }}
                    placeholder={isOwner ? 'Search an item to restock: name, code or Bar / Wholesale' : 'Search an item: name or code'}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl pl-12 pr-12 py-3.5 text-base text-slate-100 placeholder:text-slate-500 outline-none"
                  />
                  {stockSearch && (
                    <button onClick={() => { setStockSearch(''); stockSearchRef.current?.focus(); }} title="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"><X className="h-4 w-4" /></button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {([['all', `All (${scopedProducts.length})`], ['low', `Running low (${lowCount})`], ['out', `Out of stock (${outCount})`]] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setStockFilter(id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${stockFilter === id ? (id === 'out' ? 'bg-rose-500 text-white border-rose-500' : 'bg-amber-500 text-slate-950 border-amber-500') : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                  {(stockSearch || stockFilter !== 'all') && <span className="text-xs text-slate-500 ml-1">{stockRows.length} found{isOwner && stockRows.length === 1 ? ' · press Enter to restock' : ''}</span>}
                </div>
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
                    {stockRows.length === 0 && (
                      <tr><td colSpan={isOwner ? 8 : 5} className="px-6 py-10 text-center text-slate-500">No item found{stockSearch ? <> for <b className="text-slate-300">“{stockSearch}”</b></> : ''}. Check the spelling or clear the search.</td></tr>
                    )}
                    {stockRows.map(product => {
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
                              <p className="text-xs text-slate-500 font-mono">{product.sku}<span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold font-sans ${product.category === 'Retail' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>{areaOf(product)}</span></p>
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
                              onClick={() => { setRestockItem(product); setRestockForm({ qty: '', cost: '', by: hasBox(product) ? 'box' : 'bottle', buyId: '' }); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${isOut || isLow ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                            >
                              + Restock
                            </button>
                            <button
                              onClick={() => { setAdjustItem(product); setAdjustForm({ dir: 'out', by: 'bottle', qty: '', reason: 'damaged', note: '' }); }}
                              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-slate-800 text-slate-200 hover:bg-slate-700"
                            >
                              ± Adjust
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
                    <span className="font-bold text-slate-200 text-sm flex items-center gap-2"><Trash2 className="h-4 w-4 text-slate-400" /> Bin ({deletedProducts.length})</span>
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
                              {p.archivedAt && (() => { const left = Math.max(0, Math.ceil((p.archivedAt + BIN_DAYS * DAY_MS - nowTs) / DAY_MS)); return <p className={`text-[11px] font-bold ${left <= 1 ? 'text-rose-400' : 'text-amber-400'}`}>{left <= 0 ? 'Deleted for good soon' : `Deleted for good in ${left} day${left === 1 ? '' : 's'}`}</p>; })()}
                            </div>
                          </div>
                          <div className="shrink-0 flex gap-2">
                            <button onClick={() => handleDeleteForever(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-rose-300 hover:bg-rose-500 hover:text-white border border-slate-700">Delete now</button>
                            <button onClick={() => handleRestoreItem(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400">Restore</button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-slate-500">Deleted items stay in the Bin for {BIN_DAYS} days, then are deleted for good automatically. Restoring brings the item back with the same stock it had when it was deleted. Count it again at End of Day if needed.</p>
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
                  <p className="text-sm text-slate-400">{isOwner ? 'Staff count the stock and close the shift. You can only look at it here.' : 'Count every item on the shelf, type what you counted, then close the shift.'}</p>
                </div>

                <div className="flex items-center gap-3">
                  {isOwner && (<>
                  <button
                    onClick={() => setEodSummaryModal(true)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-700"
                  >
                    <FileText className="h-4 w-4" /> See Full End of Day Report
                  </button>
                  <button
                    onClick={() => setViewShift({ id: 'open', openedAt: shiftStart, closedAt: null, deviceId, deviceName })}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-700"
                  >
                    <ClipboardList className="h-4 w-4" /> Shift record so far
                  </button>

                  </>)}
                  {!isOwner && (
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
                  )}
                </div>
              </div>

              {!isOwner && (
                <div className={`rounded-2xl border p-4 text-sm flex items-center gap-2 ${isEodLocked ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                  {isEodLocked
                    ? <><CheckCircle className="h-4 w-4 shrink-0" /> The shift is closed and your count is saved. Tap <b>Start New Shift</b> when the next shift begins.</>
                    : <><ClipboardList className="h-4 w-4 shrink-0 text-amber-400" /> Stock is <b>counted automatically</b> ({scopedProducts.length} items). Hand in your cash in <b>My Drawer</b>, then tap <b>Close Shift</b>.</>}
                </div>
              )}
              {isOwner && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                  View only. Last shift closed by <b className="text-slate-100">{closedShifts[0]?.closedBy || 'nobody yet'}</b>{closedShifts[0]?.closedAt ? <> on {fmtDateTime(closedShifts[0].closedAt)}</> : null}. Open <b>Staff Drawers</b> to see each person's cash count.
                </div>
              )}

              {isOwner && (<>
              {/* The shift's money in short, plain words */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-lg font-extrabold text-slate-100">{isEodLocked ? 'Money of the shift you closed' : 'Money of this shift so far'}</h3>
                <MoneySimple r={shiftReport({ id: 'open', openedAt: shiftStart, closedAt: null, deviceId, deviceName })} money={money} />
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
                {(shiftDrawers.length > 0 || Object.keys(openDrawers).length > 0) && (
                  <div className="border-t border-slate-800 pt-4 space-y-2">
                    <p className="text-xs font-bold uppercase text-slate-500">Staff drawers this shift</p>
                    {shiftDrawers.map((d: any) => (
                      <div key={d.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-200 text-sm">{d.staffName}</p>
                          <p className="text-slate-500">Should have {money(d.expected)} · counted {money(d.counted)}</p>
                        </div>
                        <VerdictBadge verdict={verdictOf(d.variance)} variance={d.variance} money={money} />
                      </div>
                    ))}
                    {Object.values(openDrawers).map((d: any) => (
                      <p key={d.staffId} className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {d.staffName}'s drawer is still open.</p>
                    ))}
                  </div>
                )}
                {!isEodLocked && shiftExpenseList.length === 0 && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> No expenses recorded this shift. If money went out (ice, transport, wages), add it before closing.</p>
                )}
              </div>

              </>)}

              {/* Physical Audit Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="font-bold text-slate-200 text-sm">Count Your Stock</h3>
                  <span className="text-xs text-slate-400">{isOwner ? 'Counted automatically from stock when staff close the shift' : 'Counted automatically from stock. Only change a number if the shelf is different.'}</span>
                </div>

                <div className="overflow-x-auto">
                <table style={{ minWidth: isOwner ? 760 : 0 }} className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3.5">Product</th>
                      {isOwner && <th className="px-6 py-3.5">Stock at Start</th>}
                      {isOwner && <th className="px-6 py-3.5">Should Be Left</th>}
                      <th className="px-6 py-3.5">{isOwner ? 'Counted' : 'Stock Counted'}</th>
                      {isOwner && <th className="px-6 py-3.5">Difference</th>}
                      {isOwner && <th className="px-6 py-3.5 text-right">Money Lost or Gained</th>}
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
                          {isOwner && <td className="px-6 py-4 font-mono">{p.startingStock}</td>}
                          {isOwner && <td className="px-6 py-4 font-mono font-bold text-amber-400">{p.stock}</td>}
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              disabled={isEodLocked || isOwner}
                              value={actualCount}
                              onChange={(e) => handlePhysicalCountChange(p.id, e.target.value)}
                              className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            />
                          </td>
                          {isOwner && <td className="px-6 py-4 font-mono font-bold">
                            {variance === 0 ? (
                              <span className="text-slate-500">0 (Correct)</span>
                            ) : variance < 0 ? (
                              <span className="text-rose-400">{variance} (Missing)</span>
                            ) : (
                              <span className="text-emerald-400">+{variance} (Extra)</span>
                            )}
                          </td>}
                          {isOwner && <td className="px-6 py-4 text-right font-mono font-bold">
                            {costImpact < 0 ? (
                              <span className="text-rose-400">-{money(Math.abs(costImpact))}</span>
                            ) : costImpact > 0 ? (
                              <span className="text-emerald-400">+{money(costImpact)}</span>
                            ) : (
                              <span className="text-slate-500">{money(0)}</span>
                            )}
                          </td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {isOwner && (<>
              {/* Closed shift history */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="font-bold text-slate-100 mb-1">Closed Shifts</h3>
                <p className="text-xs text-slate-500 mb-3">Each closed shift shows the money in simple words. Newest is first.</p>
                {closedShifts.length === 0 ? (
                  <p className="text-xs text-slate-500">No shifts closed yet. Close the shift at the end of the night to record it here.</p>
                ) : (
                  <div className="space-y-2">
                    {closedShifts.map((c: any) => {
                      const pr = closedShiftProfit.get(c.id);
                      return pr?.report
                        ? <ShiftMoneyCard key={c.id} r={pr.report} money={money} onOpen={() => setViewShift(c)} />
                        : null;
                    })}
                  </div>
                )}
              </div>
              </>)}
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

        {/* VIEW: REPRINT A LOST RECEIPT */}
        {activeTab === 'reprint' && (
          <ReprintView sales={salesHistory} isOwner={isOwner} user={user} money={money} fmtDateTime={fmtDateTime} onReprint={handleReprint} />
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

        {/* VIEW: STAFF DRAWERS (staff: my drawer / owner: every staff member) */}
        {activeTab === 'drawer' && (
          <DrawersView
            isOwner={isOwner} user={user} staffList={drawerStaff} openDrawers={openDrawers} drawers={drawers} sales={salesHistory} refunds={refunds} creditPayments={liveCreditPayments} creditOwed={[...creditLedger.values()].reduce((a: number, l: any) => a + l.balance, 0)}
            myOpen={myOpenDrawer} figuresFor={figuresFor} canOpen
            stockBuys={liveStockBuys} stockLog={stockLog} onStockBuy={handleStockBuy} onVoid={handleVoidExpense}
            onOpen={handleOpenDrawer} onClose={handleCloseDrawer}
            money={money} fmtDateTime={fmtDateTime} currency={CURRENCY}
          />
        )}

        {/* VIEW: CREDITS (customers who pay later) */}
        {activeTab === 'credits' && (
          <CreditsView
            isOwner={isOwner} user={user} customers={creditCustomers} policy={creditPolicy as any} ledger={creditLedger} payments={liveCreditPayments}
            given={shiftCreditGiven} collected={myShiftCollected} canTakeCash={isOwner || !!myOpenDrawer}
            onSaveCustomer={handleSaveCreditCustomer} onSavePolicy={handleSaveCreditPolicy} onReceive={handleReceiveCredit} onVoid={handleVoidCreditPayment}
            money={money} fmtDateTime={fmtDateTime} currency={CURRENCY} newId={newId}
          />
        )}

        {/* VIEW: MY SALES + CALENDAR (staff: only what they sold) */}
        {activeTab === 'mysales' && !isOwner && (
          <MySalesView sales={salesHistory} user={user} refundsBySale={refundsBySale} money={money} fmtDateTime={fmtDateTime} currency={CURRENCY} />
        )}

        {/* VIEW: CALENDAR OF EOD RESULTS (owner) */}
        {activeTab === 'calendar' && isOwner && (
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

              {/* Period KPI cards (follow the Today / 7 days / 30 days / All buttons) */}
              <div style={cardGrid(200, 16)}>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Total Orders</span>
                  <p className="text-3xl font-extrabold text-slate-100 font-mono mt-2">{profit.orders.toLocaleString()}</p>
                  <span className="text-xs text-slate-400 mt-2 block">{{ today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' }[profitPeriod as string]}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Total Items Sold</span>
                  <p className="text-3xl font-extrabold text-slate-100 font-mono mt-2">{profit.itemsSold.toLocaleString()}</p>
                  <span className="text-xs text-slate-400 mt-2 block">Bottles, drinks and other items</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-500 uppercase font-bold">Profit</span>
                  <p className={`text-3xl font-extrabold font-mono mt-2 ${profit.net < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{money(profit.net)}</p>
                  <span className="text-xs text-slate-400 mt-2 block">
                    {profit.revenue > 0 ? `${((profit.net / profit.revenue) * 100).toFixed(1)}% of sales` : 'No sales in this period'}
                  </span>
                </div>
              </div>

              {/* Sales Summary line chart: how the business is going over time */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-100">Sales Summary</h3>
                    <p className="text-xs text-slate-500">Sales, expenses and profit day by day. Profit below zero means the day lost money.</p>
                  </div>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {[['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']].map(([id, label]) => (
                      <button key={id} onClick={() => setProfitPeriod(id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${profitPeriod === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                {profit.series.length === 0 ? (
                  <p className="text-xs text-slate-500 py-10 text-center">No sales or expenses in this period.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={profit.series} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} width={52} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} formatter={(v: any) => money(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="revenue" name="Sales" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#fb7185" strokeWidth={2} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="net" name="Profit" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
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
            {stockLog.filter((l: any) => l.productId === restockItem.id && l.type === 'restock').length > 0 && (
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p className="font-bold uppercase">Recent deliveries</p>
                {stockLog.filter((l: any) => l.productId === restockItem.id && l.type === 'restock').slice(0, 3).map((l: any) => (
                  <p key={l.id}>{fmtDateTime(l.ts)} · +{l.qty} · {money(l.cost)} each · {l.by}</p>
                ))}
              </div>
            )}
            {liveStockBuys.filter((b: any) => b.paidFrom === 'till' && b.ts > Date.now() - 14 * DAY_MS).length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-400">Paid with drawer cash? (optional)</label>
                <select value={restockForm.buyId} onChange={e => setRestockForm({ ...restockForm, buyId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                  <option value="">No, paid another way</option>
                  {liveStockBuys.filter((b: any) => b.paidFrom === 'till' && b.ts > Date.now() - 14 * DAY_MS).map((b: any) => (
                    <option key={b.id} value={b.id}>{money(b.amount)} · {b.by} · {fmtDateTime(b.ts)}{b.payee ? ` · ${b.payee}` : ''}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">Links this delivery to the cash a staff member took from their drawer to buy it. The owner can then see where that money went.</p>
              </div>
            )}
            <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl">Add to stock</button>
          </form>
        </div>
      )}

      {adjustItem && isOwner && (() => {
        const out = adjustForm.dir === 'out';
        const qty = adjustQty(adjustItem);
        const reasons: any[] = out ? ADJUST_OUT : ADJUST_IN;
        const picked = reasons.find(r => r.id === adjustForm.reason) || reasons[0];
        const recent = stockLog.filter((l: any) => l.productId === adjustItem.id && (l.type === 'adjust_in' || l.type === 'adjust_out')).slice(0, 4);
        return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAdjust} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-slate-200 max-h-[94vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-extrabold">Adjust Stock</h3>
                <p className="text-xs text-slate-400">{adjustItem.name} · now {stockText(adjustItem)}</p>
              </div>
              <button type="button" onClick={() => setAdjustItem(null)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              {[['out', 'Take off stock'], ['in', 'Put on stock']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setAdjustForm({ ...adjustForm, dir: id, reason: id === 'out' ? 'damaged' : 'count' })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${adjustForm.dir === id ? (id === 'out' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-slate-950') : 'text-slate-400'}`}>{label}</button>
              ))}
            </div>
            {hasBox(adjustItem) && (
              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                {[['box', `${nounOf(adjustItem) === 'crate' ? 'Crates' : 'Boxes'} (${adjustItem.boxQty} each)`], ['bottle', 'Single bottles']].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setAdjustForm({ ...adjustForm, by: id })}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${adjustForm.by === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>{label}</button>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-400">{hasBox(adjustItem) ? (adjustForm.by === 'box' ? (nounOf(adjustItem) === 'crate' ? 'Number of crates' : 'Number of boxes') : 'Number of bottles') : 'Quantity'}</label>
              <input autoFocus type="number" min="1" required value={adjustForm.qty} onChange={e => setAdjustForm({ ...adjustForm, qty: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-mono text-slate-100 mt-1 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">Reason</label>
              <select value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500">
                {reasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">Note (optional)</label>
              <input value={adjustForm.note} onChange={e => setAdjustForm({ ...adjustForm, note: e.target.value })} placeholder="e.g. crate dropped at the back door"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500" />
            </div>
            {qty > 0 && (
              <p className={`text-xs ${out && qty > adjustItem.stock ? 'text-rose-400' : out ? 'text-amber-400' : 'text-emerald-400'}`}>
                {hasBox(adjustItem) && adjustForm.by === 'box' && <>{out ? 'Takes off' : 'Adds'} {qty} bottles. </>}
                {out && qty > adjustItem.stock
                  ? `Only ${stockText(adjustItem)} in stock.`
                  : <>New stock: {stockText({ ...adjustItem, stock: adjustItem.stock + (out ? -qty : qty) })}</>}
                {out && (picked as any).loss && qty <= adjustItem.stock && <> · counted as lost stock: {money(qty * (adjustItem.cost || 0))}</>}
              </p>
            )}
            {recent.length > 0 && (
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p className="font-bold uppercase">Recent adjustments</p>
                {recent.map((l: any) => (
                  <p key={l.id}>{fmtDateTime(l.ts)} · {l.type === 'adjust_out' ? '-' : '+'}{l.qty} · {l.reason}{l.note ? ` (${l.note})` : ''} · {l.by}</p>
                ))}
              </div>
            )}
            <button className={`w-full py-3 font-extrabold text-sm rounded-2xl ${out ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'}`}>{out ? 'Take off stock' : 'Put on stock'}</button>
          </form>
        </div>
        );
      })()}

      {viewShift && <ShiftRecordModal report={shiftReport(viewShift)} title={WS_LABEL} money={money} fmtDateTime={fmtDateTime} onClose={() => setViewShift(null)} onPrint={printHtml} />}
      {showStockHistory && <StockHistoryModal log={stockLog.filter((l: any) => !l.type || l.type === 'restock')} money={money} fmtDateTime={fmtDateTime} onClose={() => setShowStockHistory(false)} />}
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
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'mobile', label: 'Mobile Money', icon: QrCode },
                  { id: 'card', label: 'Card', icon: CreditCard },
                  { id: 'credit', label: 'Credit', icon: HandCoins }
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

            {paymentMethod === 'credit' && (() => {
              const list = creditCustomers.filter((c: any) => !c.blocked || c.id === creditCustId);
              const cust: any = creditCustomers.find((c: any) => c.id === creditCustId);
              const bal = cust ? balanceOf(creditLedger, cust.id) : 0;
              const chk = checkGive(cust, bal, grandTotal);
              return (
                <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <label className="text-xs text-slate-400 font-bold">Who is taking credit?</label>
                  <select value={creditCustId} onChange={e => setCreditCustId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500">
                    <option value="">Choose a customer…</option>
                    {list.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}{c.blocked ? ' (blocked)' : ''}</option>)}
                  </select>
                  {creditCustomers.length === 0 && <p className="text-[11px] text-amber-400">No credit customers yet. {isOwner || (creditPolicy as any).staffMayAdd ? 'Add one in the Credits tab first.' : 'Ask the owner to add the customer in the Credits tab.'}</p>}
                  {cust && (
                    <div className={`text-xs rounded-lg px-3 py-2 border ${chk.ok ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
                      Owes <b className="font-mono">{money(bal)}</b> · limit <b className="font-mono">{cust.limit === null ? 'none' : money(cust.limit)}</b>
                      {chk.ok ? <> · after this sale <b className="font-mono">{money(bal + grandTotal)}</b></> : <><br /><b>{chk.reason}</b>{isOwner ? ' You can still sell as the owner.' : ''}</>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[11px] text-slate-400 font-bold">Pay by (optional)</label>
                      <input type="date" value={creditDue} onChange={e => setCreditDue(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500" /></div>
                    <div><label className="text-[11px] text-slate-400 font-bold">Note (optional)</label>
                      <input type="text" value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder="e.g. pays on Friday" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500" /></div>
                  </div>
                  <p className="text-[11px] text-slate-500">No money is received now. This sale goes on the customer's account and does not add to your cash drawer.</p>
                </div>
              );
            })()}

            <button
              onClick={handleCompleteOrder}
              disabled={(paymentMethod === 'cash' && amountReceived.trim() !== '' && (!isFinite(Number(amountReceived)) || Number(amountReceived) + 0.005 < grandTotal)) || (paymentMethod === 'credit' && !creditCustId)}
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
                  stockDeducted: true, // the items leave stock now; paying the tab later must not take them out again
                  items: cart.map(i => ({ productId: i.id, name: i.name, variant: i.selectedVariant || null, pack: i.pack || 'single', packUnit: i.packUnit || null, size: i.size || 1, cost: i.cost || 0, price: i.price, qty: i.qty }))
                };

                applyCartToStock(cart);
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
              {(currentReceipt as any).isReprint && <p className="text-[11px] font-extrabold text-amber-400 border border-amber-500/40 rounded-lg py-1">DUPLICATE COPY</p>}
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
                onClick={() => printHtml(buildReceiptHtml({ ...receiptForOutput(currentReceipt), business, businessName: bizName || BRAND.product, product: BRAND.product, tax: currentReceipt.tax, taxPct: Math.round(TAX_RATE * 100), money }))}
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
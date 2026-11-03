/**
 * DEVELOPER brand (this is you, the maker of the software). It is fixed in the code and shown as the product name.
 * The CLIENT's business name is NOT here: the owner types it in the app (sidebar > Business details) and it then appears
 * on the sidebar, sign-in screen, receipts and printed reports.
 *
 * The product name is drawn in two parts, LEAD in white and TAIL in amber, like a logo.
 * Optional overrides in .env: VITE_BRAND_PRODUCT, VITE_BRAND_LEAD, VITE_BRAND_TAIL, VITE_BRAND_TAGLINE
 */
const env = (import.meta as any).env || {};

export const BRAND = {
  product: (env.VITE_BRAND_PRODUCT as string) || 'MjTech Point Of Sale',
  lead: (env.VITE_BRAND_LEAD as string) ?? 'MjTech',
  tail: (env.VITE_BRAND_TAIL as string) ?? ' POS',
  tagline: (env.VITE_BRAND_TAGLINE as string) ?? 'Bar & Wholesale Suite',
};

/** What the owner fills in once, on each device. Everything is optional except the name. */
export type QrMode = 'none' | 'receipt' | 'payment' | 'website' | 'custom';
export type SignatureMode = 'none' | 'customer' | 'both';
export type DocTitle = 'RECEIPT' | 'CASH SALE' | 'TAX INVOICE' | 'SALES RECEIPT';

export interface BusinessInfo {
  name: string; address: string; phone: string; tpin: string; footer: string;
  // ---- Receipt options (all optional) ----
  tagline: string;          // e.g. "Cold drinks · Groceries · Wholesale"
  email: string;
  website: string;
  hours: string;            // e.g. "Open daily 10:00 - 02:00"
  vatNo: string;            // VAT registration number, only if the business is VAT-registered
  docTitle: DocTitle;       // heading printed above the receipt number
  showCashier: boolean;     // "Served by ..."
  showItemCount: boolean;   // "Items: 7"
  payNote: string;          // e.g. "Airtel Money: 097XXXXXXX (Chilanga Bar)  MTN MoMo: 096XXXXXXX"
  policy: string;           // e.g. "Goods once sold cannot be returned. Keep this receipt."
  signature: SignatureMode; // lines to sign at the bottom
  qrMode: QrMode;           // what the QR code contains
  qrText: string;           // link / number used by the payment, website and custom QR modes
  qrCaption: string;        // small text printed under the QR code
  paper: '80' | '58';       // thermal paper width in mm
  feedMm: number;           // blank space after the receipt so it clears the cutter
}
export const EMPTY_BUSINESS: BusinessInfo = {
  name: '', address: '', phone: '', tpin: '', footer: 'Thank you for your business!',
  tagline: '', email: '', website: '', hours: '', vatNo: '',
  docTitle: 'RECEIPT', showCashier: true, showItemCount: true,
  payNote: '', policy: 'Goods once sold cannot be returned. Please keep this receipt.',
  signature: 'none', qrMode: 'receipt', qrText: '', qrCaption: 'Scan to verify this receipt',
  paper: '80', feedMm: 10,
};

/** Saved settings from older versions lack the new fields, so always merge with the defaults. */
export const withDefaults = (b: Partial<BusinessInfo> | null | undefined): BusinessInfo => ({ ...EMPTY_BUSINESS, ...(b || {}) });

/** One line of contact details for receipts and reports. */
export const businessLine = (b: BusinessInfo) => [b.address, b.phone, b.tpin ? `TPIN ${b.tpin}` : ''].filter(Boolean).join(' · ');

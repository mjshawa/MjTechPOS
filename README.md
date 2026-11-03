# Bar POS: offline-first (SQLite) + Supabase sync, for Web, Android and Windows

One React codebase, three targets:

| Target | Local database | How it's built |
|---|---|---|
| Android app (.apk) | native SQLite via `@capacitor-community/sqlite` | Capacitor |
| Windows app (.exe) | SQLite file via `better-sqlite3` (main process) | Electron + electron-builder |
| Browser / installable web app (PWA) | IndexedDB with the same interface (localStorage only if IndexedDB is blocked) | Vite |

Everything is read from and written to the local SQLite database first. Supabase is only a background mirror, so the
register keeps working with no internet.

## 1. Supabase setup (5 minutes)
1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql` (tables, row-level security, owner/staff profiles).
3. Authentication → Providers → Email: enable. For recovery codes, edit Authentication → Email Templates →
   **Reset Password** so the body contains `{{ .Token }}` (for example: `Your code: {{ .Token }}`).
4. Authentication → Users → **Add user** for yourself first. **The first account ever created becomes the owner**;
   everyone added after is staff (owners can change roles in the app under Team).
5. Copy `.env.example` to `.env` and fill in the project URL and anon key (Project Settings → API).

Without a `.env` the app runs fully offline with accounts stored on the device (first launch creates the owner).

## 2. Run it
```bash
npm install
npm run dev                 # browser
npm run electron:dev        # desktop window with real SQLite
```

## 3. Windows .exe
```bash
npm run electron:build      # installer appears in release/
```
Building a Windows installer from Linux needs Wine. Easier: push the project to GitHub and run the
**Build installers** workflow (Actions tab). It builds the `.exe` on a Windows runner and the `.apk` on Ubuntu.
Add your three `VITE_*` values as repository secrets first.

### Windows auto-update
The installed Windows app updates itself from **GitHub Releases** (`electron-updater`, code in `electron/updater.cjs`).
It checks 15 seconds after opening and every 4 hours, downloads in the background, then shows
**"Update x.y.z is ready"**. The owner taps **Restart now** when no sale is in progress; if ignored, it installs silently
the next time the app is closed. It never restarts by itself, works with no admin rights, and keeps the data
(the SQLite file is outside the app folder). Offline is fine: it just tries again later.

**To publish an update:**
1. Commit your changes and push them to GitHub.
2. Create and push a tag: `git tag v1.0.1 && git push origin v1.0.1` (any new, higher number).
3. The **Build installers** workflow builds the `.exe`, uses the tag as the app version, and publishes a Release.
   Every Windows machine picks it up within hours of being open and online.

**One-time setup:**
- The repository must be **public** (the app downloads the Release without a login). For a private repo, host the files
  elsewhere and change `build.publish` in `package.json` to the `generic` provider with your URL.
- Each machine needs this version installed **once by hand**; older installers have no updater. After that it is automatic.
- Keep `productName` and `appId` unchanged, or Windows treats the new build as a different app.
- Windows may show a SmartScreen warning on the first install because the installer is not code-signed (a paid
  certificate removes it). Updates after that are silent.
- For a local release instead of GitHub Actions: replace `YOUR_GITHUB_USERNAME` / `YOUR_REPO_NAME` in `package.json`,
  set `GH_TOKEN`, raise `version`, run `npm run electron:release`. The workflow fills these in by itself.
- A manual run of the workflow (without a tag) only builds the installer; nothing is published.

## 4. Android .apk
Needs JDK 17 and the Android SDK (on Arch: `jdk17-openjdk` + Android Studio or `android-sdk` from the AUR).
```bash
npm run build
npx cap add android         # once
npm run android:sync
npx cap open android        # Android Studio: Build > Build APK(s)
# or: cd android && ./gradlew assembleDebug  ->  android/app/build/outputs/apk/debug/
```

## 5. Web app (PWA): install from a link, no store, no .exe
The same build is also an installable, offline-capable web app. No extra dependencies; the pieces are:
`public/manifest.webmanifest` (name, colours, icons), `pwa/sw.template.js` (service worker; `vite.config.ts` fills in the
file list at build time and writes `dist/sw.js`), `src/pwa/` (registration, "update ready" and "install" prompts), and
`src/storage/idbDriver.ts` (IndexedDB, so the till is not limited by the browser's 5 MB localStorage cap).

```bash
npm run build               # dist/ is the whole web app
npm run preview             # try it locally (http://localhost:4173); the service worker is off in `npm run dev`
```
Upload `dist/` to any **HTTPS** static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, your own server).
It can live at the site root or in a sub-folder. Put the three `VITE_*` values in the host's build environment
(they are baked in at build time, same as for the .apk and .exe). Browsers only allow installing and offline mode on
HTTPS (or `localhost`). Build command `npm run build`, publish directory `dist`. No special install flags needed:
`scripts/postinstall.cjs` skips the Electron native setup by itself on Netlify, Vercel and Cloudflare Pages.

- **Install:** Android / Chrome / Edge show an **Install** banner (or use the browser menu). On iPhone / iPad open the link
  in Safari, tap Share, then **Add to Home Screen**. The app then opens full screen and starts with no internet.
- **Offline:** after the first visit the whole app (including the Excel export) is stored on the device. Sales, stock and
  everything else already live in the device database and sync to Supabase when online, exactly as in the apps.
- **Updates:** a new deploy downloads quietly; a **New version ready** banner appears and the owner taps **Update** when no sale
  is in progress. Nothing reloads by itself. Data is kept.
- **Data lives in the browser profile.** An installed iPhone app and the same site opened in Safari do not share data, so
  install first, then sign in (with Supabase configured, the data comes back by itself). Clearing site data or
  uninstalling removes the on-device copy; the app asks the browser to keep it safe from automatic clean-up.
- **Not for the .apk / .exe:** the service worker only runs in a normal browser; the Android and Windows apps are untouched.
- **New logo:** edit `scripts/generate-icons.py` and run `python3 scripts/generate-icons.py` (needs `pip install pillow`).

## How it works
- **Local-first:** `src/storage` loads SQLite into memory at startup; every change is written through to SQLite row by row
  (`products`, `salesHistory`, `closedShifts`, `openTabs`, `outbox`, `staff` are collections; cart, shift start,
  counts, theme are key/value). A power cut loses nothing.
- **Sync (`src/sync`):** each sale and each closed shift goes into an outbox with a UUID. When online and signed in,
  they upload oldest-first with insert-and-ignore-duplicates, so retries never double-count. Products sync both ways
  using server timestamps; an item edited on this device and not yet uploaded always wins over the incoming copy.
- **Accounts (`src/auth`):** Supabase Auth email + password. After the first online sign-in the account is cached on the
  device (salted PBKDF2 hash only), so staff can sign in offline. Forgot password: either an emailed 6-digit code, or the owner recovery code (default `2026DC`, set `VITE_OWNER_RECOVERY_CODE` in `.env` to change it). The owner code works offline and resets the owner's password on that device; 5 wrong tries locks it for 10 minutes.
- **Roles:** chosen at sign-in together with the workspace; see the Bar and Retail section below.
- **Calendar:** click a date, month or year for end-of-day totals (staff see it without shrinkage). A shift counts toward the day it was opened.
- **Expenses:** the **Expenses** tab records money going out (category, amount, paid from till / mobile money / owner, payee, note). Record them *during* the shift so they land in that shift's End of Day: EOD then shows Sales, Expenses, Net after expenses and **Cash to hand over** (cash sales minus cash paid from the till). Closing a shift asks whether all expenses were entered. After a shift is closed only the owner can still add a *late* expense; it is attached to the shift that just closed and tagged LATE. Entries are never edited or deleted: the owner **voids** a mistake (it stays on record, out of totals). Staff can add expenses and see the current shift's list; the owner also gets history, category breakdown and CSV export. Syncs to Supabase via `supabase/migrations/3_expenses.sql`.
- **Cash drawer:** on the EOD screen enter the opening float and the cash you counted. The app works out the expected drawer cash (float + cash sales − cash paid from the till) and shows over/short. It is saved with the closed shift and shown in the Calendar for the owner.
- **Print report:** End of Day → View Full EOD Report → Print opens the print dialog (choose "Save as PDF" to keep a copy): sales, expenses, cash reconciliation, stock count, shrinkage, signature lines.
- **Profit (Analytics):** revenue − cost of goods − expenses − shrinkage, by period, by day and expenses by category. Each sale now stores the item cost at the time of sale; older sales use the product's current cost. Stock bought through Receive Stock is counted as it is sold, so do not also enter it as an expense.
- **Sales & Refunds:** the **Sales & Refunds** tab lists sales (staff: this shift; owner: also 7/30 days, with search). The owner or staff can refund a whole sale or part of it, choosing per item whether it goes back into stock (untick for spilled or damaged items, which stay a loss), how the money is paid back, and a reason. Sales are never edited or deleted: a refund is a separate record. It reduces the sales, cash and payment split of the shift it is *issued* in (the cash leaves the till that day), shows in the EOD, report, calendar and profit figures, and syncs via `supabase/migrations/4_refunds.sql`. Refunds need an open shift and cannot be undone. The "rolling 24h" figure on Analytics does not subtract refunds.
- **Product photos:** when adding a product (or via **Edit** on an existing one, owner only) tap **Take photo** or **Choose file**. The photo is shrunk on the device to 320 px (about 15 to 40 KB) and shown on terminal cards and stock lists, with the emoji as fallback. It is stored inside the product, so it syncs to the other device with the rest of the catalog. On the Android build add `<uses-permission android:name="android.permission.CAMERA" />` to `android/app/src/main/AndroidManifest.xml` after `npx cap add android`; on Windows the button opens a file picker.
- **Bulk (wholesale) price and typed quantity:** per product the owner can set "buy N or more at K each". It applies automatically in the cart as soon as the quantity is reached (shown as "Bulk price applied") and flows into receipts, profit, and refunds. In the cart, tap the quantity and type it (for example 30 crates); it cannot exceed what is in stock.
- **Delete a product (owner):** Stock Tracking → red bin icon on the item → confirm. The item is **hidden, not erased** (`archived: true`): it leaves the terminal, stock list and End of Day, while old sales, refunds and reports keep working. It must be a hide, because a hard delete would be brought back by the next cloud sync. The change syncs to the other device. Restore it from **Deleted items** at the bottom of Stock Tracking. Re-using a barcode/SKU of a deleted item is blocked with a hint to restore it.
- **Branding and business details:** the product is **MjTech Point Of Sale** (developer brand, `src/brand.ts`, optional `VITE_BRAND_*` overrides in `.env`). The **client's business name is edited by the owner inside the app**: sidebar → **Business details** (name, address, phone, TPIN, receipt footer message). It then replaces the logo text in the sidebar and sign-in screen (the product name stays underneath) and prints on receipts and EOD reports. It is saved on the device, so enter it once on each device (Bar and Wholesale). Set the product name before the first install: renaming `productName` in `package.json` later changes where the Windows app stores its data. Manuals: see `docs/build/README.txt`.
- **Receipt printing (Xprinter 80 mm / 58 mm):** the receipt's **Print** button opens the normal print dialog sized for the roll. A thermal printer installed as a normal Windows/Android printer (Xprinter XP-80 / XP-58 series) works with it; there is no direct USB/Bluetooth ESC/POS driver. In the print dialog choose the Xprinter, paper size 80 mm (or 58 mm), margins **None**, scale 100%. In the printer's driver settings turn on auto-cut if it has a cutter. Choose "Save as PDF" to test without a printer.
- **Receipt options (owner):** sidebar → **Business details**. Beyond name, address, phone and TPIN the owner can set a slogan, email, website, opening hours, VAT reg. no., the heading (RECEIPT / CASH SALE / TAX INVOICE), show/hide cashier and item count, mobile-money payment details, a returns/terms line, a footer message, customer and authorised signature lines, paper width, and blank space at the end for the cutter. **QR code** can hold the receipt details (business, TPIN, receipt no., date, total), a payment link/number, a website/WhatsApp link, or any text. The **Test print** button prints a sample receipt. The QR code is not a ZRA Smart Invoice fiscal code.
- **Light/dark mode:** toggle in the sidebar (and on the sign-in screen); remembered per device.


## Deployment: one device at the Bar, one at the Wholesale
Each site has its own dedicated device. The second workspace is called **Wholesale** on screen (internally its id is still `retail`, so existing saved data and Supabase store ids keep working). Because each product is only sold on one device, the stock-sync limit below does not apply to you. The owner can sign in on either device, or on a third phone, and sees both sites through Cloud Sync.

## Bar and Wholesale workspaces, Owner and Staff
On the sign-in screen pick the **Workspace** (Bar or Retail) and **Sign in as** (Owner or Staff).
- **Bar and Wholesale are completely separate**: their own products, stock, tabs, sales, shifts, deliveries and calendar,
  stored under separate names on the device and under separate store ids in Supabase (`<VITE_STORE_ID>-bar` / `-retail`).
  The screens look identical; the Bar workspace is amber and the Retail workspace is indigo.
- **Owner** sees everything in that workspace: Terminal, Open Tabs, Stock Tracking (add items, restock, delivery history),
  End of Day (count and close shift), Calendar (full results incl. shrinkage), Analytics and profit, Team, Cloud Sync.
- **Staff** can sell on the Terminal, use Open Tabs, view Stock Tracking read-only (no costs, revenue or valuation, no edits)
  and view the Calendar (revenue, sales and payment split only). They cannot see End of Day, shrinkage, Analytics or profit.
- An account can only enter as Owner if it is an owner. An owner may also enter as Staff.
- Several devices can use the same workspace (for example two bar tablets): they sync through Supabase.

## Known limits
- Stock is synced as last-writer-wins per product. With one device per area (bar / retail) each item is only sold on one
  device, so this is safe. If both devices sell the SAME item, counts can drift until the next count.
- The role check is enforced in the app and (for role changes) by Supabase row-level security. A determined person with
  physical access to a device could still read its local database.


## Bottles and boxes (Wholesale)
Every wholesale product is ONE card and its stock is counted in **bottles**. A product that is also sold by the box
(beers, spirits...) has "Bottles in a box", "Box price" and "Box cost" (Stock Tracking > Add New Item / Edit).
- The till shows a **Bottle** and a **Box** button on the card. In the order list and again in the *Take Payment*
  window each line has a **Single bottle | Box of N** switch and a count ("3 boxes = 36 bottles").
- Selling a box takes all its bottles out of stock. Refunds put back the same number of bottles. Receipts print
  "Mosi Big (Box of 12)". Receiving stock can be counted in boxes or bottles.
- Black Label (like Mosi) has separate **Small** and **Big** cards on the Bar and on Wholesale.
- Devices that already hold saved items are upgraded once, automatically: "Black Label" becomes "Black Label Small",
  "Black Label Big" is added, and each wholesale "(single)" item is merged with its old "Box" item (the old box item is
  moved to Deleted items and its boxes are added to the bottle count).

**Selling rules:** the Bar sells everything per bottle (beer, spirits, gin...). On Wholesale, lagers (Type = Beer) are sold by the
**Crate** or **Half crate** (half the crate price, no single bottles). Other types (Spirits, Wine...) are sold by the **Box** or as **one bottle**.

## Excel export (owner only)

Owner sees **Download Excel** in the left menu and on the *Analytics & COGS* page. One `.xlsx` file is created on the device (works offline) with Bar **and** Wholesale together:
Summary, Sales (one row per sale, with staff name), Sale Items, Staff Summary, Daily Sales, Refunds, Expenses, End of Day Shifts, Stock Deliveries, Products & Stock.
On the Android app the file is saved and the phone's share menu opens (WhatsApp, email, Drive, Excel); after pulling this update run `npm install` and `npm run android:sync`. Code: `src/exportExcel.ts` (the Excel library loads only when the button is pressed). Staff do not see the button.

## What syncs to Supabase

Sales, closed shifts, deliveries, expenses, refunds, products (with stock), **open bar tabs** and the **business details** all upload automatically (every 30 s, when the internet returns, and right after a change).
Run `supabase/migrations/5_open_tabs_settings.sql` once in the Supabase SQL editor to switch on the open-tabs and business-details tables (new projects get it from `schema.sql`).
**Stock syncs as movements, not as a number.** Every change to stock (a sale, a delivery, a stock count, a refund) is uploaded as a small +/- record with its own ID, and the server adds it to the product in one atomic step. Two devices selling the same item at the same time (even offline) both count, and a retry can never count a sale twice. Product details (name, price...) still sync as before, and the server keeps its own stock numbers when a product is re-uploaded. Existing projects: run `supabase/migrations/6_stock_moves.sql` once (new projects get it from `schema.sql`); until it is run the app shows a "stock_moves is missing" message and holds back product sync. Code: `src/sync/stockMerge.ts`.
Not uploaded on purpose: the shift in progress (cash float typed, stock counts) until End of Day closes it, and the device's own theme/sign-in. Cloud Sync > "Try the N rejected again" re-sends any record Supabase refused.

## Staff accounts (cloud logins, owner adds people inside the app)

With the Supabase keys in `.env` the app uses cloud logins. The owner adds, renames, resets the password of and removes people in **Team** (no Supabase dashboard needed).
That works through one Edge Function that holds the secret key on the server and only obeys signed-in owners (`supabase/functions/manage-staff`).

One-time setup per client:
1. Run `supabase/schema.sql` (or the files in `supabase/migrations`) in the SQL editor.
2. Create the FIRST account yourself (Authentication > Users > Add user, tick "Auto Confirm User"): the first account ever created becomes the owner.
3. Authentication > Sign In / Providers: switch OFF "Allow new users to sign up" (the anon key is inside the app, so otherwise anyone could register).
4. Deploy the function from the project folder:
   ```
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy manage-staff
   ```
   (YOUR_PROJECT_REF is the code in your Supabase URL: https://YOUR_PROJECT_REF.supabase.co). Nothing to configure: the URL and keys are supplied to the function automatically.
5. Set a different `VITE_OWNER_RECOVERY_CODE` in `.env` for each client and rebuild.
6. Authentication > Emails > **Reset Password** template: make the email show the 6-digit code by adding `{{ .Token }}` (the default email only has a link, and the app asks for the code). Supabase's built-in email sender allows only a few emails per hour, so add your own SMTP provider (Authentication > SMTP) for real use.
7. Only one copy of the app may be open per browser profile (an installed window OR a browser tab). A second copy shows an "already open" screen, because two copies sharing the same on-device database can overwrite each other's unsent data.

A removed person is dropped from every device the next time that device is online (their cached offline login is deleted).

# SariSari POS: Design Spec

- **Date:** 2026-10-21
- **Author:** Jomari M. Candido
- **Status:** Draft, waiting for review
- **Series:** Project 2 of 4 new portfolio projects (ResuMatch, SariSari POS & Inventory, Barangay Request & Queue, Expense Splitter)
- **Working name:** SariSari POS. A brand pass (section 11.5) may rename it. Renaming does not change this design.

## 1. Purpose

SariSari POS is a point-of-sale, inventory and credit ledger ("listahan ng utang") web app for a small Philippine neighborhood store. The owner (may-ari) manages products, prices, stock, credit limits, staff and reports. The store helper (bantay) sells, takes utang payments and adds new suki.

It is a portfolio project. It shows skills that Jomari's six live apps do not show yet and that Philippine junior developer job posts ask for: a standalone **Express REST API**, **JWT authentication with roles**, **Docker** in local development, CI and production, **CI/CD**, **PostgreSQL with Prisma**, an **offline-capable PWA**, and a **3D** landing scene.

### 1.1 What Jomari asked for (decided during brainstorming)

- Core: selling (POS), inventory with low-stock alerts, and the utang ledger.
- Two roles: may-ari (owner) and bantay (helper).
- Each visitor gets a private demo store that is deleted after 24 hours. No email, no real sign-up.
- A 3D sari-sari store on the landing page.
- Stack: React + Express + PostgreSQL (Prisma).
- Extras: barcode scanning, receipts (58 mm print and image share), and offline selling.
- Offline scope: selling only. Product edits, utang payments and reports need the internet.
- Hosting: Netlify (web), Render with Docker (API), Neon (PostgreSQL).
- The owner can add and edit products at any time (for example when a new brand comes out), with a brand field, new categories at any time, and quick add from an unknown barcode.
- When an item is not in the product list, the bantay sells it as a **custom item**. It goes to the owner's "Needs review" list so the owner can add it to the inventory properly.
- The UI closely follows the Figma Community file "POS System Web UI" (COSYPOS) by Abubakar Sherazi, with a **blue accent instead of pink**, our own brand and content, and credit to the designer (CC BY 4.0, section 11.1).

### 1.2 Assumptions (correct these if wrong)

- The UI is in English with local terms: utang, suki, tingi, bantay, sukli, may-ari.
- Only free tiers are used, with no credit card: Netlify, Render, Neon and GitHub Actions.
- The main users are recruiters trying the demo. The features still match how a real small store works.
- Dark is the default theme, matching the reference. A light theme is available from a header toggle, like ResuMatch.
- Money is in Philippine pesos. Time is Asia/Manila. "Today" in reports means the Manila calendar day.
- Stock is counted in whole pieces. Goods sold by weight are set up as fixed portions, for example "Asukal 1/4 kg".
- GCash is recorded as a payment method only. There is no GCash integration.

### 1.3 Success criteria

1. A visitor goes from the landing page to a first completed sale in their own demo store in under 2 minutes, including the API waking up.
2. A sale is all-or-nothing: the sale, its stock changes and its utang charge are saved together or not at all.
3. A sale sent twice (for example a retried offline sync) is counted once.
4. A bantay cannot do owner actions, even by calling the API directly.
5. No store can read or change another store's data.
6. The landing page scores at least 85 for Performance and 95 for Accessibility in Lighthouse (mobile).
7. CI passes on every push, and the same Docker image runs locally, in CI and on Render.
8. A bantay can keep selling with no internet, and the sales sync correctly when the connection returns.

## 2. Scope

### 2.1 In scope

- Landing page with the 3D tindahan, a "Try the demo" button and the API wake-up.
- Demo store creation with seeded data, demo logins for both roles and a 24-hour expiry.
- Login for owner (username + password) and bantay (username + 6-digit PIN), refresh and logout.
- POS: product search, category grid, barcode scan, cart, cash with change, GCash, utang, custom items, receipt.
- Inventory: products (add, edit, archive), categories, restock, stock count, spoilage and expired, stock history, low-stock and restock list.
- Utang: suki list, suki ledger, payments, owner adjustments, credit limits, aging, copyable reminder text.
- Reports (owner): today, 7 and 30 days, payment-method split, expected cash in the drawer, profit, best sellers, slow movers, sales by hour, utang summary.
- Bantay end-of-shift summary.
- "Needs review" (owner): flagged offline sales and custom items.
- Staff (owner): add bantay, reset PIN, deactivate.
- Void a sale (owner, with a reason).
- PWA install, offline app shell, offline selling with a sync queue.
- Light and dark themes, responsive layouts for phone, tablet and desktop.
- Credits page for the UI design and the 3D/icon assets.

### 2.2 Out of scope

- Real sign-up, email, password reset by email.
- GCash or any real payment integration.
- SMS or push notifications.
- Branches (several stores per owner).
- Offline product edits, offline utang payments, offline reports.
- An English/Filipino language toggle.
- Direct Bluetooth printer control (printing uses the browser print dialog).
- Supplier orders and store expenses.

## 3. User flows

### 3.1 Recruiter (first visit)

1. Opens the landing page. The 3D tindahan plays. In the background the page pings the API's `/health` directly so the free Render instance starts waking up.
2. Clicks "Try the demo". If the API is still waking, the button shows "Opening your store… (the free server takes up to a minute to wake up)" and waits for `/health` before the real request.
3. The demo store is created and the visitor is signed in as the owner. A "Your demo logins" card shows the owner username and password and the bantay username and PIN, with a "Switch to bantay" button. A banner shows the remaining time ("Demo store, deleted in 23 h").
4. Sells a few items (search or scan from the "Sample barcodes" page), pays cash, sees the change and the receipt.
5. Switches to the bantay, sees that owner screens are hidden and that owner API calls are refused.
6. Optionally turns off the internet, sells, turns it back on and sees the sale sync once.

### 3.2 Bantay (daily use)

Open the app (installed PWA) → POS → search, tap or scan items → adjust quantities → choose payment: cash (quick amounts ₱20, ₱50, ₱100, ₱500, ₱1000, change shown), GCash (optional reference number) or utang (choose suki, balance and limit shown) → complete → receipt (print or share). Take an utang payment from the suki screen. At the end of the shift, open "My shift" to count the cash.

### 3.3 Owner

Dashboard (today's numbers, low stock, needs review) → Products (add a new brand, edit price, archive) → Restock when a delivery arrives → Stock count → Suki (set limits, see aging, copy a reminder) → Reports → Staff → Needs review (approve flagged sales, add custom items to the inventory).

## 4. Architecture

```
Browser (React PWA)
  │  static files, service worker ──────────────► Netlify CDN
  │  /api/*  (same origin) ──► Netlify signed proxy ──► Render: Docker container (Express API) ──► Neon PostgreSQL
  └─ wake-up ping: GET https://<render-host>/api/health (direct, CORS for the site origin only)
```

`<render-host>` is the Render service hostname, known once the service is created (section 14).

- The web app and the API share one origin through the Netlify proxy (`/api/*` → Render). The refresh cookie is first-party and there is no CORS on business endpoints.
- The Netlify proxy times out after 26 seconds and cannot be changed. The client therefore waits for the direct `/health` response before making proxied calls while the API is waking.
- Netlify signs every proxied request with an HS256 JWS in the `x-nf-sign` header. The API refuses every route except `/api/health` when that signature is missing or invalid, so nobody can call Render directly and fake headers such as the client IP.

### 4.1 Tech stack

| Area | Choice |
|---|---|
| Web | React, Vite, TypeScript, Tailwind CSS, React Router |
| 3D | three.js with React Three Fiber, built from primitive shapes (no downloaded models) |
| Offline | vite-plugin-pwa (Workbox) for the app shell, Dexie (IndexedDB) for the catalog snapshot and the sales queue |
| Barcode | Browser `BarcodeDetector` when available; `@zxing/browser` fallback, loaded only when the scanner opens |
| API | Node.js (current LTS), Express, TypeScript, zod validation, pino logs, helmet |
| Auth | `jose` (JWT HS256), argon2id password and PIN hashing |
| Database | PostgreSQL on Neon, Prisma ORM and migrations |
| Shared | zod schemas, enums, money and receipt helpers used by both web and API |
| Fonts and icons | Poppins (self-hosted), Lucide icons |
| Tests | Vitest, Supertest, Testing Library, Playwright, axe |
| CI/CD | GitHub Actions, Docker, Render auto-deploy, Netlify builds |

Exact versions are the current stable releases at implementation time and are pinned in `package.json`.

### 4.2 Repository layout (npm workspaces)

```
apps/web        React PWA (landing, POS, inventory, utang, reports, staff)
apps/api        Express API, Prisma schema and migrations, Dockerfile
packages/shared zod schemas, enums, money and receipt helpers
docker-compose.yml   api + postgres for local development
.github/workflows    ci.yml, cleanup.yml
docs/                spec, plan, diagrams, credits
```

### 4.3 Units

**API (`apps/api`)**

| Unit | Purpose | Depends on |
|---|---|---|
| `routes/*` | HTTP layer: parse with shared zod schemas, call a service, shape the response for the role | services, middleware |
| `middleware/proxySignature` | Verifies `x-nf-sign`; trusts the client IP header only on signed requests | config |
| `middleware/auth` | Verifies the access token; sets `req.user` (`userId`, `storeId`, `role`) | `jose`, config |
| `middleware/requireRole` | Rejects with 403 when the role is not allowed | none |
| `middleware/errors` | Maps known errors to the JSON error format (section 8.7) | none |
| `services/auth` | Login, lockout, sessions, refresh rotation, logout | db, hashing |
| `services/demo` | Creates and seeds demo stores, enforces limits, cleans up expired stores | db, seed |
| `services/catalog` | Products, categories, barcode lookup, catalog snapshot | db |
| `services/stock` | Restock, count, spoilage, movements | db |
| `services/sales` | Online sales, sync batches, voids, flags | db, domain |
| `services/utang` | Suki, ledger, payments, adjustments, aging | db, domain |
| `services/reports` | Summaries, profit, best sellers, hourly, shift | db |
| `services/staff` | Bantay accounts | db, hashing |
| `domain/*` | Pure functions: money math, sale totals, change, flag rules, aging | none |
| `seed/*` | Deterministic demo data generator | domain |

Every service function takes `storeId` as its first argument and every query filters by it.

**Web (`apps/web`)**

| Unit | Purpose |
|---|---|
| `app/` | Router, layout (sidebar rail, header), theme toggle, error boundary |
| `auth/` | In-memory access token, refresh on load and on 401, device session for offline |
| `api/` | Typed client for the API using the shared schemas |
| `offline/` | Dexie database, outbox, sync engine, online/offline status |
| `features/pos`, `inventory`, `utang`, `reports`, `staff`, `review`, `receipt`, `scanner`, `demo` | Screens and their components |
| `landing/` | Landing page and the lazy-loaded 3D scene |

### 4.4 Key interfaces

```ts
// apps/api/src/services/sales.ts
createSale(storeId: string, user: AuthUser, input: SaleInput, mode: "online" | "sync"): Promise<{ sale: SaleView; duplicate: boolean }>
syncSales(storeId: string, user: AuthUser, batch: SaleInput[]): Promise<SyncResult[]> // one result per sale, in order
voidSale(storeId: string, owner: AuthUser, saleId: string, reason: string): Promise<SaleView>

// apps/web/src/offline/syncEngine.ts
enqueueSale(sale: SaleInput): Promise<void>
flush(): Promise<{ sent: number; flagged: number; failed: number }>
pendingCount(): Promise<number>
```

## 5. Data model (PostgreSQL via Prisma)

All ids are UUIDs unless noted. Every table except `Store` has `storeId` with `ON DELETE CASCADE`, so deleting a store deletes all of its data. Money columns are integers in centavos. Times are `timestamptz`.

| Table | Columns | Notes |
|---|---|---|
| `Store` | `id`, `code` (4 chars, unique), `name`, `nextReceiptNo` (int), `createdAt`, `expiresAt` | Demo stores expire 24 h after creation |
| `User` | `id`, `storeId`, `role` (`OWNER` or `BANTAY`), `username` (unique), `displayName`, `secretHash`, `secretKind` (`PASSWORD` or `PIN`), `failedAttempts`, `lockedUntil`, `active`, `createdAt` | Usernames look like `mayari.7k2f` and `nena.7k2f` |
| `Session` | `id`, `userId`, `familyId`, `tokenHash` (unique), `expiresAt`, `revokedAt`, `replacedById` | Refresh token rotation |
| `Category` | `id`, `storeId`, `name` (unique per store), `archived` | Owner can add categories at any time |
| `Product` | `id`, `storeId`, `categoryId`, `name`, `brand` (nullable), `barcode` (nullable, unique per store), `unit` (for example "pc", "sachet", "bottle"), `priceCentavos`, `costCentavos`, `stock` (int, can be negative), `reorderLevel`, `packSize` (pieces per box, default 1), `archived`, `createdAt`, `updatedAt` | Products are archived, never deleted, so history stays complete |
| `Customer` (suki) | `id`, `storeId`, `name`, `phone` (nullable), `creditLimitCentavos` (default 0), `balanceCentavos`, `archived`, `createdAt` | Balance is a cached sum of the ledger |
| `Sale` | `id` (client UUID), `storeId`, `cashierId`, `receiptNo` (int, unique per store), `soldAt` (client time), `receivedAt` (server time), `source` (`ONLINE` or `OFFLINE_SYNC`), `method` (`CASH`, `GCASH`, `UTANG`), `totalCentavos`, `tenderedCentavos`, `changeCentavos`, `gcashRef`, `customerId`, `flags` (text array), `reviewedAt`, `voidedAt`, `voidReason`, `voidedById` | The client id makes sync idempotent |
| `SaleItem` | `id`, `saleId`, `productId` (null for a custom item), `name` (snapshot), `quantity`, `unitPriceCentavos`, `unitCostCentavos` (null for a custom item), `lineTotalCentavos` | Prices and costs are copied at sale time |
| `StockMovement` | `id`, `storeId`, `productId`, `change` (signed int), `reason` (`SALE`, `RESTOCK`, `COUNT`, `SPOILAGE`, `EXPIRED`, `VOID`), `saleId` (nullable), `userId`, `note`, `stockAfter`, `createdAt` | Audit trail for every stock change |
| `UtangEntry` | `id` (client UUID for payments), `storeId`, `customerId`, `kind` (`CHARGE`, `PAYMENT`, `ADJUSTMENT`, `VOID`), `amountCentavos` (signed: charges positive, payments negative), `method` (for payments), `saleId` (nullable), `userId`, `note`, `balanceAfter`, `createdAt` | Ledger; never edited, only appended |
| `DemoQuota` | `ipHash`, `day` (Manila date), `count` | Demo creation limit per IP per day |

Indexes: `Sale(storeId, soldAt)`, `Sale(storeId, receiptNo)` unique, `Product(storeId, barcode)` unique where not null, `Product(storeId, name)`, `StockMovement(storeId, productId, createdAt)`, `UtangEntry(storeId, customerId, createdAt)`, `Store(expiresAt)`.

**Invariants (checked by tests):** `Product.stock` equals the sum of its movements; `Customer.balanceCentavos` equals the sum of its ledger; `Sale.totalCentavos` equals the sum of its lines; `changeCentavos = tenderedCentavos − totalCentavos` for cash sales.

## 6. Business rules

1. **All-or-nothing sales.** One database transaction inserts the sale and its lines, assigns the next receipt number, decrements stock with `UPDATE … SET stock = stock − q RETURNING stock` (safe under concurrent sales), writes the stock movements, and for utang writes the `CHARGE` entry and updates the balance.
2. **Idempotency.** The client generates the sale id. Repeating a sale id returns the stored sale (`duplicate: true`) and changes nothing. Utang payments use a client id the same way.
3. **Stock never blocks a sale.** The item was physically sold. When stock goes below zero, the sale gets the `NEGATIVE_STOCK` flag so the owner recounts. The POS warns ("Only 2 left in records") before the bantay sells more than the recorded stock.
4. **Credit limits.** Online: an utang sale is refused with `credit_limit_exceeded` when `balance + total > limit`. A limit of 0 means no utang. Sync: the sale is accepted with the `OVER_CREDIT_LIMIT` flag.
5. **Prices.** A sale stores the price actually charged. If a line price differs from the product's current price when the server records it, the sale gets the `PRICE_CHANGED` flag.
6. **Custom items.** A line without a product, typed by the bantay (name and price), records no stock movement and gives the sale the `CUSTOM_ITEM` flag. From "Needs review" the owner can open "Add to inventory" with the name and price filled in.
7. **Voids.** Owner only, with a reason, once per sale. A void writes `VOID` stock movements that return the stock (not for custom items) and, for utang, a `VOID` ledger entry that reverses the charge. Voided sales stay visible and are excluded from totals.
8. **Utang payments.** Online only, cash or GCash, at most the current balance. Payments apply to the oldest charges first, which is how aging is computed (0–7, 8–30 and 31+ days since the oldest unpaid charge).
9. **Restock and counts.** Restock accepts boxes × pack size or pieces, plus the cost per piece, which becomes the product's cost. A count records the difference between the counted and recorded stock as a `COUNT` movement.
10. **Store isolation.** Every query filters by the `storeId` from the access token. Ids from another store answer 404, as if they did not exist.
11. **Free-tier protection.** At most 5 demo stores per IP per day, at most 200 active demo stores, at most 5 bantay per store, at most 300 products per store, at most 100 sales per sync batch.

## 7. Authentication and roles

### 7.1 Login and lockout

- Owner: username + password (demo passwords are generated, 16 characters). Bantay: username + 6-digit PIN (the owner sets it; PINs such as 000000 or 123456 are refused).
- Secrets are hashed with argon2id.
- Wrong secret or unknown user returns the same `invalid_credentials` error.
- After 5 wrong attempts the account is locked for 15 minutes (`account_locked` with the retry time). A rate limit per IP also applies.

### 7.2 Tokens

- **Access token:** JWT HS256, 15 minutes, claims `sub` (user id), `store`, `role`. Kept in memory by the web app and sent as `Authorization: Bearer`.
- **Refresh token:** 32 random bytes, stored as a SHA-256 hash in `Session`. Sent as the cookie `__Host-sari_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`), valid until the store expires (at most 24 h).
- **Rotation:** each refresh issues a new refresh token and marks the old one replaced. Using a replaced token revokes the whole session family (possible theft).
- **CSRF:** business endpoints use the bearer token, not cookies. The refresh endpoint also requires the header `X-Requested-With: sari-pos`.
- **Logout** revokes the session, clears the cookie and clears the device's offline data (with a warning first if sales are still waiting to sync).
- **Deactivating a bantay** revokes all of that user's sessions.

### 7.3 Device session for offline selling

The last signed-in user stays signed in on the device until logout. Their profile, the catalog snapshot and the sales queue live in IndexedDB. When the app opens offline, the bantay can keep selling into the queue. When the connection returns, the app refreshes the access token with the cookie and then syncs. If the session has expired, the app asks the user to sign in again before it sends the queued sales.

### 7.4 Permissions

| Action | Owner | Bantay |
|---|---|---|
| Sell, receipts, custom items | ✅ | ✅ |
| View products and prices | ✅ | ✅ without cost and profit |
| Add a suki | ✅ | ✅ (credit limit starts at 0) |
| Take utang payments | ✅ | ✅ |
| Set credit limits, adjust utang | ✅ | ❌ |
| Add, edit, archive products and categories | ✅ | ❌ |
| Restock, count, spoilage | ✅ | ❌ |
| Void sales | ✅ | ❌ |
| Reports, profit, needs review | ✅ | ❌ (own shift summary only) |
| Staff management | ✅ | ❌ |

The API enforces this table. Responses for the bantay never contain cost or profit fields.

### 7.5 Demo stores

- `POST /api/demo` creates the store "Tindahan ni Mang Ben" with a random 4-character code, the owner Mang Ben (username `mayari.<code>`), one bantay, Nena (username `nena.<code>`), about 60 products in typical categories (snacks, drinks, canned goods, condiments, household, personal care, school supplies, tingi items) with generic names and no real brands, 12 suki with varied balances and limits, and about 30 days of sales (25–60 a day, more in the evening) so the reports have data.
- Demo barcodes are EAN-13 codes with the in-store prefix 2 (reserved for restricted, in-store use), so they never match a real product.
- The seed is generated by code from a seed number, so tests can check its invariants.
- The response signs the visitor in as the owner and returns the demo logins once. The web app keeps them on the device so "Switch to bantay" works.
- Expired stores are deleted when a new demo store is created and by a daily GitHub Actions job.

## 8. API contracts

All routes are under `/api`, accept and return JSON, and are validated with the shared zod schemas. "Owner" and "Any" refer to the role required.

### 8.1 Health and demo

| Route | Role | Notes |
|---|---|---|
| `GET /health` | public, direct or proxied | `{ ok: true }`; CORS allowed for the site origin only |
| `POST /demo` | public | Creates a demo store (section 7.5). 201 `{ accessToken, user, store, demoLogins, expiresAt }`; 429 `demo_limit`; 503 `demo_full` |
| `POST /admin/cleanup` | secret header | Deletes expired stores; used by the daily job |

### 8.2 Auth

| Route | Notes |
|---|---|
| `POST /auth/login` | `{ username, secret }` → `{ accessToken, user, store }` and the refresh cookie |
| `POST /auth/refresh` | Cookie + `X-Requested-With` → new access token and rotated cookie |
| `POST /auth/logout` | Revokes the session and clears the cookie |
| `GET /me` | Current user and store |

### 8.3 Catalog and stock

| Route | Role | Notes |
|---|---|---|
| `GET /catalog` | Any | Snapshot for the POS and offline use: active products, categories, suki with balances and limits, `generatedAt` |
| `GET /products` | Any | Filters: `search`, `categoryId`, `status` (`active` or `archived`), `lowStock` |
| `GET /products/barcode/:code` | Any | 404 when unknown |
| `POST /products` | Owner | Create a product |
| `PATCH /products/:id` | Owner | Edit; requires `expectedUpdatedAt`; 409 `stale_edit` when it changed elsewhere |
| `POST /products/:id/archive`, `/unarchive` | Owner | |
| `GET /products/:id/movements` | Owner | Stock history |
| `GET /categories`, `POST /categories`, `PATCH /categories/:id` | Any / Owner / Owner | |
| `POST /stock/restock` | Owner | `{ productId, boxes?, pieces?, unitCostCentavos }` |
| `POST /stock/adjust` | Owner | `{ productId, counted }` or `{ productId, quantity, reason: SPOILAGE or EXPIRED }`, with `note` |
| `GET /stock/restock-list` | Owner | Products at or below the reorder level, also as plain text for copying |

### 8.4 Sales

| Route | Role | Notes |
|---|---|---|
| `POST /sales` | Any | Online sale (strict credit limit). 201 new, 200 duplicate. Body: `{ id, soldAt, items: [{ productId, quantity, unitPriceCentavos } or { custom: { name, unitPriceCentavos }, quantity }], payment: { method, tenderedCentavos?, gcashRef?, customerId? } }` |
| `POST /sales/sync` | Any | `{ sales: SaleInput[] }`, up to 100, applied in order. Returns `[{ id, status: accepted, duplicate or invalid, receiptNo?, flags, error? }]`. Never refuses a sale for stock or credit limits |
| `GET /sales` | Any | Owner: any date and cashier. Bantay: own sales today |
| `GET /sales/:id` | Any | Receipt data. Bantay: own sales only |
| `POST /sales/:id/void` | Owner | `{ reason }` |
| `GET /review` | Owner | Flagged, unreviewed sales and custom items |
| `POST /review/:saleId/done` | Owner | Marks a flagged sale reviewed |

The server recomputes line totals and the sale total from the lines and refuses a request whose totals do not match (`invalid_input`).

### 8.5 Suki and utang

| Route | Role | Notes |
|---|---|---|
| `GET /customers` | Any | Search, balance, limit, aging |
| `POST /customers` | Any | Bantay-created suki start with limit 0 |
| `PATCH /customers/:id` | Owner (limit), Any (name, phone) | |
| `GET /customers/:id/ledger` | Any | Charges with links to sales, payments, adjustments |
| `POST /customers/:id/payments` | Any | `{ id, amountCentavos, method }`; idempotent; 400 `overpayment` above the balance |
| `POST /customers/:id/adjustments` | Owner | `{ amountCentavos, note }` |
| `GET /customers/:id/reminder` | Any | Polite reminder text to copy, for example "Hi Aling Rosa, paalala lang po sa utang ninyo na ₱320 sa Tindahan ni Mang Ben. Salamat po!" |

### 8.6 Reports and staff

| Route | Role | Notes |
|---|---|---|
| `GET /reports/summary?range=today,7d,30d` | Owner | Sales, count, by method, expected cash (cash sales + cash utang payments), profit |
| `GET /reports/products?range=` | Owner | Best sellers by quantity and by profit, slow movers |
| `GET /reports/hourly?date=` | Owner | Sales per hour (Manila) |
| `GET /reports/utang` | Owner | Total outstanding, top suki, aging buckets |
| `GET /reports/my-shift` | Any | Own sales today by method |
| `GET /staff`, `POST /staff`, `PATCH /staff/:id` | Owner | Add bantay (`displayName`, `pin`), reset PIN, deactivate |

Profit excludes custom items, because they have no cost. The report says so.

### 8.7 Errors

Every error uses `{ "error": { "code": string, "message": string, "field"?: string, "retryAfter"?: string } }`.

| Status | Codes |
|---|---|
| 400 | `invalid_input`, `overpayment` |
| 401 | `unauthenticated`, `invalid_credentials`, `session_expired` |
| 403 | `forbidden`, `bad_proxy_signature` |
| 404 | `not_found` |
| 409 | `stale_edit`, `credit_limit_exceeded`, `already_voided`, `limit_reached` (the free-tier caps in section 6, rule 11) |
| 423 | `account_locked` |
| 429 | `rate_limited`, `demo_limit` |
| 503 | `demo_full`, `service_unavailable` |

Messages are written for store users, for example "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit."

## 9. Offline selling (PWA)

- The service worker caches the app shell, fonts and icons, so the app opens without internet. API responses are not cached by the service worker.
- The app stores the catalog snapshot (`GET /catalog`) in IndexedDB on every online load and after every edit.
- The header shows a status badge: "Online", "Offline: sales will sync" or "Syncing 3 sales…".
- Offline sales go to the outbox with their client id and `soldAt`. The receipt says "Pending sync" and shows a short code instead of the receipt number.
- Stock offline is the last known number with its time ("as of 10:42 AM").
- The sync engine sends the outbox in order through `POST /sales/sync` on the `online` event, when the app regains focus, and every 30 seconds while sales are waiting, with backoff after errors. Accepted and duplicate sales leave the outbox. Invalid sales stay in a "Couldn't sync" list on that device with the reason, a "Try again" action and a "Remove" action that asks for confirmation.
- Utang payments, product edits, stock changes and reports show "Needs internet" and are disabled while offline.
- E2E tests cover offline selling with Playwright's offline mode.

## 10. POS, scanner and receipt

- **POS layout:** category tiles and a product grid on the left, the cart on the right (desktop); on phones the cart is a bottom sheet with the total always visible. Product tiles show name, brand, price and a low-stock badge.
- **Keyboard:** `/` focuses search, Enter adds the highlighted product, `+`/`−` change the selected line, `F9` opens payment.
- **Cash:** quick amounts ₱20, ₱50, ₱100, ₱500, ₱1000 and "Exact"; change shown in large text; tendered must cover the total.
- **Scanner:** opens the camera only on request and stops it on close. A known barcode adds the product; an unknown barcode shows "Not in your products" with "Add product" (owner, barcode filled in) or "Sell as custom item" (bantay). The "Sample barcodes" page shows barcodes of demo products to scan from another screen.
- **Receipt:** store name, date and time (Manila), receipt number (or pending code), cashier, lines, total, payment method, tendered and change, utang balance after the sale for utang. "Print" uses a 58 mm print stylesheet. "Share" renders a PNG and uses the Web Share API, with a download fallback. There is no public receipt link.

## 11. UI and 3D

### 11.1 Visual reference and credit

The app UI follows **"POS System Web UI" (COSYPOS) by Abubakar Sherazi** from the Figma Community, a free file under **CC BY 4.0**, which allows adaptation with attribution. We keep its layout and style: dark surfaces, a left rail with icon and label navigation, rounded cards with small bar charts, list rows on raised surfaces, and the Poppins type. We change: the accent from pink to blue, the brand (no COSYPOS name or logo), all content and data (sari-sari products instead of food photos), the icons (Lucide), and the screens to sari-sari flows. The original uses white text on the pink active state; we use dark text on the blue accent for contrast.

Credit text, shown on the Credits page and in the README: *UI adapted from "POS System Web UI" by Abubakar Sherazi (Figma Community), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: blue accent, new brand, sari-sari screens and content, icons.*

Reference frames: Login, Dashboard, Staff Management, Menu (becomes Products and Categories), Orders (becomes POS), Inventory, Notification (becomes Needs review), Profile, Reports, and the iPhone frames for mobile.

### 11.2 Design tokens

| Token | Dark (default) | Light |
|---|---|---|
| `--bg` | `#111315` | `#F4F5F7` |
| `--surface` | `#292C2D` | `#FFFFFF` |
| `--raised` | `#3D4142` | `#EEF0F3` |
| `--text` | `#FFFFFF` | `#111315` |
| `--muted` | `#ADB0B2` | `#5B6066` |
| `--accent` (replaces pink `#FAC1D9`) | `#93C5FD` | `#2563EB` |
| `--accent-ink` (text on accent) | `#111315` | `#FFFFFF` |
| `--success` | `#50CD89` | `#147A3A` |
| `--danger` (the reference's `#E70000` fails contrast on dark) | `#FF8A8A` | `#B91C1C` |
| `--warning` | `#F5C451` | `#8A5206` |

Every text color passes WCAG AA (4.5:1) on `--bg`, `--surface` and `--raised` in its theme; the lowest pair is 4.53:1 (light accent on raised). A unit test checks these pairs so a later token change cannot break contrast. Radius: 12 px cards, 10 px controls. Type: Poppins 400, 500 and 600.

### 11.3 Screens

Landing, Login, Demo welcome (demo logins card), Dashboard (owner), POS, Payment, Receipt, Products, Product form, Categories, Restock, Stock count, Stock history, Suki list, Suki ledger, Reports (summary, products, hourly, utang), Needs review, Staff, Profile and settings (theme), My shift (bantay), Sample barcodes, Credits, 404.

### 11.4 3D tindahan (landing)

- A low-poly sari-sari store made from primitive shapes: wooden walls, a corrugated roof, the classic barred window with a small serving opening, a painted "Sari-Sari Store" signboard (our brand), strips of hanging sachets in generic colors with no real logos, a bench outside, a bottle crate, dusk lighting with a warm bulb inside, and blue accent touches.
- Motion: a slow camera orbit, slight pointer parallax, and a scroll-driven move toward the window that leads into the "Try the demo" section.
- Performance: lazy-loaded, device pixel ratio capped at 1.5, paused when the tab is hidden, and a static image fallback for reduced motion or no WebGL. The landing never blocks on the 3D scene.

### 11.5 Brand

Working name "SariSari POS", with a simple storefront-awning mark in blue. A brand pass before launch may choose a final name (for example "Tindahan POS" or "SukiPOS"), logo, favicon and Open Graph image.

### 11.6 Accessibility and layout

WCAG AA contrast, visible focus, keyboard support for POS and dialogs, labels on every control, `aria-live` for sync status and errors, reduced motion respected, touch targets at least 44 px, layouts for 360 px phones up to wide desktops.

## 12. Security and privacy

- Secrets (JWT secret, proxy signing secret, cleanup secret, database URLs) live only in Render, Netlify and GitHub settings, never in the web bundle.
- The API refuses unsigned proxied requests (section 4), uses helmet, limits JSON bodies to 64 KB, validates every input with zod, and uses Prisma parameterized queries.
- Netlify sends a strict Content Security Policy (self only, plus the Render origin for the wake-up ping), `Permissions-Policy: camera=(self)`, HSTS and `nosniff`.
- Passwords and PINs use argon2id. Lockout and rate limits slow down guessing.
- Logs contain ids, codes and timings, never secrets or full request bodies. IPs are stored only as salted hashes for the demo limit.
- Demo data is fictional and deleted after 24 hours.

## 13. Testing

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Money and change, sale totals, flag rules, aging (oldest charges first), receipt text, permissions table, outbox and sync engine, seed invariants |
| API | Vitest + Supertest + a real PostgreSQL (Docker locally, a service container in CI) | Every endpoint for both roles and anonymous; store isolation for every resource; duplicate sale ids; all-or-nothing sales with a forced failure; two concurrent sales of the last item; credit limits online and in sync; voids; lockout; refresh rotation and stolen-token reuse; demo limits and cleanup; proxy signature checks |
| Component | Testing Library | Cart, payment and change, forms, offline badge, scanner fallbacks |
| E2E | Playwright against the production build and the API Docker image | Demo → sale → receipt; utang sale and payment; owner vs bantay; barcode with a simulated detector; offline sale then sync once; phone viewport; reduced motion; axe accessibility checks |
| Lighthouse | Lighthouse CLI | Landing on mobile: Performance ≥ 85, Accessibility ≥ 95 |

## 14. Configuration and deployment

| Service | Settings |
|---|---|
| Neon | One project. `DATABASE_URL` (pooled) for the app, `DIRECT_URL` for migrations |
| Render | Docker web service from `apps/api/Dockerfile`, free instance. Env: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PROXY_SIGNING_SECRET`, `CLEANUP_SECRET`, `IP_HASH_SALT`, `SITE_ORIGIN`. The container runs `prisma migrate deploy`, then starts the server. Auto-deploy from `main` only after CI checks pass (or a deploy hook called by CI if that setting is unavailable) |
| Netlify | Builds `apps/web`. `netlify.toml`: `/api/*` → `https://<render-host>/api/:splat` with status 200 and `signed = "PROXY_SIGNING_SECRET"`; SPA fallback; security headers. Env: `PROXY_SIGNING_SECRET` (runtime scope), `VITE_API_WAKE_URL` |
| GitHub Actions | `ci.yml`: install, lint, typecheck, unit and component tests, API tests with a Postgres service, Docker image build, E2E with the built image. `cleanup.yml`: daily `POST /api/admin/cleanup` with the cleanup secret |

Local development: `docker compose up` starts the API and PostgreSQL; `npm run dev -w apps/web` starts the web app with a Vite proxy for `/api`.

## 15. Deliverables

1. Public GitHub repository `jomari18/sarisari-pos` with this spec, the plan, a README (setup, architecture diagram, credits) and diagrams (context, data flow, flowchart) like the other portfolio projects.
2. Live web app on Netlify and API on Render, connected to Neon.
3. Green CI on `main`.
4. Portfolio entry (screenshot, walkthrough video, case study) after approval, like ResuMatch.

## 16. Prerequisites (Jomari's actions or approvals)

1. Approve this spec and then the implementation plan.
2. Create the accounts that need a person: Render (sign in with GitHub) and Neon. No card is needed.
3. Approve creating the GitHub repository and the Netlify site, and approve each push and deploy as with ResuMatch.
4. Enter the secrets in Render, Netlify and GitHub personally; they are never pasted in chat.
5. Confirm the credit text in section 11.1.

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Render free instance sleeps (about 1 minute to wake) | Wake-up ping on landing; clear waiting message; the PWA shell and offline selling work while the API wakes |
| Netlify proxy times out at 26 s | Wait for the direct `/health` before proxied calls; keep requests short (seed in batches, under 5 s) |
| Neon free compute (100 CU-hours a month) and 1 GB storage | Scale to zero; small seeds; caps and daily cleanup |
| Render free hours (750 a month for the workspace) | Only one free service on the workspace |
| iOS Safari has no `BarcodeDetector` | ZXing fallback, loaded on demand; manual search always available |
| Offline edge cases (stale prices, oversold stock, over-limit utang) | Server-side flags and the owner's "Needs review" list |
| Abuse of the public demo | Per-IP and global caps, rate limits, 24 h expiry |
| Design attribution | CC BY 4.0 credit on the Credits page and in the README; own brand and content |

## 18. Build order

The implementation plan follows these milestones. Each one ends with green tests and something that can be shown.

1. **Foundation:** monorepo, shared package, Prisma schema and migrations, Docker Compose, Express skeleton with the error format, health route, proxy signature check, CI with lint, typecheck and tests.
2. **Auth and demo:** login, lockout, sessions and rotation, roles middleware, demo store creation with the seed, cleanup.
3. **Selling core:** catalog, sales with all business rules, sync endpoint, voids, utang ledger and payments, store isolation tests.
4. **Owner tools:** products and categories, restock and counts, staff, reports, needs review.
5. **Web app:** layout and tokens from the reference, login and demo welcome, POS with payment and receipt, inventory, suki, reports, staff, review, themes.
6. **Offline and scanner:** PWA shell, catalog snapshot, outbox and sync engine, barcode scanner with fallback, sample barcodes page.
7. **Landing and 3D:** landing page, the tindahan scene, wake-up flow, brand, credits page.
8. **Ship:** Docker image in CI and E2E, Render, Neon and Netlify setup, Lighthouse, README and diagrams, portfolio entry after approval.

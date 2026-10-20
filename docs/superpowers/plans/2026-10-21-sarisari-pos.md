# SariSari POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship SariSari POS: an offline-capable React PWA (POS, inventory, utang, reports) backed by an Express + Prisma API in Docker, with per-visitor demo stores and a 3D landing page.

**Architecture:** npm workspaces monorepo. `packages/shared` holds zod schemas, enums, money, time, EAN-13 and receipt helpers used by both sides. `apps/api` is Express 5 + Prisma 7 on PostgreSQL, run from one Docker image locally, in CI and on Render, reachable only through Netlify's signed proxy. `apps/web` is Vite + React + Tailwind, deployed on Netlify, with Dexie for the offline catalog and sales queue.

**Tech Stack:** Node 24, TypeScript 5.9, Express 5, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL 17, zod 4, jose 6, `@node-rs/argon2`, React 19.3, Vite 8, Tailwind 4, TanStack Query 5, React Router 8, Dexie 4, vite-plugin-pwa 2, `@zxing/browser`, three + React Three Fiber 9, Vitest 5, Supertest, Testing Library, Playwright 1.64, axe, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-21-sarisari-pos-design.md` (read it with this plan; section numbers below refer to it).

## Global Constraints

- Node `24.x` (`.nvmrc` = `24`); npm workspaces; every package `"type": "module"`.
- Pinned majors: `typescript@5.9.3` (not 7: typescript-eslint needs `<6.1`, Prisma 7 recommends 5.9), `react@19.3.x` and `react-dom@19.3.x` (React Three Fiber 9 needs `<19.4`), `vite@8.3.x`, `@vitejs/plugin-react@6.1.x`, `tailwindcss@4.3.x` + `@tailwindcss/vite@4.3.x`, `vitest@5.0.x`, `@playwright/test@1.64.x`, `express@5.3.x`, `prisma@7.10.x` + `@prisma/client@7.10.x` + `@prisma/adapter-pg@7.10.x` (not the 8.0 RC), `zod@4.6.x`, `jose@6.x`, `@node-rs/argon2@2.x`, `dexie@4.x`, `vite-plugin-pwa@2.0.x`, `@zxing/browser@0.2.x`, `three@0.186.x`, `@react-three/fiber@9.8.x`, `@react-three/drei@10.7.x`, `react-router@8.5.x`, `@tanstack/react-query@5.x`, `@types/node@24.x`.
- API TypeScript: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, relative imports end in `.js`; dev with `tsx watch`; build with `tsc -p apps/api`; run `node dist/server.js`.
- `packages/shared` is built with `tsc` to `dist` (ESM + `.d.ts`). The web and all Vitest configs alias `@sari/shared` to `packages/shared/src/index.ts`; the API's runtime resolves the built `dist` through the workspace link.
- Prisma 7: `apps/api/prisma.config.ts` (loads `dotenv/config`, schema `prisma/schema.prisma`, migrations `prisma/migrations`, `datasource.url = env("DATABASE_URL")`); generator `provider = "prisma-client"`, `output = "../src/generated/prisma"`, `moduleFormat = "esm"`, `importFileExtension = "js"`; client built with `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Run `prisma generate` explicitly (migrate no longer runs it).
- API service functions take `(db, user: AuthUser, ...)`; `user.storeId` scopes every query (this is how spec 4.3 and 4.4's `storeId` argument is passed).
- Money is integer centavos everywhere; prices and costs `0..10_000_000`; display with `formatPeso`. Time zone `Asia/Manila` for every "today", day range and hour.
- Error body is exactly `{ "error": { "code", "message", "field"?, "retryAfter"? } }` with the codes and statuses of spec 8.7.
- Fixed values (spec 6, 7): access token 15 min HS256 with claims `sub`, `store`, `role`; refresh cookie `__Host-sari_refresh` (`HttpOnly; Secure; SameSite=Strict; Path=/`), max age = store expiry; refresh requires header `X-Requested-With: sari-pos`; lockout after 5 wrong attempts for 15 min; demo store lifetime 24 h; caps: 5 demo stores per IP per Manila day, 200 active demo stores, 5 bantay per store, 300 products per store, 100 sales per sync batch, 200 lines per sale; JSON body limit 64 KB.
- UI copy is English with the local terms utang, suki, tingi, bantay, sukli, may-ari. Exact strings fixed by the spec are quoted in the tasks; reuse them verbatim.
- Design tokens and the CC BY credit text are copied verbatim from spec 11.1 and 11.2.
- Test databases must be local: the API test setup refuses any `TEST_DATABASE_URL` whose host is not `127.0.0.1` or `localhost`. Local test DB: `postgres://sari:sari@127.0.0.1:55433/sari_test` from `docker compose up -d db`.
- Commits: conventional messages, no co-author trailers. Never commit `.env*` files (only `.env.example`). Never paste or read Jomari's real secrets; Jomari enters them in Render, Netlify and GitHub personally.
- External actions (creating the GitHub repo, pushing, creating Netlify, Render or Neon resources, deploying) wait for Jomari's explicit approval at the checkpoints in Tasks 6, 37 and 38.

## Review Focus

1. **Wrong phone clock on an offline device** (sale `soldAt` hours in the future or before the store existed): the sale is accepted, its `soldAt` becomes the server time and it gets the `CLOCK_ADJUSTED` flag. Test in Task 14.
2. **Names with ñ, accents or stray spaces** ("  Kape   3-in-1 ", "Niño"): names are trimmed and collapsed, and POS search for "nino" finds "Niño". Tests in Task 1 and Task 24.
3. **Peso amounts typed in everyday formats** ("₱50", "1,000", "1000.5", "12.345", "-5"): the first three parse, the last two are refused. Test in Task 1.
4. **Double tap or retry on "Complete sale" while the API is slow** (cold start): exactly one sale exists, because retries reuse the same client id. Test in Task 25 (API side already in Task 13).
5. **Demo store expired while the device still has queued offline sales**: the app stops retrying and shows "This demo store has ended. Unsynced sales can't be sent." with "Start a new demo" and "Clear this device". Test in Task 29.

---

## Milestone 1: Foundation

### Task 1: Monorepo scaffold and shared money and text helpers

**Files:**
- Create: `package.json` (workspaces `apps/*`, `packages/*`; scripts `lint`, `typecheck`, `test`, `test:api`, `test:e2e`, `build`), `.nvmrc`, `.gitignore`, `tsconfig.base.json`, `eslint.config.js`, `vitest.workspace.ts`
- Create: `packages/shared/package.json` (name `@sari/shared`, exports `./dist/index.js`, types `./dist/index.d.ts`), `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/money.ts`, `packages/shared/src/normalize.ts`
- Test: `packages/shared/test/money.test.ts`, `packages/shared/test/normalize.test.ts`

**Interfaces:**
- Produces: `parsePesos(input: string): number | null` (centavos), `formatPeso(centavos: number): string`, `changeFor(totalCentavos: number, tenderedCentavos: number): number`, `normalizeName(s: string): string`, `searchKey(s: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(parsePesos("1,000")).toBe(100000);
expect(parsePesos("1000.5")).toBe(100050);
expect(parsePesos("₱50")).toBe(5000);
expect(parsePesos(" 0.05 ")).toBe(5);
for (const bad of ["12.345", "-5", "", "abc", "1,00", "1e3"]) expect(parsePesos(bad)).toBeNull();
expect(formatPeso(123450)).toBe("₱1,234.50");
expect(formatPeso(0)).toBe("₱0.00");
expect(changeFor(4550, 10000)).toBe(5450);
expect(() => changeFor(10000, 4550)).toThrow(RangeError);
expect(normalizeName("  Kape   3-in-1 ")).toBe("Kape 3-in-1");
expect(searchKey("Niño")).toBe("nino");
expect(searchKey("ÁTSARA")).toBe("atsara");
```

- [ ] **Step 2: Run** `npx vitest run packages/shared` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the five functions. `parsePesos` strips one leading `₱` and spaces, accepts `^\d{1,3}(,\d{3})*(\.\d{1,2})?$` or `^\d+(\.\d{1,2})?$`; `searchKey` = NFD, remove `\p{M}`, lowercase, `normalizeName`. Set up root ESLint (typescript-eslint recommended) and `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`).
- [ ] **Step 4: Run** `npx vitest run packages/shared && npm run lint && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `chore: monorepo scaffold with shared money and text helpers`

### Task 2: Shared enums, errors, Manila time and EAN-13

**Files:**
- Create: `packages/shared/src/enums.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/time.ts`, `packages/shared/src/ean13.ts`
- Test: `packages/shared/test/time.test.ts`, `packages/shared/test/ean13.test.ts`, `packages/shared/test/errors.test.ts`

**Interfaces:**
- Produces: `ROLES`, `PAYMENT_METHODS`, `SALE_FLAGS` (`NEGATIVE_STOCK`, `OVER_CREDIT_LIMIT`, `PRICE_CHANGED`, `CUSTOM_ITEM`, `CLOCK_ADJUSTED`), `MOVEMENT_REASONS`, `UTANG_KINDS` as `const` arrays with matching union types `Role`, `PaymentMethod`, `SaleFlag`, `MovementReason`, `UtangKind`; `ERROR_STATUS: Record<ErrorCode, number>` and `type ErrorCode`; `type ApiErrorBody`; `MANILA_TZ`, `manilaDate(d: Date): string`, `manilaDayStart(date: string): Date`, `manilaHour(d: Date): number`; `ean13CheckDigit(first12: string): number`, `isValidEan13(code: string): boolean`, `ean13Modules(code: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(manilaDate(new Date("2026-10-20T16:30:00Z"))).toBe("2026-10-21");
expect(manilaDayStart("2026-10-21").toISOString()).toBe("2026-10-20T16:00:00.000Z");
expect(manilaHour(new Date("2026-10-21T10:15:00Z"))).toBe(18);
expect(ean13CheckDigit("400638133393")).toBe(1);
expect(isValidEan13("4006381333931")).toBe(true);
expect(isValidEan13("4006381333932")).toBe(false);
const m = ean13Modules("4006381333931");
expect(m).toHaveLength(95);
expect([m.slice(0, 3), m.slice(45, 50), m.slice(92)]).toEqual(["101", "01010", "101"]);
expect(ERROR_STATUS.credit_limit_exceeded).toBe(409);
expect(ERROR_STATUS.account_locked).toBe(423);
expect(Object.keys(ERROR_STATUS)).toHaveLength(17); // every code in spec 8.7
```

- [ ] **Step 2: Run** `npx vitest run packages/shared` — Expected: FAIL.
- [ ] **Step 3: Implement** the modules. Manila is a fixed UTC+8 (no DST), so `manilaDayStart` = `new Date(date + "T00:00:00+08:00")`; `ean13Modules` uses the standard L/G/R tables and first-digit parity patterns.
- [ ] **Step 4: Run** the shared tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): enums, error codes, Manila time and EAN-13 helpers`

### Task 3: Shared request schemas, view types and receipt lines

**Files:**
- Create: `packages/shared/src/schemas/{auth,sale,product,customer,stock,staff}.ts`, `packages/shared/src/views.ts`, `packages/shared/src/receipt.ts`
- Test: `packages/shared/test/schemas.test.ts`, `packages/shared/test/receipt.test.ts`

**Interfaces:**
- Produces (zod schemas and inferred types of the same name): `LoginInput`, `PinSchema`; `SaleLineInput` (either `{ productId, quantity, unitPriceCentavos }` or `{ custom: { name, unitPriceCentavos }, quantity }`), `PaymentInput` (discriminated on `method`: `CASH { tenderedCentavos }`, `GCASH { gcashRef? }`, `UTANG { customerId }`), `SaleInput { id: uuid, soldAt: ISO string, items: SaleLineInput[1..200], totalCentavos, payment }`, `SyncBatchInput { sales: SaleInput[1..100] }`; `ProductInput` (`name` 1..80 normalized, `brand?` ≤40, `barcode?` `^\d{8,14}$`, `categoryId`, `unit` 1..12, `priceCentavos`, `costCentavos`, `reorderLevel` 0..9999, `packSize` 1..1000), `ProductPatch` (partial + `expectedUpdatedAt`), `CategoryInput { name 1..30 }`; `CustomerInput { name 1..60, phone? ^(09|\+639)\d{9}$ }`, `CustomerPatch { name?, phone?, creditLimitCentavos? 0..5_000_000 }`, `PaymentRecordInput { id, amountCentavos 1..5_000_000, method: CASH|GCASH }`, `AdjustmentInput { amountCentavos ≠0 within ±5_000_000, note 1..120 }`; `RestockInput { productId, boxes? 1..999, pieces? 1..99999, unitCostCentavos }` (at least one of boxes or pieces), `AdjustInput` (`{ productId, counted 0..99999, note? }` or `{ productId, quantity 1..99999, reason: SPOILAGE|EXPIRED, note? }`); `StaffInput { displayName 1..30, pin }`, `StaffPatch { pin?, active? }`.
- Produces (types only, in `views.ts`): `StoreView { id, code, name, expiresAt }`, `UserView { id, role, username, displayName }`, `ProductView` (with optional `costCentavos`), `CategoryView`, `CustomerView { id, name, phone, creditLimitCentavos, balanceCentavos, oldestUnpaidDays }`, `SaleLineView`, `SaleView { id, receiptNo, soldAt, method, totalCentavos, tenderedCentavos, changeCentavos, gcashRef, customer?: { id, name, balanceAfterCentavos }, cashier: { id, displayName }, lines, flags, voidedAt, voidReason, pending?: boolean }`, `CatalogSnapshot { generatedAt, products, categories, customers }`, `SyncResult { id, status: "accepted" | "duplicate" | "invalid", receiptNo?, flags, error? }`, `DemoLogins { owner: { username, password }, bantay: { username, pin } }`.
- Produces: `receiptLines(sale: SaleView, store: { name: string }, width?: number): string[]` (default width 32 characters).

- [ ] **Step 1: Write the failing tests**

```ts
const line = { productId: uuid(), quantity: 1, unitPriceCentavos: 1500 };
expect(SaleLineInput.safeParse({ ...line, custom: { name: "x", unitPriceCentavos: 100 } }).success).toBe(false);
expect(SaleInput.safeParse(sale({ items: Array(201).fill(line) })).success).toBe(false);
expect(SaleLineInput.safeParse({ ...line, quantity: 0 }).success).toBe(false);
expect(PaymentInput.safeParse({ method: "CASH" }).success).toBe(false);
for (const pin of ["111111", "123456", "654321", "12345", "abcdef"]) expect(PinSchema.safeParse(pin).success).toBe(false);
expect(PinSchema.safeParse("482915").success).toBe(true);
expect(CustomerInput.safeParse({ name: "Aling Rosa", phone: "09171234567" }).success).toBe(true);
expect(CustomerInput.safeParse({ name: "Aling Rosa", phone: "12345" }).success).toBe(false);
expect(ProductInput.parse({ ...product, name: "  Kape   3-in-1 " }).name).toBe("Kape 3-in-1");
expect(RestockInput.safeParse({ productId: uuid(), unitCostCentavos: 900 }).success).toBe(false);
// receipt
const lines = receiptLines(cashSale, { name: "Tindahan ni Mang Ben" });
expect(lines.every((l) => l.length <= 32)).toBe(true);
expect(lines).toContain("TOTAL".padEnd(22) + "₱45.50".padStart(10));
expect(receiptLines({ ...cashSale, pending: true, receiptNo: null }, store).join("\n")).toMatch(/PENDING SYNC/);
expect(receiptLines(utangSale, store).join("\n")).toMatch(/Utang balance/);
```

- [ ] **Step 2: Run** the shared tests — Expected: FAIL.
- [ ] **Step 3: Implement** the schemas, view types and `receiptLines` (header with store name and Manila date/time, `No. 0042` or `PENDING SYNC` + first 6 characters of the id uppercased, cashier, one line per item with quantity × price and the line total right-aligned, TOTAL, payment method, tendered and change for cash, "Utang balance" for utang, "Salamat po!"). PIN rule: refuse six identical digits and any strictly ascending or descending run.
- [ ] **Step 4: Run** the shared tests and `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): request schemas, view types and receipt lines`

### Task 4: API skeleton: config, errors, health, proxy signature

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/http/errors.ts`, `apps/api/src/http/parse.ts`, `apps/api/src/middleware/proxySignature.ts`, `apps/api/src/middleware/clientIp.ts`, `apps/api/src/routes/health.ts`, `apps/api/.env.example`
- Test: `apps/api/test/app.test.ts`, `apps/api/test/support/signing.ts`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config` (zod; `PORT` default 8080; `DATABASE_URL`; `JWT_SECRET`, `PROXY_SIGNING_SECRET`, `CLEANUP_SECRET`, `IP_HASH_SALT` each ≥32 chars; `SITE_ORIGIN` URL); `class AppError extends Error { constructor(code: ErrorCode, message: string, opts?: { field?: string; retryAfter?: string }) }`; `errorHandler: ErrorRequestHandler`; `parseBody<T>(schema: z.ZodType<T>, value: unknown): T`; `requireProxySignature(secret: string): RequestHandler`; `clientIp(req: Request): string`; `createApp(deps: AppDeps): Express` with `AppDeps = { config: Config; db: PrismaClient; now?: () => Date }`. Test helper `signNetlify(secret: string): Promise<string>` producing a valid `x-nf-sign` JWS.

- [ ] **Step 1: Write the failing tests**

```ts
const res = await request(app).get("/api/health");
expect(res.status).toBe(200); expect(res.body).toEqual({ ok: true });
expect(res.headers["access-control-allow-origin"]).toBe(config.SITE_ORIGIN);
const unsigned = await request(app).get("/api/me");
expect(unsigned.status).toBe(403); expect(unsigned.body.error.code).toBe("bad_proxy_signature");
const forged = await request(app).get("/api/me").set("x-nf-sign", await signNetlify("wrong-secret-".repeat(3)));
expect(forged.status).toBe(403);
const signed = await request(app).get("/api/me").set("x-nf-sign", await signNetlify(config.PROXY_SIGNING_SECRET));
expect(signed.status).toBe(401); // passes the proxy check, then needs auth
expect(signed.body).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });
const big = await request(app).post("/api/auth/login").set("x-nf-sign", sig).send({ username: "x".repeat(70_000) });
expect(big.status).toBe(400);
expect(() => loadConfig({ ...validEnv, JWT_SECRET: "short" })).toThrow();
```

- [ ] **Step 2: Run** `npm run test -w apps/api -- test/app.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the files. `createApp` applies `helmet()`, `express.json({ limit: "64kb" })` and `cookie-parser`, and disables `x-powered-by`. `requireProxySignature` uses `jose.jwtVerify(token, secretBytes, { algorithms: ["HS256"], issuer: "netlify" })`; `/api/health` is mounted before it with CORS for `SITE_ORIGIN` only; `clientIp` reads `x-nf-client-connection-ip`, then the first `x-forwarded-for` value, then the socket address (only trusted after the signature check); `errorHandler` maps `AppError` → its status, `ZodError` → 400 `invalid_input` with `field` = first issue path joined by `.`, body-parser size errors → 400 `invalid_input`, anything else → logged with pino and 503 `service_unavailable`. Placeholder `/api/me` returns 401 until Task 8 replaces it.
- [ ] **Step 4: Run** the API tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): Express skeleton with config, error format and Netlify proxy signature check`

### Task 5: Prisma schema, migration and test database

**Files:**
- Create: `docker-compose.yml` (service `db`: `postgres:17-alpine`, user/password/db `sari`/`sari`/`sari_test`, port `55433:5432`; service `api` built from `apps/api/Dockerfile`, added in Task 6), `apps/api/prisma.config.ts`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, `apps/api/src/db.ts`, `apps/api/test/support/db.ts`, `apps/api/test/support/factories.ts`, `apps/api/test/globalSetup.ts`
- Test: `apps/api/test/schema.test.ts`

**Interfaces:**
- Produces: `createDb(url: string): PrismaClient`; test helpers `testDb(): PrismaClient` (refuses non-local hosts), `resetDb(db: PrismaClient): Promise<void>` (TRUNCATE all tables CASCADE), `seedStore(db, opts?: { code?: string; expiresAt?: Date }): Promise<TestStore>` where `TestStore = { store, owner, bantay, categories, products: { id, priceCentavos, stock }[], customers: { id, creditLimitCentavos }[] }` (owner password `owner-pass-1234`, bantay PIN `482915`).
- Produces: Prisma models exactly as spec section 5 (`Store`, `User`, `Session`, `Category`, `Product`, `Customer`, `Sale`, `SaleItem`, `StockMovement`, `UtangEntry`, `DemoQuota`), Prisma enums for role, secret kind, sale source, payment method, movement reason and utang kind, `Sale.flags` as `String[]`, cascades and indexes from spec 5 (partial unique index on `Product(storeId, barcode) WHERE barcode IS NOT NULL` written in the migration SQL).

- [ ] **Step 1: Write the failing test**

```ts
await resetDb(db);
const t = await seedStore(db);
await db.store.delete({ where: { id: t.store.id } });
expect(await db.product.count()).toBe(0);           // cascade
expect(await db.user.count()).toBe(0);
await expect(createTwoProductsWithBarcode("2000000000015")).rejects.toThrow(); // unique per store
await expect(twoProductsNullBarcode()).resolves.toBeDefined();                 // nulls allowed
```

- [ ] **Step 2: Run** `docker compose up -d db` then `npm run test -w apps/api -- test/schema.test.ts` — Expected: FAIL (no schema).
- [ ] **Step 3: Implement** the schema and config, generate the migration with `npx prisma migrate dev --name init` against the local test DB, add the partial unique index to the SQL, run `npx prisma generate`. `globalSetup.ts` runs `prisma migrate deploy` on `TEST_DATABASE_URL`; `vitest.config.ts` sets `fileParallelism: false` for `test/**/*.test.ts` files that touch the DB.
- [ ] **Step 4: Run** the API tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): Prisma schema, initial migration and local test database`

### Task 6: Dockerfile, CI and the GitHub checkpoint

**Files:**
- Create: `apps/api/Dockerfile` (multi-stage on `node:24-alpine`: install workspaces, `prisma generate`, build shared and api, prune to production deps; final `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]`, non-root user, `EXPOSE 8080`), `.dockerignore`, `.github/workflows/ci.yml`
- Modify: `docker-compose.yml` (add `api` service with env from `apps/api/.env.example`-style test values, depends on `db`)

**Interfaces:**
- Produces: CI jobs `checks` (install, lint, typecheck, unit and component tests), `api` (Postgres 17 service on 55433, `prisma migrate deploy`, API tests), `image` (builds the Docker image and saves it as an artifact for `e2e`, added in Task 35).

- [ ] **Step 1: Verify locally** `docker build -f apps/api/Dockerfile -t sari-api .` — Expected: image builds. Then `docker compose up -d` and `curl -s localhost:8080/api/health` — Expected: `{"ok":true}`.
- [ ] **Step 2: Write `ci.yml`** with the three jobs above, Node 24, npm cache, and `concurrency` per branch.
- [ ] **Step 3: Commit** `ci: Docker image and GitHub Actions for checks and API tests`
- [ ] **Step 4: CHECKPOINT — ask Jomari** to approve creating the public GitHub repository `jomari18/sarisari-pos` and pushing this plan's commits to `main` from now on. Nothing deploys from these pushes until Task 37 connects Render and Netlify; from Task 37 on, every push that deploys needs its own approval. Do not continue past this step without a yes.
- [ ] **Step 5: Push** and watch the run — Expected: all CI jobs green.

## Milestone 2: Auth and demo stores

### Task 7: Hashing and tokens

**Files:**
- Create: `apps/api/src/services/hashing.ts`, `apps/api/src/services/tokens.ts`
- Test: `apps/api/test/tokens.test.ts`

**Interfaces:**
- Produces: `hashSecret(secret: string): Promise<string>`, `verifySecret(hash: string, secret: string): Promise<boolean>` (argon2id); `type AuthUser = { userId: string; storeId: string; role: Role }`; `signAccessToken(user: AuthUser, secret: string, now: Date): Promise<string>`; `verifyAccessToken(token: string, secret: string, now?: Date): Promise<AuthUser>` (throws `AppError("unauthenticated")`); `newRefreshToken(): { token: string; hash: string }` (32 random bytes base64url, SHA-256 hex); `hashRefreshToken(token: string): string`.

- [ ] **Step 1: Write the failing tests** — hash then verify true, wrong secret false; access token round trip returns the same `AuthUser`; a token verified 15 min + 1 s after issue rejects; a token signed with another secret rejects; `newRefreshToken()` gives 43-character base64url tokens and `hashRefreshToken(token) === hash`.
- [ ] **Step 2: Run** the test — Expected: FAIL.
- [ ] **Step 3: Implement** with `@node-rs/argon2` and `jose` (`SignJWT`, `setExpirationTime(now + 15 min)`, claims `sub`, `store`, `role`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): argon2id hashing and JWT access tokens`

### Task 8: Login, refresh rotation, logout and role middleware

**Files:**
- Create: `apps/api/src/services/auth.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/http/cookies.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/types/express.d.ts`
- Modify: `apps/api/src/app.ts` (mount routes, remove the Task 4 placeholder)
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: Task 7 functions; `seedStore` from Task 5.
- Produces: `type LoginResult = { accessToken: string; refreshToken: string; refreshExpiresAt: Date; user: UserView; store: StoreView }`; `startSession(db, config, user, store, now: Date): Promise<LoginResult>`; `login(db, config, input: LoginInput, now: Date): Promise<LoginResult>`; `refresh(db, config, token: string, now: Date): Promise<Omit<LoginResult, "user" | "store">>`; `logout(db, token: string, now: Date): Promise<void>`; `revokeUserSessions(db, userId: string, now: Date): Promise<void>`; middleware `requireAuth(secret: string): RequestHandler` (sets `req.user: AuthUser`) and `requireRole(...roles: Role[]): RequestHandler`; `REFRESH_COOKIE = "__Host-sari_refresh"`, `setRefreshCookie(res, token, expiresAt)`, `clearRefreshCookie(res)`. Routes `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/me`.

- [ ] **Step 1: Write the failing tests**
  - `login ok`: 200 with `accessToken`, `user.role === "OWNER"`, and `set-cookie` containing `__Host-sari_refresh=`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
  - `wrong secret and unknown user`: both 401 with the same body `{ error: { code: "invalid_credentials", message } }`.
  - `lockout`: 5 wrong PINs for the bantay, then the right PIN → 423 `account_locked` with `retryAfter`; with `now` + 15 min + 1 s → 200.
  - `refresh needs the header`: without `X-Requested-With: sari-pos` → 403 `forbidden`.
  - `rotation`: refresh with cookie A → new cookie B; refresh with A again → 401 and B now also 401 (family revoked).
  - `logout`: then refresh → 401.
  - `deactivated user`: `active=false` → login 401 `invalid_credentials`.
  - `expired store`: refresh after `store.expiresAt` → 401 `session_expired`.
  - `/api/me` with a bearer token → user and store; bantay token on a route wrapped in `requireRole("OWNER")` (test-only route) → 403 `forbidden`.
  - `rate limit`: the 21st login request from one client IP within 15 minutes → 429 `rate_limited` with `retryAfter`, whatever the username.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Add `apps/api/src/middleware/rateLimit.ts` with `loginLimiter` (`express-rate-limit`, 20 per 15 min, key = `clientIp(req)`, in-memory store, JSON error body). Lockout increments `failedAttempts`, sets `lockedUntil = now + 15 min` at the 5th failure and resets on success; sessions store only the token hash, `familyId` shared by rotations, `expiresAt = store.expiresAt`; reuse of a replaced token revokes every session with that `familyId`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): login with lockout, rotating refresh sessions and role middleware`

### Task 9: Deterministic demo data generator

**Files:**
- Create: `apps/api/src/seed/random.ts` (mulberry32), `apps/api/src/seed/catalogData.ts` (8 categories, 60 product templates with generic names and fictional brands, unit, price, cost, reorder level, pack size, popularity weight), `apps/api/src/seed/generateDemo.ts`
- Test: `apps/api/test/generateDemo.test.ts`

**Interfaces:**
- Produces: `generateDemoData(opts: { seed: number; storeCode: string; now: Date }): DemoData` with `DemoData = { categories: SeedCategory[]; products: SeedProduct[]; customers: SeedCustomer[]; sales: SeedSale[]; movements: SeedMovement[]; utangEntries: SeedUtang[] }`, each referencing others by array index, with final `stock` and `balanceCentavos` already computed.

- [ ] **Step 1: Write the failing tests** — same seed gives deep-equal output, different seed differs; counts: 8 categories, 60 products, 12 customers, 30 Manila days with 25–60 sales each; every barcode `isValidEan13` and starts with `"2"`, all unique; for every product `stock === sum(movements.change)` and stock ≥ 0; for every customer `balance === sum(entries)` and `0 ≤ balance ≤ creditLimit`; utang sales only for customers with `creditLimit > 0`; no `soldAt` after `now`; the busiest Manila hours are within 16–20; receipt numbers are 1..N in `soldAt` order.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the generator: opening `RESTOCK` movement per product 31 days before `now`, then sales with weighted product choice, mostly cash, some GCash, some utang within limits, occasional payments.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): deterministic demo store data generator`

### Task 10: Demo store creation, limits and cleanup

**Files:**
- Create: `apps/api/src/services/ipHash.ts`, `apps/api/src/services/demo.ts`, `apps/api/src/routes/demo.ts`, `apps/api/src/routes/admin.ts`
- Test: `apps/api/test/demo.test.ts`

**Interfaces:**
- Consumes: `generateDemoData` (Task 9), `startSession` (Task 8), `hashSecret` (Task 7).
- Produces: `ipHash(ip: string, salt: string): string`; `createDemoStore(db, config, ipHash: string, now: Date): Promise<LoginResult & { demoLogins: DemoLogins; expiresAt: Date }>`; `deleteExpiredStores(db, now: Date, limit?: number): Promise<number>` (default limit 20). Routes `POST /api/demo` (201, sets the refresh cookie) and `POST /api/admin/cleanup` (header `x-cleanup-secret`, timing-safe compare; 200 `{ deleted }`).

- [ ] **Step 1: Write the failing tests**
  - `POST /api/demo` → 201 with `demoLogins.owner.username` matching `/^mayari\.[a-z2-9]{4}$/`, a 16-character password, `demoLogins.bantay.username` `/^nena\.[a-z2-9]{4}$/`, a PIN that passes `PinSchema`, `store.name === "Tindahan ni Mang Ben"`, and `expiresAt` = `now` + 24 h; logging in with the returned owner and bantay logins works.
  - The 6th demo from the same IP on the same Manila day → 429 `demo_limit`; the next Manila day → 201.
  - With 200 unexpired stores → 503 `demo_full`.
  - An expired store and all its rows are deleted when the next demo is created.
  - `/api/admin/cleanup` with a wrong secret → 403 `forbidden`; with the right secret → `{ deleted: 1 }`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Store code alphabet `abcdefghjkmnpqrstuvwxyz23456789`, retry on a unique conflict; insert the generated data with `createMany` in batches of 1000 inside one transaction; set `nextReceiptNo` to the number of seeded sales + 1; `DemoQuota` upsert per `(ipHash, manilaDate(now))`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): demo stores with per-IP and global limits and cleanup`

## Milestone 3: Selling core

### Task 11: Sale rules (pure domain)

**Files:**
- Create: `apps/api/src/domain/saleRules.ts`
- Test: `apps/api/test/saleRules.test.ts`

**Interfaces:**
- Produces: `lineTotal(quantity: number, unitPriceCentavos: number): number`; `saleTotal(lines: { quantity: number; unitPriceCentavos: number }[]): number`; `resolveSoldAt(soldAt: Date, receivedAt: Date, storeCreatedAt: Date): { soldAt: Date; adjusted: boolean }`; `saleFlags(input: { lines: { productId: string | null; unitPriceCentavos: number; currentPriceCentavos: number | null; stockAfter: number | null }[]; overCreditLimit: boolean; clockAdjusted: boolean }): SaleFlag[]` (unique, sorted).

- [ ] **Step 1: Write the failing tests** — totals; `resolveSoldAt` keeps a time within 10 min ahead of `receivedAt`, adjusts one 11 min ahead and one before `storeCreatedAt − 1 min`; flags: custom line → `CUSTOM_ITEM`; price ≠ current → `PRICE_CHANGED`; `stockAfter < 0` → `NEGATIVE_STOCK`; over limit → `OVER_CREDIT_LIMIT`; adjusted → `CLOCK_ADJUSTED`; no issues → `[]`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): sale totals, sold-at resolution and flag rules`

### Task 12: Catalog reads with role shaping

**Files:**
- Create: `apps/api/src/services/catalog.ts`, `apps/api/src/routes/catalog.ts`
- Test: `apps/api/test/catalog.test.ts`

**Interfaces:**
- Produces: `toProductView(row: Product, role: Role): ProductView` (no `costCentavos` for `BANTAY`); `getCatalog(db, user: AuthUser, now: Date): Promise<CatalogSnapshot>`; `listProducts(db, user, query: { search?: string; categoryId?: string; status?: "active" | "archived"; lowStock?: boolean }): Promise<ProductView[]>`; `findByBarcode(db, user, code: string): Promise<ProductView>`; `listCategories(db, user): Promise<CategoryView[]>`. Routes `GET /api/catalog`, `GET /api/products`, `GET /api/products/barcode/:code`, `GET /api/categories`.

- [ ] **Step 1: Write the failing tests** — catalog has only active products, all categories and all suki with balances; bantay responses contain no `costCentavos` key anywhere (deep check); owner responses do; search is case-insensitive and accent-insensitive on name and brand (use Postgres `unaccent` + `ILIKE`; the migration in this task enables the `unaccent` extension); `lowStock=true` returns stock ≤ reorder level; unknown barcode → 404 `not_found`; a product id from another store → 404.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (add migration `enable_unaccent`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): catalog snapshot and product reads with role shaping`

### Task 13: Online sales (all-or-nothing, idempotent)

**Files:**
- Create: `apps/api/src/services/sales.ts`, `apps/api/src/routes/sales.ts`, `apps/api/src/services/saleView.ts`
- Test: `apps/api/test/sales.test.ts`

**Interfaces:**
- Consumes: Task 11 rules, Task 12 `toProductView`.
- Produces: `createSale(db, user: AuthUser, input: SaleInput, mode: "online" | "sync", now: Date): Promise<{ sale: SaleView; duplicate: boolean }>`; `listSales(db, user, query: { date?: string; cashierId?: string }): Promise<SaleView[]>`; `getSale(db, user, id: string): Promise<SaleView>`; `toSaleView(row): SaleView`. Routes `POST /api/sales` (201 new, 200 duplicate), `GET /api/sales`, `GET /api/sales/:id`.

- [ ] **Step 1: Write the failing tests**
  - cash sale → 201, `receiptNo` 1 then 2, `changeCentavos` correct, stock decremented, one `SALE` movement per product line with `stockAfter`.
  - same `id` again → 200 with `duplicate`, stock unchanged, one sale row.
  - `totalCentavos` that does not match the lines → 400 `invalid_input`, `field: "totalCentavos"`.
  - utang sale over the limit (online) → 409 `credit_limit_exceeded` with the spec message, and afterwards no sale, no items, no movements, stock and balance unchanged, and the next sale still gets `receiptNo` 1 (all-or-nothing).
  - utang within the limit → balance increased, `CHARGE` entry with `balanceAfter`, `sale.customer.balanceAfterCentavos` set.
  - custom item → `CUSTOM_ITEM` flag, no movement for that line.
  - stale price → `PRICE_CHANGED`; selling beyond stock → `NEGATIVE_STOCK` and negative stock.
  - archived product online → 400 `invalid_input`.
  - two concurrent sales of the last piece → both 201, final stock −1, at least one has `NEGATIVE_STOCK`.
  - two concurrent requests with the same `id` → one 201, one 200, one row.
  - bantay `GET /api/sales` → only own sales of the Manila day; bantay `GET /api/sales/:id` of another cashier → 404; owner sees all.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `createSale` in one `db.$transaction`: duplicate check by id within the store; validate products belong to the store; compare totals; `resolveSoldAt`; `store.update({ nextReceiptNo: { increment: 1 } })` and use the previous value; create the sale and items (snapshot name, price, cost); `product.update({ stock: { decrement } })` per product line and write movements; for utang `customer.update({ balanceCentavos: { increment } })`, then if `mode === "online"` and the new balance exceeds the limit throw `AppError("credit_limit_exceeded")`; write the `CHARGE`; compute and save flags. Catch Prisma `P2002` on the sale id and return the stored sale as a duplicate.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): all-or-nothing idempotent sales with stock and utang effects`

### Task 14: Offline sync endpoint

**Files:**
- Modify: `apps/api/src/services/sales.ts` (add `syncSales`), `apps/api/src/routes/sales.ts`
- Test: `apps/api/test/sync.test.ts`

**Interfaces:**
- Produces: `syncSales(db, user: AuthUser, batch: SaleInput[], now: Date): Promise<SyncResult[]>`; route `POST /api/sales/sync` (200 with results in input order).

- [ ] **Step 1: Write the failing tests** — 3 sales → `accepted` with ascending receipt numbers in batch order; a repeated id in the same batch → second `duplicate`; over-limit utang → `accepted` with `OVER_CREDIT_LIMIT`; a sale with an unknown product → `invalid` with `error.code === "invalid_input"` while the others are accepted; an archived product → accepted; 101 sales → 400; **(Review Focus 1)** `soldAt` 2 h after the server time → accepted, stored `soldAt` equals the server time, flag `CLOCK_ADJUSTED`; `soldAt` a year before the store was created → same.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** by calling `createSale(..., "sync", now)` per sale in order (each in its own transaction), mapping `AppError` to `invalid` results.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): ordered, lenient offline sync for queued sales`

### Task 15: Voids and the review list

**Files:**
- Create: `apps/api/src/services/review.ts`, `apps/api/src/routes/review.ts`
- Modify: `apps/api/src/services/sales.ts` (add `voidSale`), `apps/api/src/routes/sales.ts`
- Test: `apps/api/test/void-review.test.ts`

**Interfaces:**
- Produces: `voidSale(db, user, saleId: string, reason: string, now: Date): Promise<SaleView>`; `listReview(db, user): Promise<SaleView[]>` (flagged, not reviewed, not voided); `markReviewed(db, user, saleId: string, now: Date): Promise<void>`. Routes `POST /api/sales/:id/void` (owner, body `{ reason }` 3..120), `GET /api/review` (owner), `POST /api/review/:saleId/done` (owner).

- [ ] **Step 1: Write the failing tests** — owner voids a product sale → stock restored with `VOID` movements, `voidedAt` and reason set; voiding an utang sale writes a `VOID` entry that reverses the charge; voiding twice → 409 `already_voided`; a custom line gets no movement; bantay → 403; review lists a `NEGATIVE_STOCK` sale and a `CUSTOM_ITEM` sale, `done` removes it from the list.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** in transactions.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): owner voids and the needs-review list`

### Task 16: Suki and the utang ledger

**Files:**
- Create: `apps/api/src/domain/aging.ts`, `apps/api/src/services/utang.ts`, `apps/api/src/routes/customers.ts`
- Test: `apps/api/test/aging.test.ts`, `apps/api/test/utang.test.ts`

**Interfaces:**
- Produces: `agingBuckets(entries: { kind: UtangKind; amountCentavos: number; createdAt: Date }[], now: Date): { d0to7: number; d8to30: number; d31plus: number; oldestUnpaidDays: number | null }` (payments and negative adjustments pay the oldest charges first); `listCustomers`, `createCustomer`, `updateCustomer`, `getLedger`, `recordPayment`, `adjustBalance`, `reminderText(customer: { name: string; balanceCentavos: number }, store: { name: string }): string`. Routes per spec 8.5.

- [ ] **Step 1: Write the failing tests**
  - aging: charges ₱100 (40 days ago), ₱50 (10 days), ₱30 (2 days), payment ₱120 → `{ d0to7: 3000, d8to30: 3000, d31plus: 0, oldestUnpaidDays: 10 }`; fully paid → all zero and `null`.
  - bantay creates a suki → `creditLimitCentavos === 0`; bantay patch of `creditLimitCentavos` → 403; owner patch → 200.
  - payment → balance down, `PAYMENT` entry with `balanceAfter`; same payment id again → 200, applied once; more than the balance → 400 `overpayment`.
  - owner adjustment ±; bantay → 403.
  - `reminderText({ name: "Aling Rosa", balanceCentavos: 32000 }, { name: "Tindahan ni Mang Ben" })` → `"Hi Aling Rosa, paalala lang po sa utang ninyo na ₱320.00 sa Tindahan ni Mang Ben. Salamat po!"`.
  - another store's customer id → 404.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): suki, utang ledger, payments and FIFO aging`

## Milestone 4: Owner tools

### Task 17: Product and category writes

**Files:**
- Create: `apps/api/src/routes/products.ts`, `apps/api/src/routes/categories.ts`
- Modify: `apps/api/src/services/catalog.ts` (add writes)
- Test: `apps/api/test/products.test.ts`

**Interfaces:**
- Produces: `createProduct(db, user, input: ProductInput): Promise<ProductView>`, `updateProduct(db, user, id: string, patch: ProductPatch): Promise<ProductView>`, `setArchived(db, user, id: string, archived: boolean)`, `createCategory`, `updateCategory`. Routes per spec 8.3 (owner only).

- [ ] **Step 1: Write the failing tests** — create a new-brand product and see it in `GET /api/catalog`; duplicate barcode in the same store → 400 `invalid_input`, `field: "barcode"`; the same barcode in another store → 201; patch with an old `expectedUpdatedAt` → 409 `stale_edit`; archive hides it from the catalog, unarchive restores it; the 301st product → 409 `limit_reached`; duplicate category name → 400 `field: "name"`; bantay → 403.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (stale check: `updateMany({ where: { id, storeId, updatedAt: expected } })` count 0 → 409).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): owner product and category management`

### Task 18: Restock, counts and stock history

**Files:**
- Create: `apps/api/src/services/stock.ts`, `apps/api/src/routes/stock.ts`
- Test: `apps/api/test/stock.test.ts`

**Interfaces:**
- Produces: `restock(db, user, input: RestockInput, now: Date): Promise<ProductView>`, `adjustStock(db, user, input: AdjustInput, now: Date): Promise<ProductView>`, `listMovements(db, user, productId: string)`, `restockList(db, user): Promise<{ items: ProductView[]; text: string }>`. Routes `POST /api/stock/restock`, `POST /api/stock/adjust`, `GET /api/products/:id/movements`, `GET /api/stock/restock-list` (owner).

- [ ] **Step 1: Write the failing tests** — pack size 20, 2 boxes + 5 pieces → +45 and cost updated; count 7 when recorded 10 → `COUNT` −3 and stock 7; spoilage 2 → `SPOILAGE` −2; movements newest first with `stockAfter`; restock list ordered by largest shortage, `text` lines like `- Kape 3-in-1 (Sikat): 3 left, reorder at 10`; bantay → 403.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): restock, stock counts, spoilage and restock list`

### Task 19: Staff accounts

**Files:**
- Create: `apps/api/src/services/staff.ts`, `apps/api/src/routes/staff.ts`
- Test: `apps/api/test/staff.test.ts`

**Interfaces:**
- Consumes: `revokeUserSessions` (Task 8).
- Produces: `listStaff`, `addBantay(db, user, input: StaffInput): Promise<UserView>` (username `slug(displayName).storeCode`, slug = lowercase ASCII letters only, max 12, digit suffix on collision), `updateStaff(db, user, id: string, patch: StaffPatch, now: Date)`. Routes `GET/POST /api/staff`, `PATCH /api/staff/:id` (owner).

- [ ] **Step 1: Write the failing tests** — "Nena" → `nena2.<code>` when `nena.<code>` exists; trivial PIN → 400 `field: "pin"`; 6th bantay → 409 `limit_reached`; PIN reset → old PIN fails, new works; deactivate → login 401 and the existing refresh cookie → 401; bantay → 403.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): bantay accounts managed by the owner`

### Task 20: Reports

**Files:**
- Create: `apps/api/src/services/reports.ts`, `apps/api/src/routes/reports.ts`
- Test: `apps/api/test/reports.test.ts`, `apps/api/test/support/reportFixture.ts`

**Interfaces:**
- Produces: `summary(db, user, range: "today" | "7d" | "30d", now: Date)` → `{ salesCentavos, count, byMethod: Record<PaymentMethod, number>, expectedCashCentavos, profitCentavos, profitExcludesCustom: true }`; `productReport(db, user, range, now)` → `{ bestByQuantity, bestByProfit, slowMovers }` (top 10 each; slow movers = active products with no sales in the range); `hourly(db, user, date: string)` → 24 buckets `{ hour, count, salesCentavos }`; `utangReport(db, user, now)` → `{ totalCentavos, top: CustomerView[], aging }`; `myShift(db, user, now)` → `{ count, byMethod }`. Routes per spec 8.6.

- [ ] **Step 1: Write the failing tests** with a fixture of known sales on two Manila days (including a voided sale, a custom item, a cash utang payment, and sales at 23:59 and 00:01 Manila): exact `salesCentavos`, `count`, `byMethod`, `expectedCashCentavos` (cash sales + cash utang payments), `profitCentavos` (excludes voided and custom lines); 7d and 30d ranges; hourly buckets by Manila hour; utang totals and aging; bantay `my-shift` counts only own sales; bantay on owner reports → 403.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with SQL aggregates using `AT TIME ZONE 'Asia/Manila'` (Prisma `$queryRaw` with parameters).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): sales, profit, product, hourly and utang reports`

### Task 21: Permission and isolation matrix

**Files:**
- Create: `apps/api/test/support/routes.ts` (table of every route: method, path template, owner-only flag, sample body), `apps/api/test/permissions.test.ts`

**Interfaces:**
- Consumes: every route from Tasks 8–20 and `seedStore` twice (stores A and B).

- [ ] **Step 1: Write the test** — for every row: no token → 401 `unauthenticated`; bantay on an owner-only row → 403 `forbidden`; an owner of store A using ids from store B → 404 `not_found` (rows with an `:id`); unsigned request → 403 `bad_proxy_signature`. A final assertion compares the table with the routes registered on the Express app so a new route cannot skip the matrix.
- [ ] **Step 2: Run** — Expected: PASS if Tasks 8–20 are right; any failure is a real permission bug to fix in the owning service.
- [ ] **Step 3: Commit** `test(api): permission and store isolation matrix for every route`

## Milestone 5: Web app

### Task 22: Web scaffold, theme tokens and layout

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts` (alias `@sari/shared`; dev proxy `/api` → `http://localhost:8080` that adds `x-nf-sign` from `apps/web/dev/proxySign.ts` using the local `PROXY_SIGNING_SECRET`), `apps/web/index.html`, `apps/web/public/theme-init.js`, `apps/web/src/main.tsx`, `apps/web/src/styles/theme.css` (tokens from spec 11.2 under `:root[data-theme="dark"]` and `:root[data-theme="light"]`, Tailwind `@theme inline` mapping, Poppins via `@fontsource/poppins` 400/500/600), `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/SideRail.tsx`, `apps/web/src/app/TopBar.tsx`, `apps/web/src/app/ThemeToggle.tsx`, `apps/web/vitest.config.ts`
- Test: `apps/web/test/tokens.test.ts`, `apps/web/test/shell.test.tsx`

**Interfaces:**
- Produces: routes `/`, `/login`, `/app` (owner → dashboard, bantay → POS), `/app/pos`, `/app/sales`, `/app/products`, `/app/products/new`, `/app/products/:id`, `/app/categories`, `/app/stock/restock`, `/app/stock/count`, `/app/suki`, `/app/suki/:id`, `/app/reports`, `/app/review`, `/app/staff`, `/app/shift`, `/app/settings`, `/barcodes`, `/credits`, `*`; `ThemeToggle` (localStorage key `sari-theme`, sets `data-theme` on `<html>`); `SideRail` items by role (owner: Dashboard, POS, Sales, Products, Suki, Reports, Review, Staff, with Restock and Count reached from Products; bantay: POS, Suki, My shift), active item uses `--accent` background and `--accent-ink` text, as in the reference layout.

- [ ] **Step 1: Write the failing tests** — `tokens.test.ts` parses `theme.css`, extracts both themes, and asserts every text token (`--text`, `--muted`, `--accent`, `--success`, `--danger`, `--warning`) reaches ≥ 4.5:1 on `--bg`, `--surface` and `--raised`, and `--accent-ink` on `--accent` ≥ 4.5:1; `shell.test.tsx`: bantay sees exactly POS, Suki, My shift; owner sees all eight; the toggle switches `data-theme` and stores it.
- [ ] **Step 2: Run** `npm run test -w apps/web` — Expected: FAIL.
- [ ] **Step 3: Implement** the scaffold, matching the reference: left rail 140 px with icon over label, 12 px radius cards, dark default; phones get a top bar with a menu drawer.
- [ ] **Step 4: Run** the web tests and `npm run build -w apps/web` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Vite React scaffold with reference layout and AA-checked tokens`

### Task 23: API client, session, login and demo welcome

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/auth/session.ts`, `apps/web/src/features/auth/LoginPage.tsx`, `apps/web/src/features/demo/DemoLoginsCard.tsx`, `apps/web/src/features/demo/DemoBanner.tsx`
- Test: `apps/web/test/client.test.ts`, `apps/web/test/login.test.tsx`

**Interfaces:**
- Produces: `class ApiError extends Error { code: ErrorCode; status: number; field?: string; retryAfter?: string }`; `api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>` (bearer, JSON, one refresh-and-retry on 401); `refreshSession(): Promise<boolean>`; session store `getSession(): Session | null`, `setSession(s: Session)`, `clearSession()`, `useSession()` with `Session = { accessToken: string; user: UserView; store: StoreView; demoLogins?: DemoLogins }` (access token in memory; `user`, `store` and `demoLogins` also saved in localStorage key `sari-device` for the offline device session); `loginWith(username: string, secret: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — a 401 triggers one refresh with header `X-Requested-With: sari-pos` and a retry with the new token; a second 401 clears the session and redirects to `/login` showing "Your session ended. Please sign in again."; login shows the server's `invalid_credentials` message; `DemoLoginsCard` shows both logins and "Switch to bantay" signs in with the stored bantay login; `DemoBanner` renders "Demo store, deleted in 23 h" for an expiry 23.5 h away.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): API client with refresh, session store, login and demo logins`

### Task 24: POS screen and cart

**Files:**
- Create: `apps/web/src/features/pos/cart.ts`, `apps/web/src/features/pos/search.ts`, `apps/web/src/features/pos/PosScreen.tsx`, `apps/web/src/features/pos/ProductGrid.tsx`, `apps/web/src/features/pos/CategoryTabs.tsx`, `apps/web/src/features/pos/CartPanel.tsx`, `apps/web/src/features/pos/CustomItemDialog.tsx`, `apps/web/src/features/catalog/useCatalog.ts`
- Test: `apps/web/test/cart.test.ts`, `apps/web/test/pos.test.tsx`

**Interfaces:**
- Produces: `type CartLine = { key: string; productId: string | null; name: string; unitPriceCentavos: number; quantity: number; stock: number | null }`; `cartReducer(state: CartLine[], action: CartAction): CartLine[]` with actions `add(product)`, `addCustom(name, unitPriceCentavos)`, `setQuantity(key, quantity)`, `remove(key)`, `clear()`; `cartTotal(lines): number`; `searchProducts(products: ProductView[], query: string): ProductView[]` (matches `searchKey` of name and brand, then barcode prefix); `useCatalog(): { data?: CatalogSnapshot; isOffline: boolean }` (online fetch of `/api/catalog`; Task 29 adds the offline fallback).

- [ ] **Step 1: Write the failing tests** — adding the same product twice gives quantity 2; quantity 0 removes the line; custom items never merge; **(Review Focus 2)** `searchProducts` with "nino" finds "Niño Biscuit" and with "  KAPE " finds "Kape 3-in-1"; quantity above recorded stock shows "Only 2 left in records"; keyboard: `/` focuses search, Enter adds the first result, `+` and `−` change the selected line's quantity, `F9` opens payment; the custom item dialog adds a line marked "Custom".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the reference "Orders" layout adapted to POS: category tiles and product cards on the left, cart panel on the right (desktop), bottom sheet with the total on phones.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): POS screen with search, categories, cart and custom items`

### Task 25: Payment, sale submission and receipt

**Files:**
- Create: `apps/web/src/features/pos/PaymentDialog.tsx`, `apps/web/src/features/pos/submitSale.ts`, `apps/web/src/features/receipt/ReceiptView.tsx`, `apps/web/src/features/receipt/receiptPng.ts`, `apps/web/src/features/receipt/print.css`
- Test: `apps/web/test/payment.test.tsx`, `apps/web/test/receipt.test.tsx`

**Interfaces:**
- Consumes: `receiptLines` (Task 3), cart (Task 24), `api` (Task 23).
- Produces: `buildSaleInput(id: string, lines: CartLine[], payment: PaymentInput, now: Date): SaleInput`; `type SaleSubmitter = (sale: SaleInput) => Promise<{ sale: SaleView; queued: boolean }>`; `onlineSubmitter: SaleSubmitter` (POST `/api/sales`); `renderReceiptPng(lines: string[]): Promise<Blob>`; `shareReceipt(blob: Blob, fileName: string): Promise<"shared" | "downloaded">`.

- [ ] **Step 1: Write the failing tests** — quick amounts ₱20, ₱50, ₱100, ₱500, ₱1000 and "Exact" set the tendered amount and show the change; "Complete sale" is disabled while tendered < total; GCash accepts an optional reference; utang shows the suki's balance and limit and, when `balance + total > limit`, shows "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit." and disables completing; **(Review Focus 4)** double-clicking "Complete sale" and a retry after a network error both send the same sale `id`, and only one request is in flight at a time; a 409 `credit_limit_exceeded` from the API shows the same message; the receipt shows `No.` for online sales and "Pending sync" for queued ones; Print calls `window.print()`; Share falls back to download when `navigator.share` is missing.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** The sale id is created with `crypto.randomUUID()` when the payment dialog opens and kept until the sale succeeds or the cart changes. `print.css` uses `@page { size: 58mm auto; margin: 0 }` and a 32-character monospace block.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): payment with sukli, idempotent submission and printable, shareable receipts`

### Task 26: Inventory screens

**Files:**
- Create: `apps/web/src/features/inventory/{ProductsPage,ProductForm,CategoriesPage,RestockPage,CountPage,MovementsPanel,RestockListButton}.tsx`
- Test: `apps/web/test/inventory.test.tsx`

**Interfaces:**
- Consumes: product, category and stock routes (Tasks 12, 17, 18).

- [ ] **Step 1: Write the failing tests** — the products list filters by category, status and low stock (reference "Inventory" layout: filter panel left, rows right); the form validates with `ProductInput` and shows field errors from the API (`barcode` duplicate); a 409 `stale_edit` shows "This product was changed on another device. Reload to see the latest." with a Reload button; "New category" works inline from the form; restock accepts boxes and pieces and previews the new stock; the count page shows the difference before saving; "Copy restock list" copies the API `text`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): products, categories, restock, counts and stock history`

### Task 27: Suki screens

**Files:**
- Create: `apps/web/src/features/suki/{SukiListPage,SukiLedgerPage,PaymentForm,LimitForm,ReminderButton}.tsx`
- Test: `apps/web/test/suki.test.tsx`

**Interfaces:**
- Consumes: customer routes (Task 16).

- [ ] **Step 1: Write the failing tests** — the list shows balance, limit and "Oldest unpaid: 10 days"; the ledger lists charges (linked to receipts), payments and adjustments; the payment form refuses more than the balance; only the owner sees the limit form; "Copy reminder" copies the API text; the bantay can add a suki and sees "Credit limit: ₱0.00 (the owner sets it)".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): suki list, utang ledger, payments and reminders`

### Task 28: Dashboard, reports, review, staff, shift and settings

**Files:**
- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/features/sales/{SalesPage,SaleDetail,VoidDialog}.tsx`, `apps/web/src/features/reports/{ReportsPage,BarSpark,HourlyChart,TrendChart}.tsx`, `apps/web/src/features/review/ReviewPage.tsx`, `apps/web/src/features/staff/StaffPage.tsx`, `apps/web/src/features/shift/MyShiftPage.tsx`, `apps/web/src/features/settings/SettingsPage.tsx`
- Test: `apps/web/test/dashboard.test.tsx`, `apps/web/test/charts.test.tsx`

**Interfaces:**
- Consumes: report, review, staff and sales routes (Tasks 15, 19, 20).
- Produces: `BarSpark({ values: number[]; label: string })` and `HourlyChart({ buckets })` as accessible SVG (`role="img"` with a text summary), styled like the reference's green bar cards; `TrendChart` for the 30-day line like the reference "Overview".

- [ ] **Step 1: Write the failing tests** — the dashboard shows today's sales, expected cash, low stock count and the review count as cards; `BarSpark` exposes an accessible label such as "Sales for the last 7 days, highest ₱3,200.00 on Thursday"; the profit card notes "Custom items are not included"; review rows open the sale and "Add to inventory" pre-fills the product form for a custom item; the Sales page lists the day's sales (date picker, cashier filter), opens a sale with its receipt, and "Void sale" asks for a reason (3–120 characters) and confirmation, then shows the sale as voided; staff can add a bantay (PIN rules shown), reset a PIN and deactivate; My shift shows only the bantay's totals; settings has the theme toggle and logout.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** following the reference "Dashboard" and "Reports" frames.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): dashboard, reports, review, staff, shift and settings`

## Milestone 6: Offline and scanner

### Task 29: Offline catalog, sales queue and sync engine

**Files:**
- Create: `apps/web/src/offline/db.ts` (Dexie tables `catalog` and `outbox`), `apps/web/src/offline/outbox.ts`, `apps/web/src/offline/syncEngine.ts`, `apps/web/src/offline/status.ts`, `apps/web/src/offline/SyncBadge.tsx`, `apps/web/src/offline/CouldntSyncList.tsx`, `apps/web/src/offline/StoreEndedScreen.tsx`
- Modify: `apps/web/src/features/catalog/useCatalog.ts` (save and fall back to the snapshot), `apps/web/src/features/pos/submitSale.ts` (queue when offline or on network failure), `apps/web/src/features/settings/SettingsPage.tsx` (logout warning)
- Test: `apps/web/test/syncEngine.test.ts`, `apps/web/test/offlinePos.test.tsx` (with `fake-indexeddb`)

**Interfaces:**
- Produces: `enqueueSale(sale: SaleInput): Promise<void>`; `flush(): Promise<{ sent: number; flagged: number; failed: number }>` (batches of 100 in order, removes `accepted` and `duplicate`, marks `invalid` as failed with the reason); `pendingCount(): Promise<number>`; `startSyncLoop(): () => void` (runs on `online`, focus and every 30 s with backoff); `useSyncStatus(): { state: "online" | "offline" | "syncing"; pending: number }`; `offlineSubmitter: SaleSubmitter` (online first, queue on `TypeError` or offline).

- [ ] **Step 1: Write the failing tests** — offline sale is queued and the receipt says "Pending sync"; the badge shows "Offline: sales will sync", then "Syncing 3 sales…", then "Online"; `flush` sends 150 queued sales as two batches in order and empties the queue; an `invalid` result moves the sale to "Couldn't sync" with "Try again" and "Remove" (confirmation); the catalog shows "as of 10:42 AM" from the saved snapshot when offline; utang payments and product edits show "Needs internet" while offline; logout with 3 pending shows "3 sales not yet synced" before clearing; when refresh returns 401 `unauthenticated` (session revoked, store still active), the loop pauses and shows "Sign in to send 3 queued sales", and after signing in `flush` runs; **(Review Focus 5)** when refresh returns 401 `session_expired` (store deleted), the loop stops and `StoreEndedScreen` shows "This demo store has ended. Unsynced sales can't be sent." with "Start a new demo" and "Clear this device".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): offline catalog, sales queue and ordered sync`

### Task 30: PWA shell and offline device session

**Files:**
- Modify: `apps/web/vite.config.ts` (vite-plugin-pwa `generateSW`, `navigateFallback: "/index.html"`, `navigateFallbackDenylist: [/^\/api\//]`, no runtime caching for `/api`, manifest name, short name, theme `#111315`, icons from Task 34), `apps/web/src/auth/session.ts` (restore `sari-device` offline)
- Test: `apps/web/test/pwa.test.ts`, `apps/web/test/deviceSession.test.tsx`

**Interfaces:**
- Produces: `restoreDeviceSession(): Session | null` (profile without an access token; POS usable for queued selling).

- [ ] **Step 1: Write the failing tests** — the built service worker precaches `index.html`, JS, CSS and fonts and has no `/api` route (read `dist/sw.js` after `vite build`); opening the app offline with a saved device session lands on the POS with the offline badge; with no saved session it shows the login page with "You're offline. Sign in when you're back online."
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): installable PWA shell and offline device session`

### Task 31: Barcode scanner and sample barcodes

**Files:**
- Create: `apps/web/src/features/scanner/scanner.ts`, `apps/web/src/features/scanner/ScannerDialog.tsx`, `apps/web/src/features/scanner/UnknownBarcodeSheet.tsx`, `apps/web/src/features/barcodes/SampleBarcodesPage.tsx`, `apps/web/src/features/barcodes/Ean13Svg.tsx`
- Test: `apps/web/test/scanner.test.tsx`

**Interfaces:**
- Consumes: `ean13Modules` (Task 2), `findByBarcode` route (Task 12).
- Produces: `startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<{ stop(): void; engine: "native" | "zxing" }>` (native `BarcodeDetector` with `ean_13`, `ean_8`, `upc_a`; otherwise `await import("@zxing/browser")`).

- [ ] **Step 1: Write the failing tests** — with a fake `BarcodeDetector` the engine is `"native"` and a detected code adds the product to the cart; without it the zxing module is imported only when the dialog opens; closing stops every camera track; an unknown code shows "Not in your products" with "Add product" for the owner (barcode pre-filled) and "Sell as custom item" for the bantay; the sample page renders each demo barcode as an SVG with 95 modules plus the digits.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): camera barcode scanner with fallback and sample barcodes`

## Milestone 7: Landing and 3D

### Task 32: Landing page and the wake-up flow

**Files:**
- Create: `apps/web/src/landing/LandingPage.tsx`, `apps/web/src/landing/wake.ts`, `apps/web/src/landing/TryDemoButton.tsx`
- Test: `apps/web/test/landing.test.tsx`

**Interfaces:**
- Produces: `wakeApi(url: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<boolean>` (polls the direct `/api/health` until ok, default timeout 90 s); `startDemo(): Promise<void>` (waits for `wakeApi`, then `POST /api/demo`, saves the session with `demoLogins`, navigates to `/app`).

- [ ] **Step 1: Write the failing tests** — the page calls `wakeApi(import.meta.env.VITE_API_WAKE_URL)` on mount; while waking, the button shows "Opening your store… (the free server takes up to a minute to wake up)"; after health is ok it posts `/api/demo` once and navigates; 429 `demo_limit` shows the API message with a "Sign in" link; the hero copy, three feature cards (POS, utang, offline) and a footer link to Credits are present.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): landing page with API wake-up and Try the demo`

### Task 33: The 3D tindahan

**Files:**
- Create: `apps/web/src/landing/tindahan/{Tindahan3D,StoreBuilding,Sachets,Props,Lighting,useScrollProgress}.tsx`, `apps/web/src/landing/TindahanStage.tsx` (lazy loader with fallback), `tools/render-still.mjs` (Playwright screenshot of the scene → `apps/web/public/tindahan-still.webp`)
- Test: `apps/web/test/tindahanStage.test.tsx`

**Interfaces:**
- Produces: `TindahanStage()` — renders `apps/web/public/tindahan-still.webp` under reduced motion or without WebGL, otherwise lazy-loads `Tindahan3D` (React Three Fiber `Canvas` with `dpr={[1, 1.5]}`, paused while `document.hidden`).

- [ ] **Step 1: Write the failing tests** — with `prefers-reduced-motion: reduce` only the still image renders (alt "Illustration of a sari-sari store at dusk") and the 3D chunk is not imported; without WebGL the same; otherwise the canvas wrapper `data-testid="tindahan-canvas"` appears.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the scene from primitives as spec 11.4 describes (walls, corrugated roof, barred window with serving opening, "SariSari POS" signboard, sachet strips in generic colors, bench, bottle crate, dusk lighting with a warm bulb, blue accents), slow orbit, pointer parallax and a scroll-driven move toward the window; render the still with `node tools/render-still.mjs`.
- [ ] **Step 4: Run** the tests and check the landing in the browser on desktop and a 360 px phone in both themes — Expected: PASS and the scene reads clearly.
- [ ] **Step 5: Commit** `feat(web): low-poly 3D tindahan with reduced-motion still`

### Task 34: Brand, credits, 404 and social image

**Files:**
- Create: `apps/web/public/logo.svg`, `apps/web/public/favicon.svg`, PWA icons (via `@vite-pwa/assets-generator`), `apps/web/src/features/credits/CreditsPage.tsx`, `apps/web/src/features/notFound/NotFoundPage.tsx`, `tools/make-og.mjs` → `apps/web/public/og.png` (1200×630)
- Modify: `apps/web/index.html` (title, description, Open Graph tags)
- Test: `apps/web/test/credits.test.tsx`

- [ ] **Step 1: Write the failing test** — the Credits page contains, verbatim: *UI adapted from "POS System Web UI" by Abubakar Sherazi (Figma Community), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: blue accent, new brand, sari-sari screens and content, icons.* and also credits Lucide icons and the Poppins font with their licenses; the 404 page links home.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the storefront-awning mark in `--accent`, the icons, the OG image and the pages.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): brand mark, credits page, 404 and social image`

## Milestone 8: Ship

### Task 35: End-to-end tests with the Docker image

**Files:**
- Create: `playwright.config.ts` (web server 1: the API from the Docker image or `npm run start -w apps/api` on 8080 against the test DB; web server 2: `vite preview` on 4173 whose `/api` proxy adds a signed `x-nf-sign`), `e2e/helpers.ts`, `e2e/{demo-sale,utang,roles,barcode,offline,mobile,a11y}.spec.ts`
- Modify: `.github/workflows/ci.yml` (job `e2e` loads the `image` artifact, runs it against the Postgres service, runs Playwright)

- [ ] **Step 1: Write the specs** — `demo-sale`: Try the demo → owner dashboard → POS → cash sale → receipt shows `No.` and the change; `utang`: utang sale within the limit, then a payment on the suki page; `roles`: Switch to bantay → owner items hidden, direct visit to `/app/reports` shows "Owner only"; `barcode`: fake `BarcodeDetector` via `addInitScript` adds a product; `offline`: `context.setOffline(true)`, sell, receipt "Pending sync", back online, badge returns to "Online", and the API has exactly one sale with that id; `mobile`: 360×740 POS bottom sheet and payment, and product tiles, quantity buttons and the pay button are at least 44×44 px; `a11y`: axe has no serious or critical violations on landing, POS, products, suki and reports in both themes, and reduced motion shows the still image.
- [ ] **Step 2: Run** `npm run test:e2e` locally — Expected: all specs PASS.
- [ ] **Step 3: Commit** `test(e2e): demo, utang, roles, barcode, offline, mobile and accessibility`
- [ ] **Step 4: Push** (covered by the Task 6 approval, since nothing deploys yet) — Expected: `e2e` job green using the built image.

### Task 36: Deployment configuration and docs

**Files:**
- Create: `netlify.toml` (base `apps/web`, build command, publish `apps/web/dist`; redirect `/api/*` → `https://<render-host>/api/:splat` status 200 `signed = "PROXY_SIGNING_SECRET"`; SPA fallback `/* /index.html 200`; headers: CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<render-host>; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`), `render.yaml` (Docker web service, free plan, `dockerfilePath: apps/api/Dockerfile`, health check `/api/health`, env vars listed without values), `.github/workflows/cleanup.yml` (daily 03:00 Manila, `curl -X POST` with `x-cleanup-secret` from a GitHub secret), `README.md` (what it is, live links, architecture diagram, local setup with Docker, tests, credits), `docs/diagrams/` (context, data flow, sale flowchart, rendered to PNG like the other projects)
- Test: `apps/web/test/netlifyConfig.test.ts`

- [ ] **Step 1: Write the failing test** — parses `netlify.toml`: the `/api/*` rule is a 200 proxy with `signed = "PROXY_SIGNING_SECRET"`, the SPA fallback comes after it, and the CSP has no `unsafe-eval` and allows `camera=(self)`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write** the files (the Render host placeholder is replaced in Task 37).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `chore: Netlify, Render and cleanup configuration with README and diagrams`

### Task 37: Go live (checkpoints with Jomari)

- [ ] **Step 1: CHECKPOINT — Neon:** ask Jomari to create a Neon project (PostgreSQL 17, region Singapore) and to paste the pooled and direct connection strings into Render personally in Step 2. Wait.
- [ ] **Step 2: CHECKPOINT — Render:** ask Jomari to sign in to Render with GitHub and approve creating the service from `render.yaml`; Jomari enters `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PROXY_SIGNING_SECRET`, `CLEANUP_SECRET`, `IP_HASH_SALT` (each generated locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` and copied by Jomari) and `SITE_ORIGIN`. Set auto-deploy to "After CI checks pass". Wait for the first deploy; `curl https://<render-host>/api/health` → `{"ok":true}`.
- [ ] **Step 3: CHECKPOINT — Netlify:** ask Jomari to approve creating the Netlify site from the repo; Jomari sets `PROXY_SIGNING_SECRET` (runtime scope, same value as Render) and `VITE_API_WAKE_URL`; replace `<render-host>` in `netlify.toml` and `render.yaml`, commit `chore: point Netlify at the Render API` and push (approved).
- [ ] **Step 4: Verify the proxy** — log the headers Render receives on one signed request; confirm `x-nf-sign` validates and which header carries the visitor IP; if it is not `x-nf-client-connection-ip`, update `clientIp`, test and push.
- [ ] **Step 5: Live smoke test** in the browser: landing wake-up, Try the demo, sale, receipt, utang, switch to bantay, offline sale and sync, delete nothing outside the demo. Time it from a sleeping API: landing to the first completed sale under 2 minutes (spec 1.3), and "Try the demo" under 5 s once the API is awake. Then Lighthouse (mobile) on the landing: Performance ≥ 85, Accessibility ≥ 95. Fix and redeploy until all pass.
- [ ] **Step 6: Add the cleanup secret** to GitHub Actions (Jomari) and run `cleanup.yml` once manually → `{ "deleted": n }`.

### Task 38: Portfolio entry (after approval)

- [ ] **Step 1: CHECKPOINT** — ask Jomari whether to add SariSari POS to the portfolio now and how to get the walkthrough video (Jomari records it, as for ResuMatch, or an automated recording).
- [ ] **Step 2:** Add the project to `Jomari-Candido-Portfolio` (carousel card, project row, case study, screenshot, video, skills such as Express, Docker, Prisma and PWA, updated counts), preview it locally, and push only after Jomari approves the preview.

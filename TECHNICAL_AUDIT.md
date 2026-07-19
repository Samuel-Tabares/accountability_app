# Technical Audit — accountability_app

**Date:** 2026-07-19
**Version audited:** 0.15.0
**Scope:** Deep review of the money-path (sales, FIFO cost of goods, commissions,
ambassador levels/liquidation, consignaciones) and the data-loading path, looking for
redundant, ambiguous, broken, or slow processes.

**Method:** end-to-end read of `src/lib/{fifo,ledger,levels,consignment-*}.ts`, the
`app/api/**` mutation routes, `app/admin/page.tsx` (SSR data load), `app/embajador/page.tsx`,
and the SQL migrations. `npm run typecheck` passes — there is no compile-level breakage.

---

## Severity summary

| # | Finding | Severity | Type | Status |
|---|---------|----------|------|--------|
| 1 | FIFO silently allows overselling → COGS undercounted, profit inflated | 🔴 Critical | Correctness | ✅ Fixed (v0.15.1) — stock guard rejects oversell |
| 2 | Admin sees stale ambassador level (always "Nivel 0") | 🔴 High | Correctness / redundancy | ✅ Fixed (v0.15.1) — compute-on-read |
| 3 | FIFO consume is a read-then-write race with no locking / no transaction | 🟡 Low now / 🔴 High later* | Correctness / integrity | ⏳ Deferred — **required before trabix-bot writes to this DB** |
| 4 | Admin dashboard load = 15 full-table scans + N+1 consignment COGS + missing indexes | 🟠 Medium | Performance | 🟩 Partially fixed (v0.15.1) — indexes + parallelized COGS; full-history fetch left by design |
| 5 | Commission displayed by live recompute instead of the immutable stored value | 🟡 Low | Ambiguity / robustness | ✅ Fixed (v0.15.1) — reads snapshot |
| 6 | Free-granizados liquidation hardcodes `withAlcohol` stock | ⚪ N/A | Business assumption | Won't fix (intended) |

> \* **#3 re-evaluated + deferred with a trigger.** The race only manifests with *concurrent
> writers*. Today this is a single-admin app recording sales sequentially by hand — one writer,
> negligible race window — so it is **Low now**. But `trabix-bot` is planned to insert orders
> into this same database in the future; the day that ships there are two concurrent writers and
> this becomes **High**. #1's JS stock guard cannot prevent two writers from both passing the
> check and overselling. **Therefore the atomic Postgres FIFO function (locks batch rows
> `FOR UPDATE`, validates stock, inserts sale + consumptions in one transaction) is a hard
> prerequisite of the trabix-bot → accountability_app integration.** Build it as part of that
> milestone, validated on staging before prod. Until then, no action needed.

---

## 🔴 #1 — FIFO silently allows overselling

**Where:** [`src/lib/fifo.ts:45-63`](src/lib/fifo.ts#L45-L63), consumed by
[`app/api/sales/route.ts:141-165`](app/api/sales/route.ts#L141-L165) and
[`app/api/embajadores/liquidar/route.ts:84`](app/api/embajadores/liquidar/route.ts#L84).

`resolveFifoCost` walks production batches oldest-first, taking `Math.min(available, remaining)`
from each, and returns `{ totalCost, rows }`. When stock runs out before `remaining` reaches
zero, **the leftover `remaining` is silently discarded** — the function returns a partial cost
and no caller ever checks whether the full quantity was covered.

**Failure scenario:** Admin records a wholesale sale of 100 units while only 60 units of that
variant exist in stock. The sale is written at full revenue, but `cost_of_goods` only reflects
60 units. The remaining 40 units carry **zero cost**. `gross_profit` and `net_profit` are
overstated, and **no error is surfaced** — the admin is never told they oversold.

**Why it matters:** For a financial-management app this is the worst class of bug — the numbers
quietly lie, and the error compounds silently across every oversold sale.

**Fix:** `resolveFifoCost` must signal insufficient stock (return `covered` units or an
`insufficient` flag). The sale/liquidation routes must reject the operation when stock is
insufficient, with a clear message. Best implemented together with #3 as a single atomic DB
function (see below).

---

## 🔴 #2 — Admin sees the wrong ambassador level (always "Nivel 0")

**Where:** stale column written at [`app/api/embajadores/route.ts:60`](app/api/embajadores/route.ts#L60)
(`level: "nivel0"`), mapped at [`app/admin/page.tsx:72`](app/admin/page.tsx#L72), displayed at
[`app/admin/components/AmbassadorsPanel.tsx:312`](app/admin/components/AmbassadorsPanel.tsx#L312).

The `profiles.level` column is set to `"nivel0"` when an ambassador is created and **never
updated again**. The real level is *compute-on-read* from wholesale units in the current
30-day cycle — but that computation only runs on the ambassador's **own** page
([`app/embajador/page.tsx:72-73`](app/embajador/page.tsx#L72-L73) via `levelProgress`).

The admin panel renders the stale column instead of computing it.

**Failure scenario:** An ambassador who has sold 400+ units this cycle (Diamante) shows as
**"Nivel 0"** in the admin's ambassador list, while their own dashboard correctly shows
Diamante. Two sources of truth for the same fact; the admin's is permanently wrong.

**Related (same class):** `mapAmbassador` maps `boostActive: profile.boost_active` — the raw
flag, not the expiry-aware [`isBoostActive`](src/lib/ledger.ts#L164). An ambassador whose 7-day
boost expired can still show a green "boost active" badge to the admin.

**Fix:** compute the admin-side level from the ambassador's cycle units (reuse `currentCycleUnits`
+ `computeLevel` from `src/lib/levels.ts`), the same way the embajador page does. Treat the
stored `profiles.level` column as dead. Optionally make the boost badge expiry-aware.

---

## 🔴 #3 — FIFO consume is a read-then-write race with no locking

**Where:** [`app/api/sales/route.ts:141-257`](app/api/sales/route.ts#L141-L257).

The flow is: (1) `resolveFifoCost` **reads** batches + consumptions in JS and computes
availability; (2) the route **inserts** the sale; (3) **inserts** the batch consumptions;
(4) **inserts** the automatic expenses. These are four independent statements with **no
transaction** and **no row lock**, using manual compensating `delete`s if a later step errors.

**Failure scenarios:**
- **Double-spend:** two concurrent sales both read "60 available" and both consume the same
  batch units → real stock goes negative, cost is assigned twice.
- **Partial write on crash:** if the process is killed between inserts, the compensating
  `delete` never runs (it only fires on a *returned* error, not a hard crash), leaving a sale
  with no consumptions (or a sale + consumptions with no expense).

**Why it matters:** low probability at current volume, but structurally unsafe on the money
path. It is the root cause that also makes #1 possible.

**Fix:** move the FIFO consume into a single Postgres function (RPC) that runs inside one
transaction, locks the relevant batch rows (`FOR UPDATE`), validates sufficient stock
(fixing #1), and writes the sale + consumptions atomically. The route calls the RPC instead of
orchestrating four separate inserts.

> **Rollout gate:** this is a schema/behavior change on live financial data. Per the two-project
> rule, validate on staging (`qnmzxwiudhvxeokfkewp`) before applying to prod
> (`tcwhnglikclgylddutwp`). Migration files are append-only.

---

## 🟠 #4 — Admin dashboard load is heavy (the "slow system")

**Where:** [`app/admin/page.tsx:283-299`](app/admin/page.tsx#L283-L299) and
[`src/lib/consignment-traceability.ts:180-209`](src/lib/consignment-traceability.ts#L180-L209).

1. **15 unbounded `select("*")` queries** on every admin page load. `sales`, `expenses`, and
   `sale_batch_consumptions` grow forever and have no `limit` — the whole history is pulled on
   each render.
2. **N+1 consignment COGS.** `computeAllClientsStockCogs` loops every client × 2 variants, and
   each `computeClientBatchOutstanding` call issues ~6 sequential queries
   ([`consignment-traceability.ts:28-114`](src/lib/consignment-traceability.ts#L28-L114)). With
   *N* consignment clients that adds up to ~12·N blocking round-trips on the SSR render path.
3. **Missing indexes.** There is an index on `sales.consignment_client_id` but **none** on
   `sales.ambassador_profile_id`, `sales.sale_type`, `sales.created_at`, or
   `expenses.ambassador_profile_id` — all filtered/sorted hot paths (e.g. the liquidar query at
   [`liquidar/route.ts:36-40`](app/api/embajadores/liquidar/route.ts#L36-L40) and the
   per-ambassador embajador page query).

**Fix (cheap → involved):** (a) add the missing indexes (one append-only migration, big win);
(b) precompute/cache `consignmentStockCogs` instead of 12·N queries per load; (c) paginate or
date-bound the `sales` / `expenses` / `sale_batch_consumptions` queries.

**Done in v0.15.1:**
- (a) ✅ `0013_perf_indexes.sql` adds the missing indexes.
- (b) ✅ *Partially* — `computeAllClientsStockCogs` / `computeClientBatchOutstanding` now issue their
  independent queries with `Promise.all` (per-client fan-out + across-clients), collapsing ~6
  sequential round-trips per client×variant, run in series across clients, into parallel batches.
  Same result, far less latency. A precomputed/cached column is still the endgame if client count
  grows large, but parallelization removes the acute pain without new persistence.

**Deliberately NOT done (c):** the `sales` / `expenses` / `sale_batch_consumptions` queries are **not**
paginated. The ledger computes *lifetime* aggregates (investment, FIFO COGS, net profit) that require
the full history — truncating the fetch would silently corrupt the totals. Reducing this load properly
means moving to precomputed running aggregates (a materialized view or a rollup table), which is a
separate, larger piece of work, not a quick `.limit()`.

---

## 🟡 #5 — Commission shown by live recompute instead of the immutable stored value

**Where:** [`src/lib/ledger.ts:265-270`](src/lib/ledger.ts#L265-L270) (recompute) vs the
immutable source of truth: the `expenses` row of type `commission`
([`app/api/sales/route.ts:226-236`](app/api/sales/route.ts#L226-L236)).

**Business model (confirmed):** the commission is money owed to the ambassador. It is written
once as an `expenses` row (immutable, traceable in the admin's expenses, drives net profit) and
also snapshotted on `sales.commission_value`. It is never changed. **This requirement is already
fully satisfied by the expense row.**

**The actual defect is narrow:** the admin sales *table* does not read that immutable value — it
**recalculates** the commission live on every render. Normally the recompute matches, so it's
invisible. It diverges in one situation: if an ambassador with past wholesale sales is **deleted
or renamed**, the recompute can no longer match the sale to a living ambassador, and that row
displays **$0 commission** — even though the real expense still exists in the books and still
correctly reduces net profit.

**Impact:** cosmetic only. The ambassador's pay is never wrong, the books are never wrong, and
the ambassador's own dashboard is correct (it reads `commission_value` directly,
[`app/embajador/page.tsx:62`](app/embajador/page.tsx#L62)). Only the number printed in the
admin's sales table can disagree with the expense it mirrors.

**Fix:** the ledger display should read the stored `sale.commissionValue` snapshot rather than
recomputing it from current settings. No money changes.

---

## ⚪ #6 — Free-granizados liquidation hardcodes `withAlcohol` — WON'T FIX

**Where:** [`app/api/embajadores/liquidar/route.ts:84`](app/api/embajadores/liquidar/route.ts#L84).

At cycle close the level's free granizados are recorded as a `gift` sale (zero revenue, real
FIFO cost) drawn from `withAlcohol` stock. This is a **deliberate business rule** — free reward
granizados are always con licor. Left as-is by decision. (Note: it inherits #1's undercount if
con-licor stock is empty at liquidation; fixing #1 covers that edge.)

---

## What's solid (do not touch)

- FIFO returns-crediting for consignment pickups ([`fifo.ts:35-53`](src/lib/fifo.ts#L35-L53)).
- Derived-COGS formula robust to inventory returns
  ([`ledger.ts:417-422`](src/lib/ledger.ts#L417-L422)).
- Payout idempotency via `unique (ambassador_profile_id, cycle_start)`
  ([`0012_ambassador_payouts.sql`](supabase/migrations/0012_ambassador_payouts.sql)).
- `sale_batch_consumptions.sale_id ... on delete cascade` — prevents orphan consumptions when a
  gift/sale is rolled back ([`0003_operational_model.sql:107`](supabase/migrations/0003_operational_model.sql#L107)).

The architecture is sound; the defects are at the edges of the money path.

---

## Fix plan & sequencing

| Batch | Findings | Risk | Status |
|-------|----------|------|--------|
| A | #5, #2, #1 (stock guard) | Low — TS only, no migration | ✅ Shipped in v0.15.1 |
| B (gated) | #3 (atomic FIFO RPC) | Medium — DB migration + RPC on money path | ⏳ Pending bot-writer decision; if pursued, validate on **staging** before prod |
| C | #4 (indexes + COGS parallelization) | Low — non-destructive | ✅ Shipped in v0.15.1 |
| D (backlog) | #4 remainder — precomputed aggregates to shrink full-history fetch | Medium — needs rollup/materialized view | Deferred; only worth it as data grows |

**#1 note:** shipped as a JS-level stock guard (reject oversell in the route). That fully covers
the single-writer everyday case. If #3's atomic RPC is later built, the stock check moves into
the transaction (belt-and-suspenders) and the JS guard can stay as a fast pre-check.

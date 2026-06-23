---
name: Upload-history table has THREE storyStatus sources
description: The market-data upload-history table reads from 3 separate sources that must stay shape-synced; omitting the two-phase story fields on the SSR source mis-renders zeros AND silently stops polling.
---

The member market-data upload-history table (`UploadHistoryTable`) is fed by **three independent data sources that must carry the SAME row shape**:
1. **Initial SSR render** — the server page mapping (`src/app/member/market-data/page.tsx`).
2. **List endpoint** — `GET /api/member/market-data/uploads` (the `market-data:uploaded` refetch path).
3. **Poll endpoint** — `GET /api/member/market-data/upload/[id]` (3s polling for non-settled rows).

The two-phase cutover fields (`storyStatus`/`storyError`, Wave 6a `market_instant_cutover`) must be selected AND mapped in **all three**, using the identical parity-preserving spread: only include the keys when `storyStatus` is truthy AND `!== "not_started"` (flag-OFF rows then stay byte-identical).

**Why it matters / the trap:** if any source omits `storyStatus`, a row mid-generation arrives without it, so the Result cell's `isStoryGenerating(r)` is false → it falls through to render the still-zero `factCount`/`storyLeadCount` as **"0 facts · 0 leads"** (reads as failure). Worse, `isSettled(r) = TERMINAL.has(status) && !isStoryGenerating(r)` then treats the `validated` row as **terminal**, so the polling effect never re-arms and the row never self-corrects to the real counts. The SSR source is the easy one to forget because the two API endpoints already had the fields.

**How to apply:** any new per-row field that drives the cell's render branch OR the `isSettled`/`isStoryGenerating` poll gates must be added to all three sources in lockstep. Cell rule: during `generating`/`failed` sub-states, never surface the raw zero counts — show "Numbers ready" (deterministic AggregatedMetric numbers are already in the moment `status` flips to `validated`).

---
name: Market-data upload retry cap is a UI dead-end
description: After 3 failed revalidations an upload can never be retried from the UI; and a stale dev Prisma client causes spurious validation failures.
---

Two independent traps around `MarketDataUpload` revalidation:

1. **Retry cap has no reset path.** The UI gate is `friendly.canRetry && retryCount < MAX_RETRIES`
   (MAX_RETRIES = 3, `UploadHistoryTable.tsx`). The member retry route increments
   `retryCount`; the admin `.../revalidate` route does NOT reset it. So once an upload
   has failed 3×, the Revalidate/Retry button is permanently disabled — even after the
   real cause is fixed. There is no endpoint to reset `retryCount`; the only unblock is a
   direct DB write (`retryCount = 0`).
   **Why:** the cap exists to stop members burning ~$2/AI pass on a genuinely-broken file,
   but it also strands uploads that failed for transient/environment reasons.

2. **Stale dev Prisma client → "Unknown argument <field>".** After a new MarketFact/etc.
   field ships (schema + migration + `prisma generate`), the long-running dev server can
   still hold an OLD generated client and throw a Prisma *validation* error like
   `Unknown argument methodologyVersion` at runtime — even though schema.prisma, the
   on-disk generated client, and the DB column are all correct. Restart the
   "Start application" workflow to reload the fresh client.
   **How to apply:** if a runtime Prisma error names a field that demonstrably exists in
   schema + generated client + DB (verify with a one-off `tsx` query via `@/lib/prisma`),
   suspect a stale running client and restart the workflow before changing code.

Note: the MarketFact table is mapped to `market_facts` (snake_case) — `information_schema`
lookups must use the mapped table name, not the Prisma model name.

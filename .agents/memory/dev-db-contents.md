---
name: Dev DB has real member data
description: The dev database contains real member rows (e.g. Phil Martin) with market-data uploads, so member-specific features can be tested locally.
---

# Dev DB contains real member data

The development database is NOT empty of real members. It contains actual member
accounts (e.g. Phil Martin, `philm@martinht.com`) with a full set of validated
`market_data_uploads` (monthly, through ~2026-05) and their facts/leads/aggregated
metrics.

**Why this matters:** member-specific features (market-data validation, fact
extraction, script generation) CAN be exercised end-to-end against dev — you do
not always need production to reproduce a member's data state. Verify with a quick
read before assuming "this only exists in prod."

**How to apply:** to run a pipeline against a real upload in dev, import the
prisma client (`import { prisma } from "./src/lib/prisma.ts"` — default export is
the same client) and the pipeline fn (e.g. `runValidation` from
`src/lib/fact-validator.ts`) in a one-off `npx tsx` script. `runValidation` is
awaitable (the route fires it via `validateUploadAsync`, fire-and-forget).

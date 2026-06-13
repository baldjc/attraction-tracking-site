---
name: Jarvis get_facts month scoping
description: get_facts defaults to the LATEST validated upload; historical/prior-month questions need the monthYear param, and missing/malformed months must refuse honestly (never fall back to latest).
---

# Jarvis get_facts is latest-only by default

`executeGetFacts` (the Jarvis ledger, `src/lib/jarvis/tools.ts`) resolves its upload via
`loadLatestValidatedUpload(userId, monthYear?)`. With no `monthYear` it reads the member's
**latest** validated upload only. So a direct historical question ("May 2025 Altadore
detached") used to make Jarvis claim "my ledger only carries <latest> data" — the prior
months exist in the DB (one validated upload per month) but were never loaded.

**Fix shape (keep it consistent):** `get_facts` takes an optional `monthYear` (YYYY-MM),
threaded schema → `GetFactsArgs` → orchestrator dispatch (`typeof input.monthYear === "string"`)
→ `executeGetFacts`. The single member account (Jared, Calgary) has ~26 monthly uploads back
to 2024-04.

**Honesty rules (both required):**
- `monthYear` present but **no validated upload** for it → return `state:"no_upload"` listing
  the validated months that DO exist. Never silently fall back to latest (that answers a
  different question).
- `monthYear` present but **malformed** (fails `/^\d{4}-\d{2}$/`) → refuse with a format hint.
  Only an absent/empty `monthYear` defaults to latest.

**Why:** silent fallback-to-latest is a correctness/honesty bug — the member asked about a
specific month; answering with a different month's numbers is worse than refusing.

**Grounding is safe:** the orchestrator runs `onFact(f)` for every returned fact, so
historical-month facts enter the conversation ledger and pass `groundAssistantText` like any
other cited number. Tenant isolation is preserved — every month query filters
`{ userId, status: "validated" }`.

**Related:** year-over-year deltas still need `compute_yoy_cut` (get_facts and a single
compute_cut each return only ONE month). On-demand cuts reading OLD spaced-header CSVs must
apply `resolveEffectiveMapping(mapping, headers).mapping` — see "Style-cut single-family
parity".

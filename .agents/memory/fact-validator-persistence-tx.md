---
name: Fact-validator persistence & transaction budget
description: Why market-data fact persistence must stay out of interactive transactions and be an idempotent replace.
---

# Fact-validator persistence rules

## Rule 1 — bulk fact/lead writes must NOT live inside an interactive transaction
Large markets yield hundreds of facts; serial writes take 8–34s and blow past
Prisma's default 5000ms interactive-transaction budget, throwing P2028
("expired transaction"). The AI step has already succeeded (~$2 spent) by then,
so a tx-wrapped persist makes every retry re-burn the cost and fail at the same
wall. Keep only the small status-flip + usage row in a tx; run createMany + lead
inserts outside it (createMany is a single statement, not subject to the budget).

**Why:** observed in production for Phil's metros; the failure is purely the DB
write, never the AI.

## Rule 2 — persistResults must be an idempotent REPLACE
MarketFact / MarketStoryLead carry no upload-scoped uniqueness, and once writes
are outside a transaction a partial failure can leave rows on a still-"failed"
upload. Retries re-enter persist, so it MUST `deleteMany({where:{uploadId}})`
facts + leads up front or a retry appends a second copy and validates with
doubled counts. Don't rely on callers to clear first — the member retry route
does not delete.

## Rule 3 — never double-charge on persistence-only retries
When a prior attempt already stored `rawValidatorOutput`, reuse it (re-parse the
concatenated `--- CHUNK <NAME> ---` / `--- SUMMARY+LEADS ---` blob) and skip the
AI calls entirely — cost 0. Any AIToolUsage write must be gated on cost > 0.
The admin re-validate route should only clear `rawValidatorOutput` when the prior
status was "validated" (deliberate full re-run); preserve it for "failed" so the
free persistence retry path engages.

**How to apply:** any change to how validator output is persisted or re-run must
preserve all three rules together — they were fixed as one unit.

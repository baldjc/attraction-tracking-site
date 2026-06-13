---
name: Fact-validator persistence & transaction budget
description: Market-data re-validation must be an atomic build-then-swap that never leaves a member with fewer facts on failure.
---

# Fact-validator persistence rules

## Rule 1 — re-validation persistence MUST be an atomic build-then-swap
A failed/interrupted re-validation must NEVER leave a member with fewer facts than
they started with. The original incident (Jared, May 2025) was delete-then-rebuild:
the routes deleted facts/aggregates/leads up front, then dispatched the AI pass; the
pass died after the delete → member stranded with 0 facts.

Required shape now:
- `persistResults` (fact-validator.ts) wraps `deleteMany(facts/leads) → createMany(facts)
  → requery → create(leads)` in ONE `prisma.$transaction(async tx => …, {timeout:120000,
  maxWait:20000})`, using `tx` for EVERY write/read inside. If anything throws or the
  process dies mid-swap, the delete rolls back and the prior facts/leads survive.
- `persistAggregatedMetrics` (aggregated-metrics.ts) wraps deleteMany + chunked createMany
  in one tx with the same budget, AND returns `0` WITHOUT deleting when the new set is
  empty (never wipe to an empty set).
- The admin revalidate route and member methodology-revalidate route must NOT delete
  facts/aggregates/leads up front. They only claim + reset status (keep kill-switch and
  the clear-rawOutput-on-validated behavior). Old data lingers (stale-but-intact) if the
  AI pass fails before persist — that is the desired outcome, not a bug.

**Why this overrides the old "no bulk writes in a tx" caution:** the P2028 risk came
from hundreds of PER-ROW creates blowing the default 5000ms budget. Bulk `createMany`
is a SINGLE statement; with the budget raised to 120s and only small per-row story-lead
inserts remaining, the atomicity guarantee is worth the tx. Do NOT revert to per-row
creates inside the tx, and do NOT lower the timeout.

## Rule 2 — idempotent REPLACE (no upload-scoped uniqueness)
MarketFact / MarketStoryLead carry no upload-scoped unique constraint, so persist must
delete-by-uploadId then re-insert (now inside the swap tx). Don't rely on callers to
clear first — with the up-front route deletes removed, the swap inside persist is the
ONLY thing preventing doubled counts on a retry.

## Rule 3 — never double-charge on persistence-only retries
When a prior attempt already stored `rawValidatorOutput`, reuse it (re-parse the
concatenated `--- CHUNK <NAME> ---` / `--- SUMMARY+LEADS ---` blob) and skip the
AI calls entirely — cost 0. Any AIToolUsage write must be gated on cost > 0.
`runValidation` also no-ops when status==="validated". Admin re-validate clears
`rawValidatorOutput` only when prior status was "validated" (deliberate full re-run);
preserve it for "failed" so the free persistence retry path engages.

## Rule 4 — recovering an OLD-FORMAT upload needs a temporary live-mapping swap
`aggregateUploadFromDb` always reads the LIVE `MarketConfig.columnMapping` (no per-upload
override). A historical upload whose CSV headers differ from the member's current export
format (e.g. spaced `Close Price`/`Subdivision` vs current RESO `ClosePrice`/`SubdivisionName`)
will aggregate to 0 sold / 0 facts even though the CSV is pristine. To recover one:
temporarily swap the member's live `columnMapping` to match THAT file's headers, set
`rawValidatorOutput=null` + status=`pending` (force a fresh AI pass — see Rule 3 reuse gate),
run validation, then RESTORE the live mapping from a backup. The temp mapping is globally
live (shared dev+prod DB) for the duration — restore is mandatory and must be verified.

**How to apply:** any change to how validator output is persisted, re-run, or recovered
must preserve all four rules together — atomicity beats the old P2028-avoidance shape.

---
name: Usable-fact validation gate & stale-reject replay
description: Why a market-data upload can validate GREEN with zero citable facts, and the two traps that cause it.
---

# Usable-fact validation gate & stale-rejecting replay

A monthly market-data upload could flip to status `validated` (green) while yielding
0 usable facts, 0 story leads, and 0 AggregatedMetric rows — Jarvis then reported
"no usable facts." The CSV/numeric parsing was NOT the cause (parser is robust;
aggregateUploadFromDb produced real medians). Two distinct traps:

1. **Raw-vs-usable count in the failure gate.** runValidation's "did this run
   succeed" gate counted RAW `totalFacts`, not USABLE facts. An all-rejected run
   (every fact `usageClass === "rejected"`, sampleSize 0) has totalFacts > 0, so the
   gate passed and status flipped green despite nothing being citable.

2. **Stale rejecting output replays.** A `validated` upload no-ops on re-run, and a
   forced re-run reuses the prior `rawValidatorOutput` when it is non-empty
   (`reuseAiOutput = priorRaw.length > 0`). So a bad all-rejected run gets replayed
   verbatim and never self-heals.

**Why:** the two gaps compound — gap 1 lets a bad run go green, gap 2 makes that bad
run sticky on retry.

**How to apply / fix shape:**
- Compute `usableFacts` (count where `usageClass !== "rejected"`) AFTER the AI path
  and the reuse path converge and BEFORE persistence — both paths must be held to the
  same standard. Gate on `usableFacts === 0 && storyLeads.length === 0` → set status
  `failed`, force `factYieldPct: 0`, emit a loud `console.error`, and write a
  member-readable `validationError` distinguishing "no parseable output"
  (totalFacts === 0) from "all rejected" (totalFacts > 0). The all-rejected copy must
  hedge: usually a sale-price/status/column-mapping problem, but **very low sold
  volume** for the month can also legitimately starve samples — don't over-attribute.
- Only bill (AIToolUsage row) when the attempt actually spent (`totalCost > 0`); a
  persistence-only / $0 reuse run must not double-charge.
- **Recovery path already exists**: the admin revalidate route clears
  `rawValidatorOutput` + AggregatedMetric for validated uploads; to force a clean
  re-run, status must move off `validated` AND `rawValidatorOutput` must be nulled,
  or the reuse path replays the stale rejects.
- **Jarvis honesty**: executeGetFacts's no-upload branch must query the latest upload
  regardless of status and surface the real state — `failed` → return the reason,
  `validating` → "still processing" — instead of a misleading "no upload."

**Runtime value fallback (not a bug):** stored headline facts can have
`metricValueString === null` while `metricValue` is set; loadHeadlineSafeFacts
falls back to `String(metricValue)`, so the number still renders. Don't chase the
null string.

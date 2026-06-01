---
name: Script Builder v2 fact-gate enforcement points
description: The "minimum linked facts" gate is enforced at 4+ independent places that must move in lockstep, or members dead-end.
---

The "you need N linked facts to build/save a Script Builder v2 script" gate is
NOT centralized — it is duplicated across several layers. If you change the
threshold or semantics in one place, you must change ALL of them or members hit
an inconsistent dead-end (e.g. the wizard lets them through but the generate or
save endpoint rejects them).

Known enforcement points:
- Wizard page (server component) — decides block / low-support banner / silent.
- Streaming generate route `script-builder-v2` — has TWO checks: an early
  `linkedFactIds.length` gate and a later `factRows.length` gate (facts that
  still exist in the library after deletions).
- Save route `content-plans/[id]/save-script` — re-checks `linkedFactIds` AND
  `ownedFacts` (still-owned) counts, because the user can navigate away and
  delete facts between generate and save.
- Planner modal Build button (`ContentPlanEditModal`) — client-side enable gate.

**Why:** the count can legitimately shrink between steps (facts/uploads deleted),
so each layer re-derives it from the DB rather than trusting the previous step.
That's correct, but it means the *policy* (block-at-0 vs block-at-3, low-support
band) lives in 4+ spots.

**How to apply:** use `evaluateFactGate()` from `src/lib/script-plan-enrichment.ts`
as the single source of truth for the band (0=block, 1–2=low, ≥3=ok), and when
the policy changes grep every `< 3` / `length <` / `>= 3` around facts in the
script-builder-v2 route, the save-script route, the wizard page, and the planner
modal. The "still in library" checks (`factRows`, `ownedFacts`) should block only
at zero, not at the band target — a partial-survivor plan must still generate.

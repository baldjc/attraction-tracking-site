# Wave 2 — Known Issues & Deviations

One-pager logging deviations from `Wave-2-Content-Engine-v2-Replit-Prompt.md`
that were resolved during the Wave 2 wizard ship (commits 1-8). Each entry
explains what we did, why, and the proposed Wave 3 resolution.

---

## 1. `tactileType` (and 5 other fields) live in `researchNotes` Markdown blob

**Where:** `src/app/api/member/content-planner/wizard/save-idea/route.ts`,
`buildResearchNotes()` helper.

**What:** When the wizard saves a picked idea card as a `ContentPlan` row,
six fields from the idea card have no first-class column on `ContentPlan`
and are serialized into a labelled Markdown block stored in the existing
`researchNotes` text column:

- `clarityPremise`
- `framework`
- `tactileType`
- `subPersonas` (joined)
- `estimatedRuntime`
- `whyItWorks`

The other lineage fields (`linkedFactIds`, `linkedStoryLeadId`,
`rotationSlot`, `titlePromise`, `visualPeak`, `thumbnailWords` joined from
`thumbnailCallouts`) DO have first-class columns and are persisted there.

**Why:** Wave 2 spec said "Schema additive only" but also explicitly held
back schema additions in this wave to keep the ship surface tight and
avoid stacking migrations under a feature that members haven't exercised
yet. The Markdown-blob approach renders cleanly in the existing planner
detail view (which already shows `researchNotes` as Markdown), so members
see the full idea-card context with zero UI work. The cost is that the
fields are not individually queryable / filterable until promoted.

**Proposed Wave 3 resolution:**

1. Add 6 nullable columns on `ContentPlan` (additive, no migration risk):
   - `clarityPremise   String?  @db.Text`
   - `framework        String?`
   - `tactileType      String?`  *(or a new `TactileType` enum if we're
     ready to enumerate the set; currently free-text from Claude)*
   - `subPersonas      Json?`    *(string[])*
   - `estimatedRuntime String?`
   - `whyItWorks       String?  @db.Text`
2. `prisma db push` (additive, no data migration needed).
3. Ship a one-shot backfill script that:
   - Scans every `ContentPlan` row where `researchNotes` starts with
     `## Wave 2 idea card` (the sentinel header `buildResearchNotes`
     emits).
   - Re-parses the Markdown into the labelled fields and writes them to
     the new columns.
   - Idempotent — re-running is a no-op for already-backfilled rows.
4. Update the save-idea route to write to the new columns directly and
   stop emitting the Markdown blob for new saves (or keep it as a
   redundant "human-readable view" for backward compatibility — TBD in
   Wave 3 design).
5. Update the planner detail view to render the new fields with proper
   structured UI (e.g. tactileType as a chip alongside the existing
   rotationSlot chip).

**Sentinel for backfill:** The Markdown blob always starts with
`## Wave 2 idea card` and uses the same field labels in the same order.
That gives the Wave 3 script a stable parse target.

---

## 2. `<AiThinking mode="fallback" />` → `mode="phase"` with `fallbackPhases`

**Where:** `Step2BIdeaValidation.tsx`, `Step3IdeaCards.tsx`.

**What:** The Wave 2 spec referred to `<AiThinking mode="fallback" />` but
the actual component (`src/components/ai/AiThinking.tsx`) only supports
modes `"quick" | "phase" | "pipeline"`. Used `mode="phase"` driven by the
existing `useAiThinking` hook with a `fallbackPhases` array — this matches
how `ListingInputPhase.tsx` and other existing callsites use the
component.

**Why:** Pure terminology mismatch in the spec — the underlying behaviour
the spec described (rotating client-side phase labels during a 5-60s wait
with no server streaming) is exactly what `mode="phase" + fallbackPhases`
delivers.

**Proposed Wave 3 resolution:** No action needed — the spec's "fallback"
is a synonym for the implemented "phase + fallbackPhases" pattern. Worth
updating future wave docs to use the actual mode name.

---

## 3. Picked-idea handoff Step 3 → Step 4 via `sessionStorage` (not URL)

**Where:** `Step3IdeaCards.tsx` (writes) and `Step4Review.tsx` (reads).
URL carries only `?picked=<uuid-key>`.

**What:** The spec preferred URL state for all wizard hand-offs ("the
contract is: back button works and refresh doesn't lose state"). For the
~1KB picked idea-card JSON, an in-URL payload would blow past sensible
URL limits (and look terrible). Used `sessionStorage` keyed by a UUID
that DOES live in the URL.

**Behaviour:**
- In-tab refresh on Step 4 → works (sessionStorage survives reload).
- New-tab open of a `?step=4&picked=<uuid>` link → key not found,
  `router.replace('?step=1')`. Matches the spec'd "don't blow up if
  ?step=4 lands without picked-idea state".
- Back button from Step 4 → Step 3 → re-fetches a fresh batch (the
  React `useEffect` ref-guard prevents double-firing within a single
  mount but a real navigation back IS a fresh mount). This means a
  back-then-forward roundtrip costs another Claude call.

**Proposed Wave 3 resolution:** Two options to weigh:

- **(a)** Persist the generated batch server-side keyed by a `batchId`,
  return `batchId` from `/api/ai-tools/content-engine-v2`, and use
  `?step=3&batchId=<id>` + `?step=4&batchId=<id>&picked=<index>`. Solves
  both the new-tab and the back-button-recharges issues. Costs a Prisma
  table (`content_engine_batch`).
- **(b)** Keep `sessionStorage` but add a Step 3 cache-hit so going back
  re-uses the in-memory result. Cheaper; doesn't solve new-tab.

(a) is cleaner if we're going to add Wave 3 features like "regenerate
just card #3" or "share an idea batch with a co-host". (b) is enough if
the wizard stays a strictly single-user, single-session tool.

---

## 4. Commits 4-8 bundled into a single auto-checkpoint

**What:** Spec requested 5 incremental commits with per-commit pushes
(commits 4 through 8). The Replit task runner only creates a single
auto-checkpoint per task, so commits 4-8 landed as a single checkpoint
`f129d92` (after the standalone prompt-fix checkpoint `0e7a8f8`).

**Why:** Platform constraint — agent cannot create arbitrary git commits
mid-task; commits are produced by the task runner at checkpoint
boundaries.

**Impact on review:** Per-commit diffs are not available, but each scope
is fully isolated to its own files (no shared logic), so the file list
in `f129d92` maps cleanly to the requested commit boundaries:

- Commit 4 → `src/app/api/member/content-planner/wizard/save-idea/route.ts`
- Commit 5 → `src/app/member/content-planner/wizard/page.tsx`,
  `src/components/content-planner/wizard/Step1ModePicker.tsx`
- Commit 6 → `Step2AStoryLeads.tsx`, `Step2CRotationSlot.tsx`,
  `src/app/api/member/content-planner/wizard/story-leads/route.ts`
- Commit 7 → `Step2BIdeaValidation.tsx`, `Step3IdeaCards.tsx`
- Commit 8 → `Step4Review.tsx`, modified
  `src/app/member/content-planner/page.tsx` (the only v1 file touched)

**Proposed Wave 3 resolution:** No code action. For future waves where
per-commit review really matters, consider splitting into multiple
sequential project tasks (each task = one commit).

---

## 5. `MarketConfig.neighbourhoods` defensively parsed from `Json?`

**Where:** `save-idea/route.ts`, building the `neighbourhoods` array for
the re-validation gate.

**What:** `MarketConfig.neighbourhoods` is typed as `Json?` on the schema.
The save-idea route filters for string entries defensively (`.filter((n):
n is string => typeof n === "string")`) rather than asserting the shape.

**Why:** Defense in depth — if a future schema migration or admin tool
puts non-strings into the array, the validator won't crash; it'll just
treat them as not-a-neighbourhood and let the validation gate fail
naturally.

**Proposed Wave 3 resolution:** Tighten `MarketConfig.neighbourhoods`
to `String[]` on the Prisma schema and remove the defensive filter
across all consumers. Low priority.

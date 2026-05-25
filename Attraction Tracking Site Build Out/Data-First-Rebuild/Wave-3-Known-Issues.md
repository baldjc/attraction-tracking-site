# Wave 3 — Known Issues & Deviations

Companion to `Wave-2-Known-Issues.md`. Captures issues observed (but not
caused by) the Wave 3 Script Builder v2 ship, plus any Wave 3 deviations
from `Wave-3-Script-Builder-v2-TalkingHead-Replit-Prompt.md`.

---

## 1. Seven pre-existing `tsc --noEmit` errors carried into Wave 3

**Observed during:** Wave 3 commit 1's verification run
(`NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` after
`npx prisma generate`).

**Source commit (last touched):** `d081062` — "Improve upload pipeline
and member communication features" — landed BEFORE Wave 3 work began.
Zero Wave 3 files reference these errors.

**Why we're capturing them now:** the wave spec asks for tsc-clean
sign-off, and these errors will keep firing on every Wave 3 verification
unless they're either fixed or explicitly waived. They are individually
small and unlikely to surface as runtime bugs (Prisma rejects the runtime
write the same way the type system does, NextAuth's `session.user.role`
exists at runtime even though the type is narrower than our usage,
etc.), but they ARE technical debt that should land on a Wave 5 cleanup
list.

### The 7 errors

1. **`src/app/api/member/market-data/config/route.ts:66`** — Prisma
   `MarketConfigUpdateInput`. The route passes a plain object literal
   where each Json-typed field (`priceTiers`, `moiThresholds`,
   `highEndException`, `neighbourhoodVocab`, `keywordKit`,
   `primaryAvatar`, `subPersonas`) is typed `object | null`. Prisma 7's
   generated types require `Prisma.JsonNull` (or `Prisma.DbNull`) for
   nulls on Json columns, not raw `null`.
   - **Fix sketch:** wrap nullable Json writes in
     `value === null ? Prisma.JsonNull : value`, or change the upstream
     types to `Prisma.InputJsonValue | typeof Prisma.JsonNull`.

2. **`src/app/api/member/market-data/config/route.ts:67`** — same root
   cause as #1, surfaced on the `create` branch of the same upsert.

3. **`src/app/member/ai-tools/avatar-architect/page.tsx:932`** —
   `.map((t: Record<string, unknown>) => …)` against an array typed
   `RawTheme[]` where `RawTheme = string | Record<string, unknown>`.
   The narrow callback signature is incompatible with the union element
   type.
   - **Fix sketch:** change the callback to accept `RawTheme` and
     branch on `typeof t === "string"` before treating it as an object.

4. **`src/app/member/ai-tools/avatar-architect/page.tsx:969`** —
   identical to #3, second call-site in the same file.

5. **`src/app/member/content-planner/page.tsx:13`** —
   `session.user.role` access where the NextAuth `User` type does not
   declare `role`. We extend `Session.user` with `role` via module
   augmentation elsewhere in the codebase, but `User` (the raw row
   shape) does not carry it. The runtime value is present — only the
   type is wrong.
   - **Fix sketch:** narrow via the augmented `Session["user"]` type, or
     extend the `User` module augmentation to include `role`.

6. **`src/app/member/content-planner/wizard/page.tsx:51`** — identical
   to #5 in a sibling page.

7. **`src/lib/fact-validator.ts:820`** — `prisma.marketFact.createMany`
   rejects the row array because each row's `userId` is typed as
   `string | undefined`. The validator already guarantees `userId` is
   set before reaching this line (it's threaded through the function
   signature), so this is a narrowing gap, not a missing check.
   - **Fix sketch:** narrow `userId` at the top of the function and
     pass the narrowed local into the `.map`.

8. **`src/lib/staff-access.ts:152`** — `Session` is returned from a
   function whose declared return type is `NextMiddleware`. The
   middleware wrapper expects `(req, event) => …` but the wrapped
   handler returns a session-shaped object. Almost certainly a missed
   `await auth()` vs `auth` reference.
   - **Fix sketch:** check whether the function should be
     `async (req) => { const s = await auth(); … }` returning a
     `NextResponse`, or whether the caller should be invoking
     `auth(handler)` rather than receiving the session directly.

(That's 7 distinct errors in 7 unique line-numbers across 6 files, even
though we count "config/route.ts:66 + :67" as two separate compiler
diagnostics in the raw tsc output.)

**Proposed resolution:** roll into the Wave 5 cleanup wave alongside
the v1 AI-tool retirement. None block Wave 3 ship — none of the Wave 3
files (`script-builder-mode-prompt.ts`, `script-content-rules.ts`, the
new `/api/ai-tools/script-builder-v2/route.ts`, the wizard Step 4/5
components) touch these surfaces.

---

## Structural anti-pattern — v2 flag prop drilling (Wave 5 refactor)

v2 feature flags are threaded through `ContentPlannerClient` → view components
(`BoardView`, `ContentPlanTable`, `PipelineView`, `CalendarView`) →
`ContentPlanEditModal` as explicit props. Every new v2 surface (Wave 4 Home
Tour, Wave 5 nav reorg, etc.) that needs to gate UI inside the modal will
require touching 5+ files. The Wave 3 "Build Script (v2)" button shipped
hidden because two of those forwarding hops were missed — the prop defaulted
to `false` silently and there was no compile-time signal.

Replace with a `FeatureFlagsContext` provider at the app shell level so the
modal (and any other deep child) reads its own flag state via `useFeatureFlags()`
instead of receiving it as a prop. Wave 5 cleanup.

# Phase 2 — Discovery Audit (REPORT ONLY, no fixes applied)

_Generated alongside the Phase 1 impersonation migration. Nothing in this file was changed in code; this is a findings-only report._

Severity legend: **P0** = active correctness/security bug · **P1** = likely-bug / fragile · **P2** = hygiene / latent risk · **OK** = verified clean.

---

## Audit 1 — Silent-downgrade wrappers

**What I looked for:** `.catch()` / `try/catch` blocks that swallow an error and substitute a *downgraded* value (e.g. fall back to `"free"` tier, empty role, default plan) so a transient failure silently strips entitlements.

**Findings:**

- **OK / no true silent-downgrade found.** The `.catch()` and `catch {}` sites in the AI-tools client components (`ArcScriptBuilderTool.tsx` L269 & L307, `ArcScriptChatPhase.tsx` L539/L581, `ScriptReviewChatUI.tsx` L149, `title-thumbnail-analyzer/page.tsx` L433, `LessonClient.tsx` L389) all set an explicit **error state** (`setPlannerSaveError(true)`, `setPlannerError(...)`, `setSaveStatus("error")`). These surface the failure to the user rather than downgrading silently — this is the correct pattern.
- **P2 (watch):** several of these catch blocks discard the underlying error object (no `console.error`/telemetry), so the *user* sees an error but operators get no signal. Not a downgrade bug, but it weakens observability.

**Verdict:** No P0/P1 silent-downgrade wrappers detected. No entitlement/tier/role fallback-to-lower paths found.

---

## Audit 2 — Prisma calls without try/catch (Chris-class bodyless-500 risk)

**What I looked for:** route handlers under `src/app/api/member/` and `src/app/api/ai-tools/` that call `prisma.*` with **no** `try { }` guard. On a DB hiccup (e.g. Neon cold-start / connection drop) these throw, and an App-Router handler that throws returns an opaque HTML 500 with no JSON body — which white-screens the dashboard instead of degrading gracefully.

**Findings:** **76 route files** call Prisma with no try/catch. Full list captured during the audit run. Highest-impact subset (GET routes that hydrate first-paint surfaces — a throw here white-screens the page, not just one widget):

- **P1 — first-paint / dashboard-critical:**
  - `member/dashboard/route.ts`, `member/dashboard/next-step/route.ts`
  - `member/scores/route.ts`
  - `member/my-videos/route.ts`, `member/top-videos/route.ts`, `member/channel/route.ts`
  - `member/leads/route.ts`, `member/client-hub/route.ts`, `member/calls/route.ts`
  - `member/tier/route.ts` (a throw here is especially bad — tier drives entitlement UI)
  - `member/announcements/route.ts`, `member/changelog/route.ts`, `member/onboarding/progress/route.ts`

- **P2 — secondary surfaces (degrade one panel, not the page):** the remaining ~63, incl. all `academy/*`, `generate-leads/training/*`, `resources/*`, `content-plans/*`, `market-data/*`, `knowledge-base/*`, and `ai-tools/*` persistence routes (`save-script`, `saved-scripts`, `content-engine/*`, `conversations/*`, `usage`).

**Note:** mutation routes (POST/PATCH/DELETE) without try/catch are lower user-visible risk (the client already handles non-200 via the error states from Audit 1) but still return non-JSON 500s.

**Verdict:** Systemic. The fix is a shared `withRouteErrorHandling`/`safeJson` wrapper rather than 76 hand-written try/catch blocks (see fix order).

---

## Audit 3 — Cron / scheduled / background tasks

**What I looked for:** scheduled jobs that (a) are unauthenticated or weakly authenticated, or (b) iterate user-scoped data in a way that could leak or cross-contaminate across members.

**Findings:**

- **OK — auth:** all four cron routes (`youtube-sync`, `monthly`, `backup`, `reviewer-daily-sync`) gate on the `x-cron-secret` header compared with `crypto.timingSafeEqual` **and** guard against empty secret/expected (`!secret || !expected || ...`). No empty-secret bypass, constant-time comparison. This is correct.
- **OK — scoping:** `cron/monthly` and `lib/monthly-scheduler.ts` use `prisma.appSetting` for run-locking (`last_monthly_run`, `batch_run_status`) and a scoped `prisma.user.findMany({ where: {...} })`. No impersonation context is involved (cron runs as system, not as a user), so the Phase 1 resolver correctly does **not** apply here.
- **P1 — resilience:** the cron handlers themselves call `prisma.*` largely without try/catch (same class as Audit 2). A mid-batch DB error in `cron/monthly` aborts the run after partial work; combined with the `batch_run_status` lock this could leave a **stale lock** that blocks future runs. Worth a try/finally that always clears/!updates the lock.
- **P2:** `webhooks/fathom/route.ts` and `admin/resources/fathom/pull/route.ts` are background-ish ingestion paths — confirm they validate payload origin (not audited in depth here; flagged for follow-up).

**Verdict:** Auth is solid. Main risk is run-resilience / stale-lock, not security.

---

## Audit 4 — Admin data leaking into member paths

**What I looked for:** admin-only components, fixtures, or data (test avatars, impersonator identity, staff-only fields) rendered or returned on member-facing paths.

**Findings:**

- **OK:** the only admin component imported into a member path is `AvatarTestPanel` in `member/ai-tools/layout.tsx`, and it is correctly gated: `{isAdmin && !isImpersonating && <AvatarTestPanel />}`. `role`/`isImpersonating` come from `resolveUserFromSession()` using the **real** account role, so an impersonated member never sees it, and a real member never sees it. Correct post-Phase-1.
- **OK:** `WorkingForBanner` is shown only for `isEditor || (isAdmin && isImpersonating)` — i.e. only to staff, which is the intended "you are acting as X" affordance.
- **P1 — CONFIRMED authorization gap: `content-plans/[id]/drive-files/route.ts`.** This staff-bypass GET grants access on `isStaff` (role === admin/editor) **alone** and does **not** call `canStaffAccessMember(staffId, plan.userId)`. Its sibling `content-plans/[id]/thumbnail/route.ts` performs the same staff bypass but the broader staff-access pattern (`requireStaffMemberAccess`) does enforce `canStaffAccessMember`. Result: a **scoped sub-admin/editor** (one limited to a subset of members via `allowedMemberIds`) can read drive-file artifacts for *any* member's content plan, not just their allowed members. This is a real over-exposure, pre-existing (not introduced by Phase 1), member-owned data. Fix = mirror the thumbnail/`requireStaffMemberAccess` behavior and gate on `canStaffAccessMember`.

**Verdict:** No admin→member leak from the impersonation work. One **confirmed** pre-existing sub-admin scoping hole on `drive-files` (independently corroborated by the architect code review).

---

## Audit 5 — TODO / FIXME / HACK / XXX markers

**What I looked for:** in-code markers under `src/app/api/` and `src/app/member/` that flag known-incomplete or known-broken behavior.

**Findings:**

- **P1 — `admin/leads/[id]/convert/route.ts:62`** — `// TODO: fire GHL pipeline event so CRM reflects conversion (out of scope here).` A lead can be marked converted in-app while the CRM is never updated → CRM/app drift. Functional gap, admin-only path.
- That is the **only** TODO/FIXME/HACK/XXX marker in the audited API + member trees. No `FIXME`/`HACK`/`XXX` present.

**Verdict:** Clean except the one GHL-sync TODO.

---

## Recommended fix order

1. **P1 — Audit 2 shared error wrapper (highest leverage).** Introduce one `withRouteErrorHandling()` helper that wraps handlers, logs the error, and returns a JSON `{ error }` 500. Apply first to the ~13 first-paint/dashboard-critical GET routes (esp. `dashboard`, `scores`, `tier`, `my-videos`, `channel`), then roll out to the remaining ~63. Eliminates the bodyless-500 white-screen class.
2. **P1 — Audit 3 cron stale-lock.** Wrap `cron/monthly` + `monthly-scheduler` batch body in try/finally so `batch_run_status` is always reconciled even on partial failure.
3. **P1 — Audit 5 GHL convert sync.** Fire the GHL pipeline event on lead conversion (or explicitly track a pending-sync state) so CRM and app stay consistent.
4. **P1 — Audit 4 sub-admin scoping (confirmed).** Patch `content-plans/[id]/drive-files` to enforce `canStaffAccessMember(staffId, plan.userId)` before returning artifacts (mirror the thumbnail route / `requireStaffMemberAccess`). Closes the over-exposure of any member's drive files to scoped sub-admins.
5. **P2 — Audit 1 observability.** Add `console.error`/telemetry inside the client-side catch blocks so user-visible errors also produce operator signal.
6. **P2 — Audit 3 webhook origin.** Validate payload origin/signature on the Fathom ingestion paths.

---

_End of Phase 2 report. No code changes were made for Phase 2._

---
name: AI Tools → Content Tools rename scope
description: Which "ai-tools" paths moved to "content-tools" and which intentionally stayed; the blanket-sed gotcha.
---

The member-facing tools hub was renamed "AI Tools" → "Content Tools". Only the **member page URL** moved; everything else kept its original name.

**Moved:** `src/app/member/ai-tools/**` → `src/app/member/content-tools/**`, and all member-page link strings `/member/ai-tools` → `/member/content-tools`. A 301 redirect for the legacy path (+ subpaths) lives in `src/proxy.ts`.

**Intentionally NOT renamed (must stay `ai-tools`):**
- API routes: `/api/ai-tools/*` and `/api/member/ai-tools/*` (e.g. `activity-summary`).
- Admin pages/groups: `/admin/ai-tools`, admin settings "AI Tools" group.
- Component folder + imports: `@/components/ai-tools/*`.
- `src/lib/product-labels.ts` `LEGACY_AI_TOOLS_PATH` constant (the redirect source of truth).

**Why:** APIs/components/admin are internal contracts; only the public member URL needed the user-facing rename.

**Gotcha:** A blanket `sed s|/member/ai-tools|/member/content-tools|` also rewrites strings like `/api/member/ai-tools/activity-summary` → a non-existent `/api/member/content-tools/...`, silently breaking fetch calls (tsc won't catch string literals). After any such rename, grep `/api/.*content-tools` and confirm every `/member/content-tools/<sub>` resolves to a real dir under `src/app/member/content-tools/`. Pre-existing dead links (`title-creator`, and historically `title-analyzer`) live in the academy-manager lesson tool dropdown.

**Why proxy not middleware:** Next.js 16 deprecated the `middleware` file convention in favor of `proxy` (file `src/proxy.ts` exporting `proxy(req)`); use `NextResponse.redirect(url, { status: 301 })` since `permanent: true` yields 308.

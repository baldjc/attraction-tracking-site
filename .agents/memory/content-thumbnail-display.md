---
name: Content-plan thumbnail display & route parity
description: How the planner picks "the" thumbnail to show and the staff-access parity required across the two thumbnail proxy routes.
---

A content plan has two independent thumbnail sources:
- `thumbnailFileId` — a Drive file the member explicitly picked; streamed via `GET /api/member/content-plans/[id]/thumbnail`.
- `thumbnailVariants[]` + `thumbnailWinnerId` — A/B options uploaded in the Publish tab (Drive for production tiers, Object Storage for foundations); streamed via `GET /api/member/content-plans/[id]/thumbnails/[variantId]`.

`getPlanThumbnailUrl()` in `content-plan-utils.ts` is the single resolver both the table title cell and the editor hero use. Precedence: picked Drive file → A/B winner → first uploaded variant → null.

**Why / gotcha:** any surface that shows thumbnails to *staff who are NOT impersonating* must ensure BOTH proxy routes carry the staff bypass (`auth()` role + `canStaffAccessMember`). The `/thumbnail` route always had it; the per-variant `/thumbnails/[variantId]` GET was originally owner-only, so once the resolver started falling back to variant URLs, staff got broken images until the same bypass was added there.

**How to apply:** when adding a new thumbnail-backed surface or a new thumbnail storage path, keep the GET auth model identical across all thumbnail proxy routes. Mutations (DELETE/POST) stay owner-only.

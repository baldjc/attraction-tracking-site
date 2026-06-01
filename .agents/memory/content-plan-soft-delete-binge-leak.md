---
name: ContentPlan soft-delete binge-chain leak
description: Why filtering ContentPlan root rows by deletedAt:null isn't enough — the self-referential binge chain leaks deleted plans.
---

Filtering a ContentPlan read with `where:{deletedAt:null}` only hides the *root* rows. The self-referential binge chain still hydrates soft-deleted plans through its relations:

- `bingeVideo` (to-one, via `bingeVideoId`): a live plan pointing at a deleted target. Prisma **cannot** put a `where` on a to-one relation inside `include`/`select`, so you must select `deletedAt` on the relation and null it out post-query. Use `hideDeletedBingeTarget` / `hideDeletedBingeTargets` in `content-plan-utils.ts`.
- `bingedFromList` (to-many, reverse side): a deleted plan pointing at a live one. This side **is** filterable — add `where:{deletedAt:null}` directly to the relation include.

**Why:** the data migration that converted `status="Archived"` → `deletedAt` did NOT clear `bingeVideoId` on referencing plans, so dangling references to deleted targets exist in prod even though no DELETE created them. Read-time stripping covers that case; delete-time clearing would not.

**How to apply:** any new endpoint that includes `bingeVideo`/`bingedFromList` for member- or admin-live views must (1) add `deletedAt:true` to the `bingeVideo` select + run the strip helper on the response, and (2) add `where:{deletedAt:null}` to `bingedFromList`. Also guard derived content (e.g. the pinned-comment generator) — treat a `deletedAt` binge target as "no target".

Drive error classifier note: googleapis throws Gaxios errors that nest the real status/reason under `err.response.status` and `err.response.data.error.{code,message,errors[].reason}`, not just top-level `code`/`status`. `classifyDriveError` must read both shapes or native failures degrade to `unknown`.

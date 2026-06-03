---
name: Thumbnail/object pipeline reproducible from dev against prod
description: Why a reported per-plan thumbnail-upload failure can be reproduced (and was proven healthy) from the dev workspace, and how to diagnose it.
---

# Thumbnail upload pipeline can be exercised against LIVE prod from dev

The dev workspace shares the SAME Object Storage bucket AND the same Drive
service-account credentials as production (dev + deploy are one repl), and the
dev `DATABASE_URL` points at the same external Neon DB as prod. So the entire
direct-to-Object-Storage thumbnail pipeline — presign sign-URL → direct PUT →
finalize object-exists/read/sniff → Drive upload — can be reproduced end-to-end
against a real plan by running a one-off `npx tsx` script that imports
`@/lib/content-thumbnails` + `@/lib/google-drive`.

**Finding (when a member reports one specific ContentPlan's upload "failing"):**
every server-side step succeeded for the "failing" plan, identical to a "working"
plan — including Drive upload to the failing plan's own folder. The failing plan's
DB row was pristine: `thumbnailVariants` NULL (= `[]` via `parseVariants`), no
orphan variants (variants are JSON, not a table), no corrupt JSON, no stuck
pg locks.

**Why:** a pristine DB row + a fully-healthy server pipeline means the failure is
NOT a server/data/Drive defect for that plan. It is client-side / intermittent /
a stale browser bundle from before a deploy, OR already fixed by the latest deploy.

**How to apply:** before adding speculative server-side "fixes" (orphan cleanup,
lock-acquisition timeouts, admin reset actions) for a per-plan upload complaint,
first REPRODUCE against the live plan from dev. If every step passes and the row
is clean, do NOT add those fixes (dead code). Instead add per-step timing +
outcome logging (planId + ticket + per-step ms + outcome) so the next real retry
pinpoints the failing step; the routes use `makeThumbTimer()` for this.

---
name: tsc OOMs at default Node heap
description: Project-wide type-check needs an enlarged heap or it aborts with a misleading exit.
---

`npx tsc --noEmit` on this repo exhausts the default Node old-space (~2 GB) and aborts
with `FATAL ERROR: Ineffective mark-compacts near heap limit ... heap out of memory`
(exit 134) — which looks like a crash, not a type error.

**Fix:** run with an enlarged heap, e.g.
`NODE_OPTIONS="--max-old-space-size=7168" npx tsc --noEmit`.

**Why:** the generated Prisma client + Next.js app graph is large; default heap is too small.
**How to apply:** any full-project `tsc` verification step should set `--max-old-space-size`
(~7 GB) up front rather than retrying after the OOM.

---
name: instrumentation import-graph dev restart
description: Editing any module reachable from instrumentation.ts forces a full Next dev restart, killing in-process background work.
---

Editing ANY module in `src/instrumentation.ts`'s import graph (e.g.
`src/lib/validation-recovery.ts`, or anything those import) triggers a **full
Next dev-server restart**, not a Fast-Refresh HMR patch. A new log file appears
and `instrumentation.register()` re-runs from scratch.

**Why it matters:** any un-awaited in-process background job (e.g. the
fire-and-forget market-data `validateUploadAsync`) is killed mid-run by that
restart and re-orphaned — even though you only touched an unrelated-looking lib
file. Don't conclude the job "stalled"; it was process-killed.

**How to apply:** while a long in-process job must survive, do NOT edit
instrumentation-graph files. If you must, expect the restart — and rely on the
boot-recovery reclaim (`recoverStuckValidations("boot")`) to re-dispatch the
orphaned upload. The watchdog's `inFlight` guard then prevents a double-dispatch
of the freshly reclaimed run. (Observed live: a lib edit restarted dev, boot
reclaimed the stuck upload, watchdog logged `requeued=0`, run reached validated.)

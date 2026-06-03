// Entry point for the always-on durable-queue worker (Reserved VM deployment).
//
//   npm run worker   →   npx tsx scripts/worker.ts
//
// Thin shim: all logic lives in src/lib/job-worker.ts so it is type-checked with
// the rest of the app (this `scripts/` dir is excluded from tsc).

import { startWorker } from "@/lib/job-worker";

startWorker().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});

// Triggers validation for all pending uploads belonging to the gated user via
// the /api/debug/validate endpoint (sync mode, concurrency=3). The endpoint
// runs inside the long-lived Next.js workflow process so the work survives
// our short-lived bash sessions.

(process.stdout as { _handle?: { setBlocking?: (b: boolean) => void } })._handle?.setBlocking?.(true);
(process.stderr as { _handle?: { setBlocking?: (b: boolean) => void } })._handle?.setBlocking?.(true);

import prisma from "@/lib/prisma";

const USER_ID = "c3d00532-9a60-47cd-9287-66c4f5ea864f";
const SECRET = "wave-1-phase-2a-debug";
const BASE = "http://localhost:5000/api/debug/validate";
const CONCURRENCY = 3;

async function triggerOne(id: string): Promise<{ id: string; ok: boolean; err?: string }> {
  const started = Date.now();
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: id, secret: SECRET, mode: "sync" }),
    });
    const txt = await res.text();
    const ms = Date.now() - started;
    console.log(`[${new Date().toISOString()}] ${id} HTTP ${res.status} in ${ms}ms :: ${txt.slice(0, 200)}`);
    return { id, ok: res.ok };
  } catch (err) {
    const ms = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[${new Date().toISOString()}] ${id} THREW after ${ms}ms :: ${msg}`);
    return { id, ok: false, err: msg };
  }
}

async function main() {
  const pending = await prisma.marketDataUpload.findMany({
    where: { userId: USER_ID, status: "pending" },
    orderBy: { monthYear: "asc" },
    select: { id: true, monthYear: true },
  });
  console.log(`Found ${pending.length} pending uploads`);
  if (!pending.length) return;

  const ids = pending.map((p) => p.id);
  const results: { id: string; ok: boolean; err?: string }[] = [];

  // Run with bounded concurrency.
  let cursor = 0;
  async function worker(wid: number) {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      console.log(`[worker ${wid}] starting ${i + 1}/${ids.length} = ${id}`);
      results.push(await triggerOne(id));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nDone. Success: ${okCount}/${results.length}`);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

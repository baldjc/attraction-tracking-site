// TEMPORARY debug endpoint. Runs runValidation synchronously inside the
// Next.js workflow process (which is long-lived, so we can let it churn for
// 2-5 minutes). Secret-gated, not exposed in production builds.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { runValidation } from "@/lib/fact-validator";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEBUG_SECRET = process.env.DEBUG_VALIDATE_SECRET ?? "wave-1-phase-2a-debug";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Disabled in production" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as
    | { uploadId?: string; userId?: string; secret?: string; mode?: "sync" | "async" | "all-pending" }
    | null;
  if (body?.secret !== DEBUG_SECRET) {
    return Response.json({ error: "Bad secret" }, { status: 401 });
  }

  // Batch mode: enqueue ALL pending uploads for a given userId. Runs sequentially
  // in the background of the dev server process. Returns 202 immediately.
  if (body.mode === "all-pending" && body.userId) {
    const pending = await prisma.marketDataUpload.findMany({
      where: { userId: body.userId, status: "pending" },
      orderBy: { monthYear: "asc" },
      select: { id: true, monthYear: true },
    });
    console.log(`[debug/validate all-pending] starting ${pending.length} uploads for ${body.userId}`);
    // Fire-and-forget background driver
    queueMicrotask(async () => {
      let ok = 0;
      let fail = 0;
      for (const u of pending) {
        const t0 = Date.now();
        try {
          await runValidation(u.id);
          const ms = Date.now() - t0;
          ok++;
          console.log(`[debug/validate all-pending] OK ${u.id} (${u.monthYear}) in ${ms}ms (${ok + fail}/${pending.length})`);
        } catch (err) {
          fail++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[debug/validate all-pending] FAIL ${u.id} (${u.monthYear}): ${msg}`);
        }
      }
      console.log(`[debug/validate all-pending] done: ${ok} ok, ${fail} failed`);
    });
    return Response.json({ ok: true, queued: pending.length, mode: "all-pending" }, { status: 202 });
  }

  if (!body.uploadId) {
    return Response.json({ error: "Missing uploadId" }, { status: 401 });
  }
  const { uploadId, mode = "sync" } = body;
  console.log("[_debug/validate] received", uploadId, "mode=" + mode);

  if (mode === "async") {
    // Fire-and-forget so the route returns immediately. Next.js dev process
    // continues running the validation in the background.
    queueMicrotask(() => {
      runValidation(uploadId).catch((err) => {
        console.error("[_debug/validate] async runValidation threw", uploadId, err);
      });
    });
    return Response.json({ ok: true, uploadId, mode: "async" });
  }

  try {
    await runValidation(uploadId);
    return Response.json({ ok: true, uploadId, mode: "sync" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[_debug/validate] sync runValidation threw", uploadId, err);
    return Response.json({ ok: false, uploadId, error: msg, stack }, { status: 500 });
  }
}

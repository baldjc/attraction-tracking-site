import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  parseVariants,
  thumbnailStorageKey,
  extForMime,
  signThumbnailUploadUrl,
  makeThumbTimer,
  MAX_THUMBNAIL_BYTES,
  MAX_THUMBNAIL_VARIANTS,
  ALLOWED_THUMBNAIL_MIME,
} from "@/lib/content-thumbnails";
import { withTimeout, PhaseTimeoutError } from "@/lib/with-timeout";

export const runtime = "nodejs";

// POST — step 1 of the direct-to-Object-Storage thumbnail upload. Validates the
// declared file (type + size) and the per-plan cap, then mints a short-lived
// signed PUT URL the browser uploads the bytes to directly. The app never sees
// the file bytes here — only tiny JSON — so this can't stall at the body
// ingress the way the old multipart POST did in production.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ticket = randomUUID();
  // Created with a placeholder planId so the catch can always log; reassigned
  // with the real planId as soon as params resolves (inside the try, so a params
  // rejection is still caught and returns our ticketed error).
  let timer = makeThumbTimer("thumbnail-presign", "unknown", ticket);
  try {
    const { id } = await params;
    timer = makeThumbTimer("thumbnail-presign", id, ticket);
    const user = await withTimeout(() => resolveUserFromSession(), {
      phase: "auth",
      subsystem: "database",
      timeoutMs: 5_000,
    });
    timer.mark("auth");
    if (!user) {
      timer.log("unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      timer.log("bad_json");
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const b = (body ?? {}) as { contentType?: unknown; size?: unknown };
    const contentType = typeof b.contentType === "string" ? b.contentType : "";
    const size = typeof b.size === "number" ? b.size : NaN;

    if (!ALLOWED_THUMBNAIL_MIME.has(contentType)) {
      timer.log("reject_mime", { contentType });
      return NextResponse.json({ error: "Only PNG or JPG images are allowed." }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      timer.log("reject_size", { size });
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (size > MAX_THUMBNAIL_BYTES) {
      timer.log("reject_too_big", { size });
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }

    const plan = await withTimeout(
      () =>
        prisma.contentPlan.findFirst({
          where: { id, userId: user.id, deletedAt: null },
          select: { id: true, thumbnailVariants: true },
        }),
      { phase: "plan_fetch", subsystem: "database", timeoutMs: 5_000 },
    );
    timer.mark("plan_fetch");
    if (!plan) {
      timer.log("not_found");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Friendly pre-check; the authoritative cap is re-checked inside the row
    // lock in /finalize so a race can never push past the limit.
    const variantCount = parseVariants(plan.thumbnailVariants).length;
    if (variantCount >= MAX_THUMBNAIL_VARIANTS) {
      timer.log("max_variants", { variantCount });
      return NextResponse.json(
        { error: `Maximum of ${MAX_THUMBNAIL_VARIANTS} thumbnails.` },
        { status: 400 },
      );
    }

    const variantId = randomUUID();
    const ext = extForMime(contentType);
    const key = thumbnailStorageKey(user.id, id, variantId, ext);

    const uploadUrl = await withTimeout(() => signThumbnailUploadUrl(key), {
      phase: "sign",
      subsystem: "storage",
      timeoutMs: 10_000,
    });
    timer.mark("sign");

    // The client only needs the URL + the variantId. /finalize reconstructs the
    // storage key from the authenticated user + plan + variantId, so the client
    // can never point finalize at someone else's object.
    timer.log("ok", { variantId, variantCount });
    return NextResponse.json({ uploadUrl, variantId });
  } catch (err) {
    if (err instanceof PhaseTimeoutError) {
      timer.log("timeout", { phase: err.phase, subsystem: err.subsystem });
      const slow = err.subsystem === "database" ? "Database" : "Storage";
      return NextResponse.json(
        { error: `${slow} is slow right now — try again in a moment.`, ticket },
        { status: 503 },
      );
    }
    timer.log("error");
    console.error(`[thumbnail-presign] error ticket=${ticket}:`, err);
    return NextResponse.json(
      { error: "Could not start upload — please try again.", ticket },
      { status: 500 },
    );
  }
}

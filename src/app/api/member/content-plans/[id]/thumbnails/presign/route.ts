import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  parseVariants,
  thumbnailStorageKey,
  extForMime,
  signThumbnailUploadUrl,
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
  try {
    const user = await withTimeout(() => resolveUserFromSession(), {
      phase: "auth",
      subsystem: "database",
      timeoutMs: 5_000,
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const b = (body ?? {}) as { contentType?: unknown; size?: unknown };
    const contentType = typeof b.contentType === "string" ? b.contentType : "";
    const size = typeof b.size === "number" ? b.size : NaN;

    if (!ALLOWED_THUMBNAIL_MIME.has(contentType)) {
      return NextResponse.json({ error: "Only PNG or JPG images are allowed." }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    }
    if (size > MAX_THUMBNAIL_BYTES) {
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
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Friendly pre-check; the authoritative cap is re-checked inside the row
    // lock in /finalize so a race can never push past the limit.
    if (parseVariants(plan.thumbnailVariants).length >= MAX_THUMBNAIL_VARIANTS) {
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

    // The client only needs the URL + the variantId. /finalize reconstructs the
    // storage key from the authenticated user + plan + variantId, so the client
    // can never point finalize at someone else's object.
    return NextResponse.json({ uploadUrl, variantId });
  } catch (err) {
    if (err instanceof PhaseTimeoutError) {
      const slow = err.subsystem === "database" ? "Database" : "Storage";
      return NextResponse.json(
        { error: `${slow} is slow right now — try again in a moment.`, ticket },
        { status: 503 },
      );
    }
    console.error(`[thumbnail-presign] error ticket=${ticket}:`, err);
    return NextResponse.json(
      { error: "Could not start upload — please try again.", ticket },
      { status: 500 },
    );
  }
}

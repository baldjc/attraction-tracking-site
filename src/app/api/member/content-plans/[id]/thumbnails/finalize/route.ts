import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { folderIdFromUrl } from "@/lib/google-drive";
import {
  type ThumbnailVariant,
  parseVariants,
  thumbnailStorageKey,
  extForMime,
  getThumbnailBytes,
  deleteThumbnailBytes,
  thumbnailObjectExists,
  sniffImageMime,
  updateVariantsLocked,
  MAX_THUMBNAIL_BYTES,
  MAX_THUMBNAIL_VARIANTS,
  ALLOWED_THUMBNAIL_MIME,
} from "@/lib/content-thumbnails";
import { withTimeout, PhaseTimeoutError } from "@/lib/with-timeout";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST — step 3 of the direct upload. The browser has already PUT the bytes to
// the signed URL minted by /presign; here we (a) confirm the object landed, (b)
// re-validate it (size + magic bytes) since the bytes never passed through the
// app, then (c) append a variant under the same row lock + cap the old route
// used, so the persisted shape/URL stays identical. When the plan has a Drive
// folder, we tell the client to fire /drive-copy (off the critical path).
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
    const b = (body ?? {}) as { variantId?: unknown; contentType?: unknown; fileName?: unknown };
    const variantId = typeof b.variantId === "string" ? b.variantId : "";
    const contentType = typeof b.contentType === "string" ? b.contentType : "";
    const fileNameRaw = typeof b.fileName === "string" ? b.fileName : "";

    if (!UUID_RE.test(variantId)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!ALLOWED_THUMBNAIL_MIME.has(contentType)) {
      return NextResponse.json({ error: "Only PNG or JPG images are allowed." }, { status: 400 });
    }

    const plan = await withTimeout(
      () =>
        prisma.contentPlan.findFirst({
          where: { id, userId: user.id, deletedAt: null },
          select: { id: true, thumbnailVariants: true, driveFolderLink: true },
        }),
      { phase: "plan_fetch", subsystem: "database", timeoutMs: 5_000 },
    );
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ext = extForMime(contentType);
    // Reconstruct the key from the authenticated identity — never trust a
    // client-supplied path. This is exactly what /presign signed.
    const key = thumbnailStorageKey(user.id, id, variantId, ext);

    const existingVariants = parseVariants(plan.thumbnailVariants);
    // Idempotent: a retried finalize for an already-persisted variant must not
    // re-validate or double-append; just return current state.
    if (existingVariants.some((v) => v.id === variantId)) {
      return NextResponse.json({
        variants: existingVariants,
        drivePending: !!folderIdFromUrl(plan.driveFolderLink),
      });
    }

    // Friendly pre-check before we touch storage. The orphaned object (if the
    // PUT already happened) is cleaned up so a rejected finalize leaves nothing.
    if (existingVariants.length >= MAX_THUMBNAIL_VARIANTS) {
      await deleteThumbnailBytes(key);
      return NextResponse.json(
        { error: `Maximum of ${MAX_THUMBNAIL_VARIANTS} thumbnails.` },
        { status: 400 },
      );
    }

    const exists = await withTimeout(() => thumbnailObjectExists(key), {
      phase: "object_exists",
      subsystem: "storage",
      timeoutMs: 15_000,
    });
    if (!exists) {
      return NextResponse.json(
        { error: "Upload did not complete — please try again." },
        { status: 400 },
      );
    }

    const bytes = await withTimeout(() => getThumbnailBytes(key), {
      phase: "object_read",
      subsystem: "storage",
      timeoutMs: 15_000,
    });

    if (bytes.length > MAX_THUMBNAIL_BYTES) {
      await deleteThumbnailBytes(key);
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      await deleteThumbnailBytes(key);
      return NextResponse.json(
        { error: "That file is not a valid PNG or JPG image." },
        { status: 400 },
      );
    }
    if (sniffed !== contentType) {
      await deleteThumbnailBytes(key);
      return NextResponse.json(
        { error: "File content does not match its type — re-export as PNG or JPG and try again." },
        { status: 400 },
      );
    }

    const cleanedName = fileNameRaw
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F"\\/]+/g, "")
      .trim()
      .slice(0, 200);
    const fileName = cleanedName || `thumbnail.${ext}`;
    const newVariant: ThumbnailVariant = {
      id: variantId,
      fileName,
      mimeType: sniffed,
      storage: "object",
      key,
      score: null,
      createdAt: new Date().toISOString(),
    };

    let result: { variants: ThumbnailVariant[]; winnerId: string | null } | null;
    try {
      result = await withTimeout(
        () =>
          updateVariantsLocked(id, user.id, (current, winnerId) => {
            // Re-check inside the lock for both the cap and a concurrent finalize.
            if (current.some((v) => v.id === variantId)) return { variants: current, winnerId };
            if (current.length >= MAX_THUMBNAIL_VARIANTS) throw new Error("MAX_VARIANTS");
            return { variants: [...current, newVariant], winnerId };
          }),
        { phase: "db_update", subsystem: "database", timeoutMs: 5_000 },
      );
    } catch (err) {
      if (err instanceof Error && err.message === "MAX_VARIANTS") {
        // mutate() threw before the UPDATE, so the transaction rolled back and
        // nothing references the object — safe to remove the orphaned bytes.
        await deleteThumbnailBytes(key);
        return NextResponse.json(
          { error: `Maximum of ${MAX_THUMBNAIL_VARIANTS} thumbnails.` },
          { status: 400 },
        );
      }
      // Timeout or an unknown DB error: withTimeout races, it does NOT cancel the
      // transaction, so the variant MAY still commit. Deleting the object here
      // could orphan a committed variant (broken thumbnail), so we leave the
      // bytes in place. finalize is idempotent — a retry reconciles, and the
      // worst case is a harmless orphan object if the commit truly failed.
      if (err instanceof PhaseTimeoutError) throw err;
      console.error(`[thumbnail-finalize] write failed ticket=${ticket}:`, err);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    if (!result) {
      await deleteThumbnailBytes(key);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      variants: result.variants,
      drivePending: !!folderIdFromUrl(plan.driveFolderLink),
    });
  } catch (err) {
    if (err instanceof PhaseTimeoutError) {
      const slow = err.subsystem === "database" ? "Database" : "Storage";
      return NextResponse.json(
        { error: `${slow} is slow right now — try again in a moment.`, ticket },
        { status: 503 },
      );
    }
    console.error(`[thumbnail-finalize] error ticket=${ticket}:`, err);
    return NextResponse.json(
      { error: "Something went wrong finishing the upload — please try again.", ticket },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  folderIdFromUrl,
  uploadBinaryToFolder,
  deleteDriveFile,
} from "@/lib/google-drive";
import {
  type ThumbnailVariant,
  parseVariants,
  extForMime,
  getThumbnailBytes,
  updateVariantsLocked,
  makeThumbTimer,
} from "@/lib/content-thumbnails";
import { withTimeout, PhaseTimeoutError } from "@/lib/with-timeout";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST — step 4 (optional, off the critical path). After /finalize persists the
// Object-Storage variant, the client fires this to mirror the thumbnail into the
// plan's Google Drive folder. It is best-effort: any failure returns ok:false
// (HTTP 200) and never blocks the member — the variant already exists in Object
// Storage, which is what the editor and proxy serve from. Idempotent via the
// stored driveFileId. The variant always keeps storage:"object".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ticket = randomUUID();
  // Placeholder planId until params resolves inside run() (which is wrapped by
  // the request_total timeout); reassigned with the real planId immediately.
  let timer = makeThumbTimer("thumbnail-drive-copy", "unknown", ticket);
  const run = async (): Promise<NextResponse> => {
    const { id } = await params;
    timer = makeThumbTimer("thumbnail-drive-copy", id, ticket);
    const user = await withTimeout(() => resolveUserFromSession(), {
      phase: "auth",
      subsystem: "database",
      timeoutMs: 5_000,
    });
    timer.mark("auth");
    if (!user) {
      timer.log("unauthorized");
      return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      timer.log("bad_json");
      return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }
    const variantId =
      typeof (body as { variantId?: unknown })?.variantId === "string"
        ? (body as { variantId: string }).variantId
        : "";
    if (!UUID_RE.test(variantId)) {
      timer.log("bad_variant_id");
      return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }

    const plan = await withTimeout(
      () =>
        prisma.contentPlan.findFirst({
          where: { id, userId: user.id, deletedAt: null },
          select: { id: true, thumbnailVariants: true, driveFolderLink: true },
        }),
      { phase: "plan_fetch", subsystem: "database", timeoutMs: 5_000 },
    );
    timer.mark("plan_fetch");
    if (!plan) {
      timer.log("not_found");
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const folderId = folderIdFromUrl(plan.driveFolderLink);
    if (!folderId) {
      timer.log("no_folder");
      return NextResponse.json({ ok: false, reason: "no_folder" });
    }

    const variant = parseVariants(plan.thumbnailVariants).find((v) => v.id === variantId);
    if (!variant) {
      timer.log("variant_missing");
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    if (variant.driveFileId) {
      timer.log("already");
      return NextResponse.json({ ok: true, already: true });
    }
    if (variant.storage !== "object" || !variant.key) {
      timer.log("no_object");
      return NextResponse.json({ ok: false, reason: "no_object" });
    }

    let bytes: Buffer;
    try {
      bytes = await withTimeout(() => getThumbnailBytes(variant.key!), {
        phase: "object_read",
        subsystem: "storage",
        timeoutMs: 15_000,
      });
      timer.mark("object_read");
    } catch (err) {
      timer.log("read_failed", { timeout: err instanceof PhaseTimeoutError });
      console.error(`[thumbnail-drive-copy] object read failed ticket=${ticket}:`, err);
      return NextResponse.json({ ok: false, reason: "read_failed" });
    }

    const ext = extForMime(variant.mimeType);
    let uploaded: { fileId: string; fileUrl: string } | null;
    let driveTimedOut = false;
    try {
      uploaded = await withTimeout(
        () =>
          uploadBinaryToFolder(
            folderId,
            `thumbnail-${variantId}.${ext}`,
            bytes,
            variant.mimeType,
          ),
        { phase: "drive_upload", subsystem: "drive", timeoutMs: 20_000 },
      );
      timer.mark("drive_upload");
    } catch (err) {
      driveTimedOut = err instanceof PhaseTimeoutError;
      console.error(`[thumbnail-drive-copy] drive upload failed ticket=${ticket}:`, err);
      uploaded = null;
    }
    if (!uploaded) {
      timer.log("drive_failed", { timeout: driveTimedOut });
      return NextResponse.json({ ok: false, reason: "drive_failed" });
    }
    const uploadedFileId = uploaded.fileId;

    // Decide the authoritative outcome INSIDE the row lock so a concurrent retry
    // or a delete-during-copy can't overwrite an existing link or silently leave
    // our freshly-uploaded file dangling.
    const lockState: {
      outcome: "attached" | "already" | "missing";
      existingFileId: string | null;
    } = { outcome: "missing", existingFileId: null };
    const result = await withTimeout(
      () =>
        updateVariantsLocked(id, user.id, (current, winnerId) => {
          const v = current.find((x) => x.id === variantId);
          if (!v) {
            lockState.outcome = "missing";
            return { variants: current, winnerId };
          }
          if (v.driveFileId) {
            lockState.outcome = "already";
            lockState.existingFileId = v.driveFileId;
            return { variants: current, winnerId };
          }
          lockState.outcome = "attached";
          const next = current.map((x) =>
            x.id === variantId ? { ...x, driveFileId: uploadedFileId } : x,
          );
          return { variants: next as ThumbnailVariant[], winnerId };
        }),
      { phase: "db_update", subsystem: "database", timeoutMs: 5_000 },
    );
    timer.mark("db_update");

    if (!result) {
      // Plan vanished between fetch and write — drop the orphaned Drive file.
      await deleteDriveFile(uploadedFileId).catch(() => {});
      timer.log("plan_gone");
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    if (lockState.outcome === "attached") {
      timer.log("attached", { fileId: uploadedFileId });
      return NextResponse.json({ ok: true, variants: result.variants });
    }
    // We uploaded but did not attach. uploadBinaryToFolder is name-idempotent, so
    // a concurrent copy normally resolves to the SAME fileId (no orphan); only
    // delete when our file id differs from whatever ended up linked.
    if (uploadedFileId !== lockState.existingFileId) {
      await deleteDriveFile(uploadedFileId).catch(() => {});
    }
    if (lockState.outcome === "already") {
      timer.log("already_locked");
      return NextResponse.json({ ok: true, already: true, variants: result.variants });
    }
    timer.log("variant_gone");
    return NextResponse.json(
      { ok: false, reason: "not_found", variants: result.variants },
      { status: 404 },
    );
  };

  try {
    return await withTimeout(run, {
      phase: "request_total",
      subsystem: "other",
      timeoutMs: 30_000,
    });
  } catch (err) {
    // Best-effort: never surface a hard failure to the client for the Drive copy.
    if (err instanceof PhaseTimeoutError) {
      timer.log("timeout", { phase: err.phase, subsystem: err.subsystem });
    } else {
      timer.log("error");
    }
    console.error(`[thumbnail-drive-copy] error ticket=${ticket}:`, err);
    return NextResponse.json({ ok: false, reason: "error", ticket });
  }
}

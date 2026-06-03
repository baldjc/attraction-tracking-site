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
  thumbnailStorageKey,
  extForMime,
  putThumbnailBytes,
  deleteThumbnailBytes,
  updateVariantsLocked,
  MAX_THUMBNAIL_BYTES,
  ALLOWED_THUMBNAIL_MIME,
} from "@/lib/content-thumbnails";
import {
  withTimeout,
  PhaseTimeoutError,
  type TimeoutSubsystem,
} from "@/lib/with-timeout";

export const runtime = "nodejs";

const MAX_VARIANTS = 3;

// Per-await timeout budget (ms). Each external call (DB / Object Storage / Drive
// / body read) gets an explicit bound so no single degraded subsystem can hang
// the request. In any realistic single-subsystem failure the route returns a
// structured error well under the client's 40s AbortController limit.
const PHASE_TIMEOUTS = {
  auth: 5_000, // DB-backed session/impersonation lookup
  plan_fetch: 5_000, // DB read (ownership check)
  multipart_parse: 10_000, // network body read (slow client / large file)
  buffer_read: 10_000, // File -> Buffer (already in memory after parse, but bound anyway)
  drive_upload: 15_000, // Drive write (also internally bounded; falls back to Object Storage)
  object_storage_write: 15_000, // Object Storage write (also internally bounded — do NOT relax)
  db_update: 5_000, // row-locked variant write
} as const;

function timeoutResponse(err: PhaseTimeoutError, ticket: string): NextResponse {
  switch (err.subsystem) {
    case "storage":
      return NextResponse.json(
        { error: "Storage is slow right now — try again in a moment.", ticket },
        { status: 503 },
      );
    case "database":
      return NextResponse.json(
        { error: "Database is slow right now — try again in a moment.", ticket },
        { status: 503 },
      );
    case "upload":
      return NextResponse.json(
        {
          error:
            "Upload took too long — your file may be too large or your connection unstable.",
          ticket,
        },
        { status: 408 },
      );
    default:
      return NextResponse.json(
        { error: "Something else went wrong — we've logged it.", ticket },
        { status: 500 },
      );
  }
}

// POST — upload a new thumbnail A/B variant. When the plan has a Google Drive
// folder attached, the image is uploaded straight into it. If there is no Drive
// folder (or the Drive upload fails), it is stored in Replit Object Storage so
// the member can still preview and download it. Returns the full variant list.
//
// Every external await is wrapped in `withTimeout` and timed; on a timeout the
// member gets a subsystem-specific message and the logs say exactly which phase
// stalled (`[thumbnail-upload] result=timeout timeout_at=<phase>`).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ticket = randomUUID();
  const startedAt = Date.now();

  // Run one bounded, timed phase. Logs duration for EVERY call (success or not)
  // so slow-but-passing trends are visible before they become outages.
  const phase = async <T,>(
    name: keyof typeof PHASE_TIMEOUTS,
    subsystem: TimeoutSubsystem,
    work: () => Promise<T>,
  ): Promise<T> => {
    const phaseStart = Date.now();
    try {
      const out = await withTimeout(work, {
        phase: name,
        subsystem,
        timeoutMs: PHASE_TIMEOUTS[name],
      });
      console.log(`[thumbnail-upload] phase=${name} duration_ms=${Date.now() - phaseStart}`);
      return out;
    } catch (e) {
      const isTimeout = e instanceof PhaseTimeoutError;
      console.log(
        `[thumbnail-upload] phase=${name} duration_ms=${Date.now() - phaseStart} result=${
          isTimeout ? "timeout" : "error"
        }`,
      );
      throw e;
    }
  };

  try {
    const user = await phase("auth", "database", () => resolveUserFromSession());
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const plan = await phase("plan_fetch", "database", () =>
      prisma.contentPlan.findFirst({
        where: { id, userId: user.id, deletedAt: null },
        select: { id: true, thumbnailVariants: true, driveFolderLink: true },
      }),
    );
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Cheap pre-check for a friendly error before we read the upload body; the
    // authoritative cap is re-checked inside the row lock below.
    if (parseVariants(plan.thumbnailVariants).length >= MAX_VARIANTS) {
      return NextResponse.json({ error: `Maximum of ${MAX_VARIANTS} thumbnails.` }, { status: 400 });
    }

    let form: FormData;
    try {
      form = await phase("multipart_parse", "upload", () => req.formData());
    } catch (e) {
      if (e instanceof PhaseTimeoutError) throw e; // -> "Upload took too long…"
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!ALLOWED_THUMBNAIL_MIME.has(file.type)) {
      return NextResponse.json({ error: "Only PNG or JPG images are allowed." }, { status: 400 });
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
    }

    const buf = Buffer.from(await phase("buffer_read", "upload", () => file.arrayBuffer()));
    const variantId = randomUUID();
    const ext = extForMime(file.type);
    const now = new Date().toISOString();

    const storeInObjectStorage = async (): Promise<ThumbnailVariant> => {
      const key = thumbnailStorageKey(user.id, id, variantId, ext);
      await putThumbnailBytes(key, buf);
      return {
        id: variantId,
        fileName: file.name || `thumbnail.${ext}`,
        mimeType: file.type,
        storage: "object",
        key,
        score: null,
        createdAt: now,
      };
    };

    // Upload into the video's attached Drive folder when one exists. No folder
    // (or a failed/slow Drive upload) falls back to Object Storage — we never
    // auto-create a folder here. (Foundations tier has no folder → straight to
    // Object Storage.)
    let variant: ThumbnailVariant | null = null;
    const folderId = folderIdFromUrl(plan.driveFolderLink);
    if (folderId) {
      let uploaded: { fileId: string } | null = null;
      try {
        uploaded = await phase("drive_upload", "drive", () =>
          uploadBinaryToFolder(folderId, `thumbnail-${variantId}.${ext}`, buf, file.type),
        );
      } catch {
        // Drive failure/timeout is non-fatal: fall through to Object Storage.
        uploaded = null;
      }
      if (uploaded) {
        variant = {
          id: variantId,
          fileName: file.name || `thumbnail.${ext}`,
          mimeType: file.type,
          storage: "drive",
          driveFileId: uploaded.fileId,
          score: null,
          createdAt: now,
        };
      }
    }
    if (!variant) {
      try {
        variant = await phase("object_storage_write", "storage", storeInObjectStorage);
      } catch (err) {
        // Covers both the inner 15s timeout and any bucket error/outer timeout.
        console.error(`[thumbnail-upload] object-storage upload failed ticket=${ticket}:`, err);
        return NextResponse.json(
          { error: "Storage is slow right now — try again in a moment.", ticket },
          { status: 503 },
        );
      }
    }
    const newVariant = variant;

    // Best-effort cleanup of the just-stored bytes/file so a rejected upload
    // (cap hit, plan vanished, DB error) never leaves an orphan in either
    // backend. Both deletes are internally timeout-bounded.
    const cleanupStored = async () => {
      if (newVariant.storage === "object" && newVariant.key) {
        await deleteThumbnailBytes(newVariant.key);
      } else if (newVariant.storage === "drive" && newVariant.driveFileId) {
        await deleteDriveFile(newVariant.driveFileId);
      }
    };

    let result: { variants: ThumbnailVariant[]; winnerId: string | null } | null;
    try {
      result = await phase("db_update", "database", () =>
        updateVariantsLocked(id, user.id, (current, winnerId) => {
          if (current.length >= MAX_VARIANTS) {
            throw new Error("MAX_VARIANTS");
          }
          return { variants: [...current, newVariant], winnerId };
        }),
      );
    } catch (err) {
      await cleanupStored();
      if (err instanceof PhaseTimeoutError) throw err; // -> "Database is slow…"
      if (err instanceof Error && err.message === "MAX_VARIANTS") {
        return NextResponse.json({ error: `Maximum of ${MAX_VARIANTS} thumbnails.` }, { status: 400 });
      }
      console.error(`[thumbnail-upload] write failed ticket=${ticket}:`, err);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    if (!result) {
      await cleanupStored();
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log(
      `[thumbnail-upload] result=success total_ms=${Date.now() - startedAt} storage=${newVariant.storage}`,
    );
    return NextResponse.json({ variants: result.variants });
  } catch (err) {
    const totalMs = Date.now() - startedAt;
    if (err instanceof PhaseTimeoutError) {
      console.error(
        `[thumbnail-upload] result=timeout timeout_at=${err.phase} subsystem=${err.subsystem} total_ms=${totalMs} ticket=${ticket}`,
      );
      return timeoutResponse(err, ticket);
    }
    console.error(`[thumbnail-upload] result=error total_ms=${totalMs} ticket=${ticket}`, err);
    return NextResponse.json(
      { error: "Something else went wrong — we've logged it.", ticket },
      { status: 500 },
    );
  }
}

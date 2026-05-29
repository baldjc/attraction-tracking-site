import { Client as ObjectStorageClient } from "@replit/object-storage";
import prisma from "@/lib/prisma";

// ─── Thumbnail A/B variant storage ───────────────────────────────────────────
// Production-tier members store thumbnails in their plan's Google Drive folder;
// everyone else uses Replit Object Storage. Either way the variant metadata
// (id, score, which backend) lives in ContentPlan.thumbnailVariants (Json).

export type ThumbnailVariant = {
  id: string;
  fileName: string;
  mimeType: string;
  storage: "object" | "drive";
  key?: string; // object-storage key
  driveFileId?: string; // drive file id
  score?: number | null; // 0-100 from the Title & Thumbnail Analyzer
  scoreNotes?: string | null;
  createdAt: string;
};

export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_THUMBNAIL_MIME = new Set(["image/png", "image/jpeg"]);

let cachedClient: ObjectStorageClient | null = null;
function objectStorage(): ObjectStorageClient {
  if (cachedClient) return cachedClient;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error(
      "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — Object Storage bucket must be provisioned (run the App Storage blueprint).",
    );
  }
  cachedClient = new ObjectStorageClient({ bucketId });
  return cachedClient;
}

export function thumbnailStorageKey(userId: string, planId: string, variantId: string, ext: string): string {
  return `content-thumbnails/${userId}/${planId}/${variantId}.${ext}`;
}

export function extForMime(mime: string): string {
  return mime === "image/png" ? "png" : "jpg";
}

export async function putThumbnailBytes(key: string, buf: Buffer): Promise<void> {
  const result = await objectStorage().uploadFromBytes(key, buf);
  if (!result.ok) {
    throw new Error(`Object Storage upload failed for ${key}: ${String(result.error)}`);
  }
}

export async function getThumbnailBytes(key: string): Promise<Buffer> {
  const result = await objectStorage().downloadAsBytes(key);
  if (!result.ok) {
    throw new Error(`Object Storage download failed for ${key}: ${String(result.error)}`);
  }
  return result.value[0];
}

export async function deleteThumbnailBytes(key: string): Promise<void> {
  try {
    await objectStorage().delete(key);
  } catch {
    // Best-effort cleanup; a dangling object is harmless.
  }
}

/** Coerce the persisted Json column into a typed, validated array. */
export function parseVariants(raw: unknown): ThumbnailVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ThumbnailVariant[] = [];
  for (const v of raw) {
    if (v && typeof v === "object" && typeof (v as ThumbnailVariant).id === "string") {
      out.push(v as ThumbnailVariant);
    }
  }
  return out;
}

/**
 * Atomically read-modify-write a plan's thumbnail variant list. Locks the row
 * (`SELECT … FOR UPDATE`) inside a transaction so concurrent upload/score/delete
 * actions can't clobber each other's writes (lost-update race). The `mutate`
 * callback runs against the freshly-locked state and returns the next state; it
 * may throw to abort (the route maps that to a 4xx). Returns `null` when the
 * plan does not exist for this owner. Keep slow work (Drive/Object Storage
 * uploads, Anthropic calls) OUTSIDE this helper — only the array write belongs
 * inside the lock.
 */
export async function updateVariantsLocked(
  planId: string,
  userId: string,
  mutate: (
    current: ThumbnailVariant[],
    winnerId: string | null,
  ) => { variants: ThumbnailVariant[]; winnerId: string | null },
): Promise<{ variants: ThumbnailVariant[]; winnerId: string | null } | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ thumbnailVariants: unknown; thumbnailWinnerId: string | null }>
    >`SELECT "thumbnailVariants", "thumbnailWinnerId" FROM "content_plans" WHERE "id" = ${planId} AND "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) return null;

    const current = parseVariants(rows[0].thumbnailVariants);
    const next = mutate(current, rows[0].thumbnailWinnerId ?? null);

    await tx.contentPlan.update({
      where: { id: planId },
      data: {
        thumbnailVariants: next.variants as object[],
        thumbnailWinnerId: next.winnerId,
      },
    });
    return next;
  });
}

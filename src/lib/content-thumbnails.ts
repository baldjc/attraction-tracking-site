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

// A/B cap shared by every thumbnail write path (presign, finalize, legacy
// multipart POST). Keep all of them on this one constant so the cap can never
// drift between the cheap pre-check and the row-locked authoritative check.
export const MAX_THUMBNAIL_VARIANTS = 3;

// Replit Object Storage signing runs through the local sidecar (the same one the
// `@replit/object-storage` client talks to). v1.0.0 of that client exposes no
// signing method, so we hit the sidecar's signed-URL endpoint directly to mint a
// short-lived PUT URL the browser uploads to — keeping the file bytes off the
// app handler entirely (which is what was stalling at the ingress in prod).
const REPLIT_SIDECAR_ENDPOINT =
  process.env.REPLIT_SIDECAR_ENDPOINT || "http://127.0.0.1:1106";
export const SIGN_URL_TIMEOUT_MS = 10_000;

// Object Storage has no client-side timeout of its own, so a stalled bucket
// call would otherwise hang the request forever (member stuck on "Uploading…").
// Bound every Object-Storage write so the route always settles and can surface
// a real error instead of hanging.
export const OBJECT_STORAGE_TIMEOUT_MS = 15_000;

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Object Storage upload timed out for ${key}`)),
        OBJECT_STORAGE_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([objectStorage().uploadFromBytes(key, buf), timeout]);
    if (!result.ok) {
      throw new Error(`Object Storage upload failed for ${key}: ${String(result.error)}`);
    }
  } finally {
    if (timer) clearTimeout(timer);
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Best-effort cleanup (used on the upload rollback path) must never block the
    // response, so bound it like the write — a dangling object is harmless.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("object_delete_timeout")), OBJECT_STORAGE_TIMEOUT_MS);
    });
    await Promise.race([objectStorage().delete(key), timeout]);
  } catch {
    // Best-effort cleanup; a dangling object is harmless.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Mint a short-lived signed PUT URL for `key` in the same bucket + key pattern
 * the read/serve route already understands, so the browser can upload the bytes
 * directly to Object Storage. The sidecar signs only method + resource + expiry
 * (not the content-type), so the browser may send `Content-Type` on the PUT to
 * stamp the stored object's type without affecting the signature. Bounded so a
 * stalled sidecar can never hang the presign request.
 */
export async function signThumbnailUploadUrl(key: string, ttlSec = 300): Promise<string> {
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) {
    throw new Error(
      "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — Object Storage bucket must be provisioned (run the App Storage blueprint).",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_URL_TIMEOUT_MS);
  try {
    const res = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: key,
        method: "PUT",
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to sign upload URL (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) throw new Error("Sidecar returned no signed_url");
    return data.signed_url;
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded existence check — used by finalize to confirm the browser's direct
 * PUT actually landed before we persist a variant pointing at it. */
export async function thumbnailObjectExists(key: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("object_exists_timeout")), OBJECT_STORAGE_TIMEOUT_MS);
    });
    const result = await Promise.race([objectStorage().exists(key), timeout]);
    return result.ok ? result.value : false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sniff the leading magic bytes to confirm the uploaded object really is the
 * image type it claims. The direct-PUT path means bytes never pass through the
 * app on the way in, so finalize MUST verify content here before trusting it.
 * Returns the detected MIME or null when it is neither a PNG nor a JPEG.
 */
export function sniffImageMime(buf: Buffer): "image/png" | "image/jpeg" | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
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

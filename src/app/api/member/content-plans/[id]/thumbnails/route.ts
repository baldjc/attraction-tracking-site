import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { PRODUCTION_TIERS } from "@/lib/content-plan-utils";
import {
  ensureVideoFolderForPlan,
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

export const runtime = "nodejs";

const MAX_VARIANTS = 4;

// POST — upload a new thumbnail A/B variant. Production-tier members store the
// image in the plan's Google Drive folder; everyone else uses Object Storage.
// Falls back to Object Storage if Drive is unavailable so an upload never fails
// silently. Returns the full updated variant list.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    select: { id: true, thumbnailVariants: true, driveFolderLink: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cheap pre-check for a friendly error before we read the upload body; the
  // authoritative cap is re-checked inside the row lock below.
  if (parseVariants(plan.thumbnailVariants).length >= MAX_VARIANTS) {
    return NextResponse.json({ error: `Maximum of ${MAX_VARIANTS} thumbnails.` }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
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

  const buf = Buffer.from(await file.arrayBuffer());
  const variantId = randomUUID();
  const ext = extForMime(file.type);
  const now = new Date().toISOString();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { serviceTier: true },
  });
  const isProduction = !!dbUser?.serviceTier && PRODUCTION_TIERS.includes(dbUser.serviceTier);

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

  let variant: ThumbnailVariant | null = null;
  if (isProduction) {
    let folderUrl: string | null = plan.driveFolderLink;
    if (!folderUrl) {
      const ensured = await ensureVideoFolderForPlan(id, user.id);
      folderUrl = ensured?.folderUrl ?? null;
    }
    const folderId = folderIdFromUrl(folderUrl);
    if (folderId) {
      const uploaded = await uploadBinaryToFolder(
        folderId,
        `thumbnail-${variantId}.${ext}`,
        buf,
        file.type,
      );
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
  }
  if (!variant) {
    variant = await storeInObjectStorage();
  }
  const newVariant = variant;

  // Best-effort cleanup of the just-stored bytes/file so a rejected upload
  // (cap hit, plan vanished, DB error) never leaves an orphan in either backend.
  const cleanupStored = async () => {
    if (newVariant.storage === "object" && newVariant.key) {
      await deleteThumbnailBytes(newVariant.key);
    } else if (newVariant.storage === "drive" && newVariant.driveFileId) {
      await deleteDriveFile(newVariant.driveFileId);
    }
  };

  let result: { variants: ThumbnailVariant[]; winnerId: string | null } | null;
  try {
    result = await updateVariantsLocked(id, user.id, (current, winnerId) => {
      if (current.length >= MAX_VARIANTS) {
        throw new Error("MAX_VARIANTS");
      }
      return { variants: [...current, newVariant], winnerId };
    });
  } catch (err) {
    await cleanupStored();
    if (err instanceof Error && err.message === "MAX_VARIANTS") {
      return NextResponse.json({ error: `Maximum of ${MAX_VARIANTS} thumbnails.` }, { status: 400 });
    }
    console.error("[thumbnails] write failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
  if (!result) {
    await cleanupStored();
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ variants: result.variants });
}

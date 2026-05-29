import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { fetchDriveFileBytes, deleteDriveFile } from "@/lib/google-drive";
import {
  type ThumbnailVariant,
  parseVariants,
  getThumbnailBytes,
  deleteThumbnailBytes,
  updateVariantsLocked,
} from "@/lib/content-thumbnails";

export const runtime = "nodejs";

// GET — stream a single thumbnail variant's bytes through our own origin
// (Object Storage or Drive). Owner-only; impersonating staff resolve to the
// member via resolveUserFromSession so they inherit access.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, variantId } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, userId: user.id },
    select: { thumbnailVariants: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const variant = parseVariants(plan.thumbnailVariants).find((v) => v.id === variantId);
  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Buffer | null = null;
  try {
    if (variant.storage === "drive" && variant.driveFileId) {
      const file = await fetchDriveFileBytes(variant.driveFileId);
      bytes = file?.buffer ?? null;
    } else if (variant.storage === "object" && variant.key) {
      bytes = await getThumbnailBytes(variant.key);
    }
  } catch (err) {
    console.error("[thumbnails] fetch failed:", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
  if (!bytes) return NextResponse.json({ error: "Fetch failed" }, { status: 502 });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": variant.mimeType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}

// DELETE — remove a variant (and its stored bytes for Object Storage). Clears
// the winner pointer if this was the picked winner.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, variantId } = await params;

  let removed: ThumbnailVariant | undefined;
  const result = await updateVariantsLocked(id, user.id, (current, winnerId) => {
    removed = current.find((v) => v.id === variantId);
    const remaining = current.filter((v) => v.id !== variantId);
    return {
      variants: remaining,
      winnerId: winnerId === variantId ? null : winnerId,
    };
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort byte cleanup happens after the row write commits.
  if (removed.storage === "object" && removed.key) {
    await deleteThumbnailBytes(removed.key);
  } else if (removed.storage === "drive" && removed.driveFileId) {
    await deleteDriveFile(removed.driveFileId);
  }

  return NextResponse.json({
    variants: result.variants,
    thumbnailWinnerId: result.winnerId,
  });
}

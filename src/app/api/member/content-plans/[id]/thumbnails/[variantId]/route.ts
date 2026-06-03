import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import { fetchDriveFileBytes, deleteDriveFile } from "@/lib/google-drive";
import {
  type ThumbnailVariant,
  parseVariants,
  getThumbnailBytes,
  deleteThumbnailBytes,
  updateVariantsLocked,
  extForMime,
} from "@/lib/content-thumbnails";

export const runtime = "nodejs";

// GET — stream a single thumbnail variant's bytes through our own origin
// (Object Storage or Drive). Owner-only; impersonating staff resolve to the
// member via resolveUserFromSession so they inherit access. Pass ?download=1 to
// force a file download (Content-Disposition: attachment) instead of inline.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // auth() here complements resolveUserFromSession above: we need the ACTUAL
  // signed-in account's role for the staff-bypass check (canStaffAccessMember),
  // not the impersonated member's. Mirrors the /thumbnail proxy route so staff
  // viewing a member's plans (without impersonating) still see A/B thumbnails.
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "editor";

  const { id, variantId } = await params;
  const plan = await prisma.contentPlan.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true, thumbnailVariants: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.userId !== user.id) {
    if (!isStaff) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const staffId = (session?.user as { id?: string } | undefined)?.id;
    if (!staffId || !(await canStaffAccessMember(staffId, plan.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

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

  const headers: Record<string, string> = {
    "Content-Type": variant.mimeType || "image/jpeg",
    "Cache-Control": "private, max-age=300",
  };
  if (req.nextUrl.searchParams.get("download") === "1") {
    // Strip control chars, quotes, backslashes and path separators so a crafted
    // filename can never break the header or escape the download name.
    const cleaned = (variant.fileName || "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F"\\/]+/g, "")
      .trim();
    const safeName = cleaned || `thumbnail-${variantId}.${extForMime(variant.mimeType)}`;
    const utf8Name = encodeURIComponent(safeName);
    headers["Content-Disposition"] =
      `attachment; filename="${safeName}"; filename*=UTF-8''${utf8Name}`;
  }

  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
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
  // A variant can now carry BOTH an Object-Storage key and a Drive copy (the
  // direct-upload flow stores to Object Storage, then mirrors into Drive), so
  // clean up each independently rather than as mutually-exclusive branches.
  if (removed.key) {
    await deleteThumbnailBytes(removed.key);
  }
  if (removed.driveFileId) {
    await deleteDriveFile(removed.driveFileId);
  }

  return NextResponse.json({
    variants: result.variants,
    thumbnailWinnerId: result.winnerId,
  });
}

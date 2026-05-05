import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveUserFromSession } from "@/lib/session-utils";
import { canStaffAccessMember } from "@/lib/staff-access";
import { fetchDriveFileBytes } from "@/lib/google-drive";

// Streams the Drive file currently selected as the plan's thumbnail through
// our own origin. Same-origin keeps Next/Image happy and avoids ever leaking
// service-account URLs to the client. Auth: plan owner OR scoped staff
// (admins/editors who already have access to that specific member account —
// matches the rest of the admin member-data routes).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStaff = role === "admin" || role === "editor";

  const { id } = await params;
  const plan = await prisma.contentPlan.findUnique({
    where: { id },
    select: { userId: true, thumbnailFileId: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.userId !== user.id) {
    if (!isStaff) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const staffId = (session?.user as { id?: string } | undefined)?.id;
    if (!staffId || !(await canStaffAccessMember(staffId, plan.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (!plan.thumbnailFileId) {
    return NextResponse.json({ error: "No thumbnail set" }, { status: 404 });
  }

  const file = await fetchDriveFileBytes(plan.thumbnailFileId);
  if (!file) return NextResponse.json({ error: "Drive fetch failed" }, { status: 502 });

  // Only serve images — guard against members repointing this at non-image
  // mime types (we'd render a broken image otherwise).
  if (!file.mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      // Short private cache — file id changes when the user picks a different
      // image, so this only fights re-renders inside the same session.
      "Cache-Control": "private, max-age=300",
    },
  });
}

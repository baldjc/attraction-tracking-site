import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createMemberFolder } from "@/lib/google-drive";

async function checkAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return session?.user && (role === "admin" || role === "editor") ? session : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, assetsDriveLink: true },
  });

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // If folder already exists, return it
  if (member.assetsDriveLink) {
    return NextResponse.json({ assetsDriveLink: member.assetsDriveLink });
  }

  const memberName = member.fullName || member.email || id;

  let assetsDriveLink: string;
  try {
    assetsDriveLink = await createMemberFolder(memberName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google Drive error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { assetsDriveLink },
    select: { id: true, assetsDriveLink: true },
  });

  return NextResponse.json({ assetsDriveLink: updated.assetsDriveLink });
}

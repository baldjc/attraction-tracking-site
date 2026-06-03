import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { migrateFoldersToSharedDrive, DriveError } from "@/lib/google-drive";

export const runtime = "nodejs";
// Moving every legacy folder is rate-limited (~100ms/call), so allow plenty of
// wall time for the bulk run.
export const maxDuration = 300;

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as { id: string }).id;
}

// POST — relocate legacy My-Drive plan folders into the Shared Drive. Idempotent
// and rate-limited; safe to re-run. Destination is GOOGLE_DRIVE_ROOT_FOLDER_ID
// (validated to be a Shared Drive). Admin-only.
export async function POST() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await migrateFoldersToSharedDrive();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    if (err instanceof DriveError) {
      return NextResponse.json(
        { ok: false, error: err.userMessage, category: err.category, detail: err.message },
        { status: 400 }
      );
    }
    throw err;
  }
}

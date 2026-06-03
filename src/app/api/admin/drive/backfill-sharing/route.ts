import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { backfillFolderSharing } from "@/lib/google-drive";

export const runtime = "nodejs";
// Bulk Drive sharing can take a while across many folders (rate-limited).
export const maxDuration = 300;

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "admin") return null;
  return (session.user as { id: string }).id;
}

// POST — apply the Phase 3 sharing rules (member + active team + support) to
// every existing ContentPlan folder. Idempotent and rate-limited; safe to
// re-run. Admin-only.
export async function POST() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await backfillFolderSharing();
  return NextResponse.json({ ok: true, ...summary });
}

/**
 * GET /api/member/content-planner/wizard/story-leads
 *
 * Wave 2 wizard, Step 2A. Returns the user's latest validated upload's
 * MarketStoryLead rows so the Story Lead browser can render cards without
 * the client touching Prisma directly.
 *
 * Flag-gated on `tool_content_engine_v2` — admins/editors bypass.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { loadLatestValidatedUpload } from "@/lib/content-engine-context";

export const runtime = "nodejs";

export async function GET() {
  // Impersonation-aware — must resolve to the impersonated member so the
  // wizard's Step 2A story leads load from the member's upload, not the
  // admin account (which has none). Mirrors the wizard page gate fix.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return NextResponse.json(
      { error: "no_validated_upload", leads: [], upload: null },
      { status: 200 },
    );
  }

  const leads = await prisma.marketStoryLead.findMany({
    where: { userId, uploadId: upload.id },
    orderBy: [{ isThesisLead: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      scanType: true,
      pattern: true,
      dataThreads: true,
      whyItMatters: true,
      suggestedRotationSlot: true,
      suggestedSubPersonas: true,
      suggestedFramework: true,
      tactileType: true,
      label: true,
      isThesisLead: true,
    },
  });

  return NextResponse.json({
    upload: { id: upload.id, monthYear: upload.monthYear, label: upload.label },
    leads,
  });
}

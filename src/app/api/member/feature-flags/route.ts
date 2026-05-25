import { NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pass userId + userRole so v2 flags with allowlist gating (e.g.
  // `tool_script_builder_v2.allowedUserIds`) resolve correctly for this
  // member. Without these, allowlist-gated flags always return false here
  // even when the member is on the list — that masks the entire v2 client
  // surface (e.g. the Build Script v2 button on ContentPlannerClient).
  const flags = await getFeatureFlags({ userId: user.id, userRole: user.role });
  return NextResponse.json({ flags });
}

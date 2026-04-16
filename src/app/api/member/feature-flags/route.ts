import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  const { user, error } = await resolveUserFromSession(req);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flags = await getFeatureFlags();
  return NextResponse.json({ flags });
}

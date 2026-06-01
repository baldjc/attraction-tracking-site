// Load / save the member's metric methodology settings ("How we calculate your
// stats"). Backs the settings panel's initial load, Save, and Reset actions.
//
//   GET  -> { settings, preset }   (Default preset when the member has no row)
//   POST -> body is a MemberMethodologySettings (or partial); normalized and
//           upserted. Reset is just a POST of the Default preset from the client.
//
// Saving only persists the choice; it does NOT retroactively re-run the
// validator — new uploads pick the settings up automatically, and the
// /api/member/methodology-revalidate route is the explicit retroactive path.

import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import {
  loadMemberMetricSettings,
  saveMemberMetricSettings,
} from "@/lib/member-metric-settings-server";
import { detectPreset } from "@/lib/member-metric-settings";

export const runtime = "nodejs";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await loadMemberMetricSettings(user.id);
  return NextResponse.json({ settings, preset: detectPreset(settings) });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // saveMemberMetricSettings normalizes untrusted input (unknown/invalid fields
  // fall back to the Default preset), so a malformed body can never persist a
  // bad variant — it just collapses unrecognized fields to Default.
  const settings = await saveMemberMetricSettings(user.id, body);
  return NextResponse.json({ ok: true, settings, preset: detectPreset(settings) });
}

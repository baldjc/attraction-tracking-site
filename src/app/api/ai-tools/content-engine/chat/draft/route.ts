/**
 * Wave 4 — DEPRECATED, no-op shim.
 *
 * The `ContentEngineDraft` table was reshaped in `add_content_engine_draft`
 * (Wave 4) for the new wizard, dropping the (userId, theme) unique
 * constraint and the `messages` column this v1 chat used to read/write.
 *
 * The v1 Content Engine chat (ContentEngineChat.tsx → ThemeDashboard.tsx)
 * still hits these endpoints to auto-save its in-flight conversation, but
 * we're intentionally not persisting v1 drafts anymore — members should be
 * using the new wizard, which has its own draft persistence at
 * `/api/member/content-planner/wizard/draft`.
 *
 * Returning success here keeps the v1 chat working (it just won't restore
 * a partial conversation after refresh) until the v1 surface is removed
 * entirely.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ draft: null });
}

export async function POST() {
  return NextResponse.json({ draft: null });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}

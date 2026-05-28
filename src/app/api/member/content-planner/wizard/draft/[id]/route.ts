/**
 * Wave 4 beta (Finding 11) — Per-draft persistence endpoint.
 *
 *   PATCH  /api/member/content-planner/wizard/draft/[id]
 *     → updates the named draft. Verifies ownership (draft.userId ===
 *       session.user.id) before any write. Resets expiresAt to now+14d
 *       on every successful update so an actively-saved draft never
 *       expires out from under the member.
 *
 *   DELETE /api/member/content-planner/wizard/draft/[id]
 *     → deletes the named draft. Same ownership check. Idempotent — a
 *       404 from a re-issued DELETE is acceptable to the client.
 *
 * The plural-singleton GET/POST/DELETE live in ../route.ts. POST creates
 * a brand new draft and returns its id; subsequent autosaves PATCH this
 * route. Two browser tabs → two independent drafts (Finding 12).
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { parsePropertyTypeFocus } from "@/lib/property-type-focus";
import { deriveLeadPropertyTypeLock } from "@/lib/content-engine-context";

export const runtime = "nodejs";

const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface DraftBody {
  currentStep?: string;
  propertyTypeFocus?: string | null;
  storyLeadId?: string | null;
  rotationSlot?: string | null;
  validatedIdea?: string | null;
  storyLeadFactIds?: unknown;
  generatedIdeaCards?: unknown;
  validationContext?: unknown;
  pickedKey?: string | null;
}

const KNOWN_STEPS = new Set(["1", "2a", "2b", "2c", "3", "4"]);

async function gateOrError() {
  // Impersonation-aware so draft ownership checks key on the
  // impersonated member, not the admin account.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const userId = resolved.id;
  const userRole = resolved.role;
  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    return { error: NextResponse.json({ error: "Not enabled" }, { status: 404 }) };
  }
  return { userId };
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;
  const { id } = await ctx.params;

  let body: DraftBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.currentStep || !KNOWN_STEPS.has(body.currentStep)) {
    return NextResponse.json(
      { error: "invalid_current_step" },
      { status: 400 },
    );
  }

  const focus = parsePropertyTypeFocus(body.propertyTypeFocus ?? null);
  let focusForDb = focus === "Any" ? null : focus;

  // Wave 12 Fix 2 — Story Lead → property-type auto-lock. Mirrors the
  // POST handler in ../route.ts: when the autosaved draft now points
  // to a Story Lead and the member hasn't explicitly locked a
  // property type, derive the lock from the lead's hood-anchored
  // facts. The leadSpansMultipleTypes flag rides alongside so the
  // BUYER AUDIENCE CONSISTENCY hard rule downstream knows when to
  // honour the dual-audience exception.
  const storyLeadId =
    typeof body.storyLeadId === "string" ? body.storyLeadId : null;
  // When derived === null (transient missing-context path: lead/config/
  // upload temporarily unavailable), we leave the existing
  // leadSpansMultipleTypes value alone rather than clobbering it back to
  // false. When storyLeadId is null we reset the flag to false — the
  // member has detached the draft from a lead.
  let leadSpansMultipleTypesUpdate: boolean | undefined;
  if (storyLeadId) {
    const derived = await deriveLeadPropertyTypeLock(userId, storyLeadId);
    if (derived) {
      if (focusForDb == null && derived.propertyTypeFocus) {
        focusForDb = derived.propertyTypeFocus;
      }
      leadSpansMultipleTypesUpdate = derived.leadSpansMultipleTypes;
    }
  } else {
    leadSpansMultipleTypesUpdate = false;
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  // User-scoped — never widen without auth review. updateMany with
  // BOTH {id, userId} in the WHERE is atomically race-safe: it both
  // enforces ownership AND cleanly returns count=0 (→ 404) if the
  // draft was deleted between the autosave being queued and reaching
  // the DB, instead of throwing P2025. The client's PATCH wrapper
  // catches 404 and falls back to POSTing a fresh draft so the
  // member doesn't lose work.
  const result = await prisma.contentEngineDraft.updateMany({
    where: { id, userId },
    data: {
      currentStep: body.currentStep,
      propertyTypeFocus: focusForDb,
      storyLeadId,
      ...(leadSpansMultipleTypesUpdate !== undefined
        ? { leadSpansMultipleTypes: leadSpansMultipleTypesUpdate }
        : {}),
      rotationSlot: typeof body.rotationSlot === "string" ? body.rotationSlot : null,
      validatedIdea:
        typeof body.validatedIdea === "string"
          ? body.validatedIdea.slice(0, 2000)
          : null,
      storyLeadFactIds: (body.storyLeadFactIds ?? null) as never,
      generatedIdeaCards: (body.generatedIdeaCards ?? null) as never,
      validationContext: (body.validationContext ?? null) as never,
      pickedKey: typeof body.pickedKey === "string" ? body.pickedKey : null,
      expiresAt,
    },
  });
  if (result.count === 0) {
    // Either the id never belonged to the caller, or it was deleted
    // under us. 404 (not 403) keeps other members' draft ids opaque.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const draft = await prisma.contentEngineDraft.findUnique({ where: { id } });
  return NextResponse.json({ draft });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const gate = await gateOrError();
  if ("error" in gate) return gate.error;
  const { userId } = gate;
  const { id } = await ctx.params;

  // User-scoped — never widen without auth review. deleteMany with both
  // {id, userId} in the WHERE means a member can never delete another
  // member's draft even by guessing/leaking an id. Idempotent: returns
  // count=0 when the id has already been deleted.
  const result = await prisma.contentEngineDraft.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

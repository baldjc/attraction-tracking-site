import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { FEATURE_SETTING_KEY, type FlagValue } from "@/lib/feature-flags";
import { mapServiceTierToCohort } from "@/lib/onboarding-tier";
import { logAdminAction } from "@/lib/admin-log";

/**
 * Beta Cohort Manager admin API.
 *
 * Manages the 8-15 person v2 beta cohort. "In beta" means a member's UUID is
 * present in the allowlists of every v2 feature flag that applies to their
 * tier (DWY gets the voice-guide flag on top of the universal v2 flags). The
 * tool also resets/completes their onboarding state in lock-step so beta
 * activation doubles as a "show them the wizard" trigger.
 *
 * IMPORTANT — storage layout: feature flags live in ONE AppSetting row with
 * key `feature_visibility`, whose value is JSON.stringify of
 * Record<flagKey, boolean | {enabled, allowedUserIds}>. The original spec
 * assumed one row per flag — that's wrong for this codebase. All mutations
 * here read the single row, mutate the inner JSON, write back atomically.
 */

// v2 flags every beta member gets, regardless of tier.
const V2_UNIVERSAL_FLAGS = [
  "tool_market_data",
  "tool_fact_validator",
  "tool_content_engine_v2",
  "tool_idea_validation",
  "tool_script_builder_v2",
  "tool_home_tour_mode",
  "tool_neighbourhood_knowledge",
  "nav_v2_hub",
] as const;

// Extra flags only DWY members need.
const DWY_ONLY_FLAGS = ["tool_member_voice_guide"] as const;

type StoredFlagMap = Record<string, FlagValue>;

async function requireAdmin() {
  const session = await auth();
  const sessionUser = session?.user as
    | { id?: string; email?: string; role?: string }
    | undefined;
  if (!sessionUser || sessionUser.role !== "admin" || !sessionUser.id) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, actor: sessionUser as { id: string; email: string; role: string } };
}

async function readFlagMap(): Promise<StoredFlagMap> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });
  if (!setting) return {};
  try {
    return JSON.parse(setting.value) as StoredFlagMap;
  } catch {
    return {};
  }
}

async function writeFlagMap(map: StoredFlagMap) {
  await prisma.appSetting.upsert({
    where: { key: FEATURE_SETTING_KEY },
    create: { key: FEATURE_SETTING_KEY, value: JSON.stringify(map) },
    update: { value: JSON.stringify(map) },
  });
}

function allowlistOf(value: FlagValue | undefined): string[] {
  if (!value || typeof value !== "object") return [];
  return Array.isArray(value.allowedUserIds) ? value.allowedUserIds : [];
}

function flagsForCohort(cohort: ReturnType<typeof mapServiceTierToCohort>) {
  return cohort === "DWY"
    ? [...V2_UNIVERSAL_FLAGS, ...DWY_ONLY_FLAGS]
    : [...V2_UNIVERSAL_FLAGS];
}

// ────────────────────────────────────────────────────────────────────────────
// GET — list members with beta status + onboarding-pending flag.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const search = (new URL(req.url).searchParams.get("search") ?? "").trim();

  const members = await prisma.user.findMany({
    where: {
      // Only real members — staff have all flags via the admin bypass anyway.
      role: { notIn: ["admin", "editor"] },
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { fullName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      serviceTier: true,
      onboardingCompletedAt: true,
    },
    take: 50,
    orderBy: { fullName: "asc" },
  });

  const flagMap = await readFlagMap();
  // Snapshot every relevant flag's allowlist once so we don't recompute per row.
  const allLists = new Map<string, string[]>();
  for (const key of [...V2_UNIVERSAL_FLAGS, ...DWY_ONLY_FLAGS]) {
    allLists.set(key, allowlistOf(flagMap[key]));
  }

  const enriched = members.map((m) => {
    const cohort = mapServiceTierToCohort(m.serviceTier);
    const relevantFlags = flagsForCohort(cohort);
    const inBeta = relevantFlags.every((flag) =>
      (allLists.get(flag) ?? []).includes(m.id),
    );
    return {
      id: m.id,
      email: m.email,
      name: m.fullName,
      serviceTier: m.serviceTier,
      cohort,
      inBeta,
      onboardingPending: m.onboardingCompletedAt === null,
    };
  });

  // Cohort summary — names of every current beta member, for the page's
  // "currently in beta" card. Cheaper to compute server-side than to refetch
  // a separate list endpoint.
  const allBetaIds = new Set<string>();
  for (const list of allLists.values()) {
    for (const id of list) allBetaIds.add(id);
  }
  const betaMembers = allBetaIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(allBetaIds) } },
        select: { id: true, fullName: true, email: true, serviceTier: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  return NextResponse.json({
    members: enriched,
    betaSummary: {
      count: betaMembers.length,
      members: betaMembers.map((b) => ({
        id: b.id,
        name: b.fullName,
        email: b.email,
        serviceTier: b.serviceTier,
      })),
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// POST — add member to beta (reset onboarding + add to allowlists).
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, serviceTier: true, role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }
  if (member.role === "admin" || member.role === "editor") {
    return NextResponse.json(
      { error: "staff accounts bypass flags; beta toggle is a no-op" },
      { status: 400 },
    );
  }

  const cohort = mapServiceTierToCohort(member.serviceTier);
  const flagsToUpdate = flagsForCohort(cohort);

  // Read + mutate + write the single feature_visibility row in one go so
  // we don't race against the regular feature-visibility editor.
  const flagMap = await readFlagMap();
  for (const key of flagsToUpdate) {
    const current = flagMap[key];
    const existingList =
      current && typeof current === "object" ? allowlistOf(current) : [];
    const enabled =
      current && typeof current === "object" ? !!current.enabled : false;
    if (!existingList.includes(userId)) {
      flagMap[key] = { enabled, allowedUserIds: [...existingList, userId] };
    } else if (!current || typeof current !== "object") {
      // Was a bare boolean — promote to object shape preserving truthiness.
      flagMap[key] = { enabled: current === true, allowedUserIds: [userId] };
    }
  }
  await writeFlagMap(flagMap);

  // Reset onboarding so the wizard fires on next dashboard visit.
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompletedAt: null,
      onboardingStep: 0,
      onboardingSkippedAt: null,
      // Also clear the legacy completion flag — OnboardingRedirect /
      // dashboard banner short-circuit on it.
      onboardingComplete: false,
    },
  });

  await logAdminAction({
    actorId: gate.actor.id,
    actorEmail: gate.actor.email,
    action: "beta_cohort_add",
    targetType: "user",
    targetId: userId,
    details: { cohort, flags: flagsToUpdate, memberEmail: member.email },
  });

  return NextResponse.json({
    ok: true,
    message: "Added to beta. They'll see the wizard on next login.",
  });
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE — remove member from beta (complete onboarding + strip allowlists).
// ────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!member) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  // Strip from every v2 flag's allowlist (universal AND DWY-only — covers the
  // case where a member was demoted from DWY tier after being added to beta).
  const flagMap = await readFlagMap();
  const allFlags = [...V2_UNIVERSAL_FLAGS, ...DWY_ONLY_FLAGS];
  for (const key of allFlags) {
    const current = flagMap[key];
    if (!current || typeof current !== "object") continue;
    const list = allowlistOf(current).filter((id) => id !== userId);
    flagMap[key] = { enabled: !!current.enabled, allowedUserIds: list };
  }
  await writeFlagMap(flagMap);

  // Mark onboarding complete so the wizard doesn't keep nudging them.
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompletedAt: new Date(),
      onboardingComplete: true,
    },
  });

  await logAdminAction({
    actorId: gate.actor.id,
    actorEmail: gate.actor.email,
    action: "beta_cohort_remove",
    targetType: "user",
    targetId: userId,
    details: { memberEmail: member.email },
  });

  return NextResponse.json({
    ok: true,
    message: "Removed from beta. They now see v1 features only.",
  });
}

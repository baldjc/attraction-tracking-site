import prisma from "@/lib/prisma";

export const FEATURE_SETTING_KEY = "feature_visibility";

export interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  content_calendar: boolean;
  client_hub: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
  tool_repurpose_content: boolean;
  tool_repurpose_newsletter: boolean;
  tool_repurpose_linkedin: boolean;
  tool_repurpose_facebook: boolean;
  tool_repurpose_blog: boolean;
  tool_repurpose_postcard: boolean;
  tool_description_generator: boolean;
  tool_listing_video_builder: boolean;
  // Wave 0 (data-first rebuild) — new v2 flags. These are the ONLY flags that
  // are allowed to use the object `{ enabled, allowedUserIds }` form in the
  // stored AppSetting value. Existing boolean flags above MUST stay boolean
  // forever — the 19 bare callsites of getFeatureFlags() rely on it.
  tool_market_data: boolean;
  tool_fact_validator: boolean;
  tool_content_engine_v2: boolean;
  tool_idea_validation: boolean;
  tool_script_builder_v2: boolean;
  tool_home_tour_mode: boolean;
  tool_neighbourhood_knowledge: boolean;
  // Ship B — Done-With-You member voice guide upload. Default closed; admin
  // gates per-user via the object form `{ enabled, allowedUserIds }` so DWY
  // tier members (and Jared's test account) see the upload UI inside
  // SetupForm while Foundations members never see the section at all.
  tool_member_voice_guide: boolean;
  nav_v2_hub: boolean;
  [key: string]: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export const DEFAULT_FLAGS: FeatureFlags = {
  campaigns: true,
  ai_tools: true,
  resources: true,
  content_calendar: true,
  client_hub: true,
  tool_avatar_architect: true,
  tool_content_engine: true,
  tool_arc_script_builder: true,
  tool_title_analyzer: true,
  tool_script_review: true,
  tool_repurpose_content: true,
  tool_repurpose_newsletter: true,
  tool_repurpose_linkedin: true,
  tool_repurpose_facebook: true,
  tool_repurpose_blog: true,
  tool_repurpose_postcard: true,
  tool_description_generator: true,
  tool_listing_video_builder: false,
  plan_artifacts_v1: false,
  progress_track_v1: false,
  tool_planner_linkage: false,
  saved_ideas_page: false,
  upgrade_moments: false,
  team_pipeline: false,
  drive_auto_upload: false,
  planner_pipeline_view: false,
  flow_metrics: false,
  // Wave 0 — v2 data-first flags (default closed, per-user allowlist supported)
  tool_market_data: false,
  tool_fact_validator: false,
  tool_content_engine_v2: false,
  tool_idea_validation: false,
  tool_script_builder_v2: false,
  tool_home_tour_mode: false,
  tool_neighbourhood_knowledge: false,
  tool_member_voice_guide: false,
  nav_v2_hub: false,
};

/**
 * Stored shape of an individual flag value in the `feature_visibility`
 * AppSetting JSON. Existing flags use the boolean form. v2 flags introduced
 * in Wave 0 may use the object form to gate visibility per-user (e.g. to let
 * the "Jared Chamberlain" member account see v2 features while other members
 * still don't).
 */
export type FlagValue = boolean | { enabled?: boolean; allowedUserIds?: string[] };

function resolveFlag(value: FlagValue, userId?: string): boolean {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    if (value.enabled === true) return true;
    if (
      userId &&
      Array.isArray(value.allowedUserIds) &&
      value.allowedUserIds.includes(userId)
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Read feature flags from the database.
 *
 * Backward compatible: existing callsites call `getFeatureFlags()` with no
 * args and continue to work — boolean flag values resolve as-is. To gate a v2
 * flag with an allowlist, pass `{ userId, userRole }` from the NextAuth
 * session. Admin / editor bypass all flags (existing behavior).
 *
 * Wave 0 contract: ONLY v2 flags are allowed to use the object
 * `{ enabled, allowedUserIds }` form in the stored JSON. Existing boolean
 * flags must stay boolean — the 19 bare callsites depend on this.
 */
export async function getFeatureFlags(opts?: {
  userId?: string;
  userRole?: string | null;
}): Promise<FeatureFlags> {
  const { userId, userRole } = opts || {};

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: FEATURE_SETTING_KEY },
    });
    if (!setting) return { ...DEFAULT_FLAGS };

    const parsed = JSON.parse(setting.value) as Record<string, FlagValue>;

    // Admin / editor bypass: every flag evaluates to true regardless of
    // the stored value. This matches the pre-Wave-0 behavior where admin
    // saw everything — EXCEPT while impersonating a member. The whole point
    // of impersonation is to see exactly what the member sees, so when an
    // impersonation cookie is present we drop the bypass and evaluate the
    // member's actual access (allowlist + tier + enabled flag).
    let isStaff = userRole === "admin" || userRole === "editor";
    if (isStaff) {
      try {
        const { cookies } = await import("next/headers");
        const { IMPERSONATE_COOKIE, IMPERSONATE_ADMIN_VIEW_COOKIE } = await import(
          "@/lib/impersonate-constants"
        );
        const cookieStore = await cookies();
        const impersonating = !!cookieStore.get(IMPERSONATE_COOKIE)?.value;
        // Admin-view override: while impersonating, the admin can flip back to
        // the staff bypass (see all v2 features) to debug/support, still scoped
        // to the member's data. Without it, impersonation shows exactly what the
        // member sees.
        const adminViewOverride =
          cookieStore.get(IMPERSONATE_ADMIN_VIEW_COOKIE)?.value === "true";
        if (impersonating && !adminViewOverride) isStaff = false;
      } catch {
        // Outside a request scope (e.g. cron) — no impersonation possible.
      }
    }

    const result: Record<string, boolean> = { ...DEFAULT_FLAGS };
    for (const [key, value] of Object.entries(parsed)) {
      if (isStaff) {
        result[key] = true;
      } else {
        result[key] = resolveFlag(value, userId);
      }
    }
    return result as FeatureFlags;
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

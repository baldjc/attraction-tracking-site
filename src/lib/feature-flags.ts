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
  // Jarvis (AI Content Manager) — closed by default, gated per-user via the
  // object form `{ enabled, allowedUserIds }` to the wave's two pilot members.
  tool_jarvis: boolean;
  nav_v2_hub: boolean;
  // Task #52 — durable job queue rollout. Object form `{ enabled,
  // allowedUserIds }` supported so the queue can be turned on per-member (or an
  // admin's own account) before flipping it on globally.
  durable_job_queue: boolean;
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
  tool_jarvis: false,
  nav_v2_hub: false,
  durable_job_queue: false,
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
        const { IMPERSONATE_COOKIE } = await import("@/lib/impersonate-constants");
        const cookieStore = await cookies();
        if (cookieStore.get(IMPERSONATE_COOKIE)?.value) isStaff = false;
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

/**
 * Whether the durable job queue is enabled for a specific user.
 *
 * Resolved per OWNING user with NO staff bypass — we pass only `userId` (no
 * role), so an admin triggering work on behalf of a member doesn't accidentally
 * force the queue path for that member. During rollout, gate via the object form
 * `{ enabled, allowedUserIds }`; flip `enabled: true` to turn it on globally.
 */
export async function isDurableQueueEnabledForUser(
  userId: string | null | undefined,
): Promise<boolean> {
  const flags = await getFeatureFlags(userId ? { userId } : undefined);
  return flags.durable_job_queue === true;
}

/**
 * Launch-gate KILL-SWITCH for the Content Planner + the member-data migration.
 *
 * Stored as an OBJECT-form flag in the `feature_visibility` AppSetting under
 * this key. When it resolves TRUE for a user, all Content-Planner *writes*
 * (new-plan creation, which is also how a migration moves a member's work in)
 * are refused — instantly halting a bad rollout without touching any data:
 *
 *   - `{ "enabled": true }`                          → halted for EVERY member (global)
 *   - `{ "enabled": false, "allowedUserIds": [id] }` → halted for THOSE members (per-member)
 *   - absent / `{ "enabled": false, "allowedUserIds": [] }` → planner runs (default)
 *
 * Deliberately NOT in DEFAULT_FLAGS so the admin feature-visibility PUT can set
 * it in object form the first time (the PUT's shape-preservation contract locks
 * any key that already exists as a boolean default). It is resolved by reading
 * the raw AppSetting with NO staff bypass (only `userId`), exactly like the
 * durable-queue resolver, so an admin acting for a member can't accidentally
 * invert the halt. Non-destructive (existing plans stay readable) and
 * fail-OPEN: a flag-read error never halts the planner — an incident response
 * flips this switch deliberately.
 */
export const PLANNER_KILL_SWITCH_KEY = "planner_kill_switch";

export async function isPlannerKillSwitchActiveForUser(
  userId: string | null | undefined,
): Promise<boolean> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: FEATURE_SETTING_KEY },
    });
    if (!setting) return false;
    const parsed = JSON.parse(setting.value) as Record<string, FlagValue>;
    const v = parsed[PLANNER_KILL_SWITCH_KEY];
    if (v === undefined) return false;
    return resolveFlag(v, userId ?? undefined);
  } catch (err) {
    // Fail-OPEN, but loudly: a break-glass control that silently mis-reads is
    // worse than one that logs. We still prefer availability (a flaky config
    // read must not self-DOS the planner) — an incident response flips the
    // switch deliberately, so a read error means "keep running, alert ops".
    console.error(
      "[planner_kill_switch] flag read failed — defaulting to NOT halted:",
      (err as Error)?.message ?? err,
    );
    return false;
  }
}

/**
 * Market re-aggregation kill-switch — break-glass control for the dual-run
 * window. When active for a member, the DESTRUCTIVE re-aggregation paths
 * (admin re-validate, member methodology re-validate, KB merge-apply, KB reset)
 * return HTTP 423 so a re-run can't delete-before-replace the member's existing
 * market_facts / aggregated_metrics / market_story_leads (the shared store the
 * legacy AI tools cite). Brand-NEW monthly uploads are intentionally NOT gated
 * by this — a fresh upload gets its own uploadId with no prior rows to clobber.
 *
 * Independent of `planner_kill_switch` (separate key) so re-aggregation can be
 * frozen WITHOUT blocking plan creation, and vice-versa. Same object-form
 * semantics: `{enabled:true}` = global freeze; `{enabled:false,allowedUserIds:
 * [id]}` = per-member freeze; `{enabled:false,allowedUserIds:[]}` = resume.
 *
 * Same design constraints as the planner switch: NOT in DEFAULT_FLAGS (so the
 * admin feature-visibility PUT can set it in object form), raw AppSetting read
 * with NO staff bypass (only `userId`), and fail-OPEN + loud on read error.
 */
export const MARKET_REAGG_KILL_SWITCH_KEY = "market_reaggregation_kill_switch";

export async function isMarketReaggKillSwitchActiveForUser(
  userId: string | null | undefined,
): Promise<boolean> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: FEATURE_SETTING_KEY },
    });
    if (!setting) return false;
    const parsed = JSON.parse(setting.value) as Record<string, FlagValue>;
    const v = parsed[MARKET_REAGG_KILL_SWITCH_KEY];
    if (v === undefined) return false;
    return resolveFlag(v, userId ?? undefined);
  } catch (err) {
    console.error(
      "[market_reaggregation_kill_switch] flag read failed — defaulting to NOT frozen:",
      (err as Error)?.message ?? err,
    );
    return false;
  }
}

/**
 * Wave 6a cutover — "instant market data". When this resolves TRUE for the
 * OWNING member, a CSV upload's validation splits into two phases: the
 * deterministic aggregates persist and the upload flips `validated` within
 * seconds ("facts ready"), and the Anthropic story-leads/prose pass runs as a
 * SEPARATE background enrichment job (tracked by `MarketDataUpload.storyStatus`,
 * "stories ready"). An Anthropic outage then degrades story prose only — the
 * member's numbers are never blocked and the upload is never marked `failed`
 * for an AI-only failure.
 *
 * INVARIANT: with this OFF (the default), runValidation runs the legacy
 * single-pass path and every read behaves byte-identically to today. So it is
 * deliberately NOT in DEFAULT_FLAGS, and — exactly like the kill-switch
 * resolvers — it is read from the raw `feature_visibility` AppSetting with NO
 * staff bypass (only `userId`). NO staff bypass matters twice here: an admin
 * acting for a member must not accidentally force the cutover path for that
 * member, and an admin impersonating a member must see the member's real path.
 *
 * Object-form semantics (staged rollout, mirrors durable_job_queue):
 *   - `{ "enabled": true }`                          → on for EVERY member (global)
 *   - `{ "enabled": false, "allowedUserIds": [id] }` → on for THOSE members
 *   - absent / `{ "enabled": false, "allowedUserIds": [] }` → legacy path (default)
 *
 * Fail-CLOSED on a read error: the legacy single-pass path is the proven,
 * parity-safe default, so any flag-read failure resolves to OFF.
 */
export const MARKET_INSTANT_CUTOVER_KEY = "market_instant_cutover";

export async function isInstantCutoverEnabledForUser(
  userId: string | null | undefined,
): Promise<boolean> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: FEATURE_SETTING_KEY },
    });
    if (!setting) return false;
    const parsed = JSON.parse(setting.value) as Record<string, FlagValue>;
    const v = parsed[MARKET_INSTANT_CUTOVER_KEY];
    if (v === undefined) return false;
    return resolveFlag(v, userId ?? undefined);
  } catch (err) {
    // Fail-CLOSED: the legacy single-pass path is the parity-safe default, so a
    // flaky flag read must NOT silently switch a member onto the cutover path.
    console.error(
      "[market_instant_cutover] flag read failed — defaulting to OFF (legacy path):",
      (err as Error)?.message ?? err,
    );
    return false;
  }
}

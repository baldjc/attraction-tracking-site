/**
 * Dashboard → Jarvis "Build a script" hand-off (one-shot, member-scoped).
 *
 * The dashboard writes a single pending prompt here, tagged with the member it
 * was created for, then routes to /member/jarvis?thread=new. JarvisChat reads +
 * REMOVES it on mount (one-shot) and only auto-sends it when the seed belongs
 * to the member currently viewing the chat. A seed left over from another
 * member (e.g. after an admin switches who they're impersonating, which reloads
 * the tab but keeps sessionStorage) is cleared and ignored — it never leaks
 * into a different member's conversation.
 *
 * A seed may also carry a `refinePlanId`: the planner "↻ Regenerate" action
 * hands an EXISTING video off to Jarvis in "refine this script" mode, so the
 * refined draft saves BACK to the same planner video instead of creating a new
 * one (see save.ts → routeApprovedDraftToPlanner).
 *
 * Client-only: every function touches sessionStorage and is a no-op on the
 * server / when storage is unavailable.
 */
export const JARVIS_SEED_KEY = "jarvis:seedPrompt";

interface JarvisSeed {
  memberId: string;
  prompt: string;
  /**
   * When set, this seed opens an EXISTING planner video in "refine" mode — the
   * refined script saves back to this ContentPlan instead of creating a new one.
   */
  refinePlanId?: string;
}

/** What a consumed seed yields: the prompt plus, for a refine hand-off, the
 *  planner video id the refined script must save back to. */
export interface ConsumedJarvisSeed {
  prompt: string;
  refinePlanId?: string;
}

/** Stash a one-shot prompt for `memberId`, overwriting any prior pending seed.
 *  Pass `refinePlanId` to hand an existing planner video off in refine mode. */
export function writeJarvisSeed(memberId: string, prompt: string, refinePlanId?: string): void {
  if (!memberId || !prompt.trim()) return;
  try {
    const seed: JarvisSeed = { memberId, prompt };
    if (refinePlanId) seed.refinePlanId = refinePlanId;
    sessionStorage.setItem(JARVIS_SEED_KEY, JSON.stringify(seed));
  } catch {
    /* storage unavailable — hand-off simply won't seed */
  }
}

/**
 * Stash a one-shot REFINE seed: opens planner video `planId` in Jarvis so the
 * member can iterate on its existing script and save the result back to the same
 * video. Thin wrapper over `writeJarvisSeed` to keep the call site explicit.
 */
export function writeJarvisRefineSeed(memberId: string, planId: string, prompt: string): void {
  if (!planId) return;
  writeJarvisSeed(memberId, prompt, planId);
}

/**
 * Read AND remove the pending seed (one-shot). Returns the prompt (and any
 * `refinePlanId`) only when the seed belongs to `currentMemberId`; a foreign or
 * malformed seed is still cleared (so it can't linger) but returns null.
 */
export function consumeJarvisSeed(currentMemberId: string): ConsumedJarvisSeed | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(JARVIS_SEED_KEY);
    if (raw !== null) sessionStorage.removeItem(JARVIS_SEED_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<JarvisSeed>;
    if (!parsed || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) return null;
    if (parsed.memberId !== currentMemberId) return null; // foreign seed → cleared above
    return {
      prompt: parsed.prompt,
      refinePlanId:
        typeof parsed.refinePlanId === "string" && parsed.refinePlanId
          ? parsed.refinePlanId
          : undefined,
    };
  } catch {
    return null; // legacy / corrupt payload → cleared above
  }
}

/** Drop any pending seed (used when the member explicitly starts fresh). */
export function clearJarvisSeed(): void {
  try {
    sessionStorage.removeItem(JARVIS_SEED_KEY);
  } catch {
    /* ignore */
  }
}

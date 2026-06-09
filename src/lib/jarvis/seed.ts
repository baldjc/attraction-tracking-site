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
 * Client-only: every function touches sessionStorage and is a no-op on the
 * server / when storage is unavailable.
 */
export const JARVIS_SEED_KEY = "jarvis:seedPrompt";

interface JarvisSeed {
  memberId: string;
  prompt: string;
}

/** Stash a one-shot prompt for `memberId`, overwriting any prior pending seed. */
export function writeJarvisSeed(memberId: string, prompt: string): void {
  if (!memberId || !prompt.trim()) return;
  try {
    sessionStorage.setItem(JARVIS_SEED_KEY, JSON.stringify({ memberId, prompt }));
  } catch {
    /* storage unavailable — hand-off simply won't seed */
  }
}

/**
 * Read AND remove the pending seed (one-shot). Returns the prompt only when the
 * seed belongs to `currentMemberId`; a foreign or malformed seed is still
 * cleared (so it can't linger) but returns null.
 */
export function consumeJarvisSeed(currentMemberId: string): string | null {
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
    return parsed.prompt;
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

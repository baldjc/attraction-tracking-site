import { auth } from "@/lib/auth";

// The service tiers that the editor role can see
const EDITOR_VISIBLE_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4"];

/**
 * Get the current session and extract the role.
 * Returns null if not authenticated.
 */
export async function getSessionRole(): Promise<{ id: string; role: string } | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as string,
  };
}

/** True if the user is a full admin */
export function isAdmin(role: string): boolean {
  return role === "admin";
}

/** True if the user is admin or editor */
export function isAdminOrEditor(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** True if the user is an editor (not full admin) */
export function isEditor(role: string): boolean {
  return role === "editor";
}

/**
 * Returns the Prisma `where` filter for the editor's visible service tiers.
 * For admin, returns undefined (no filter).
 * For editor, returns { serviceTier: { in: [...] } }.
 */
export function editorTierFilter(role: string): { serviceTier: { in: string[] } } | undefined {
  if (role === "editor") {
    return { serviceTier: { in: EDITOR_VISIBLE_TIERS } };
  }
  return undefined;
}

/**
 * Check if a given service tier is visible to the editor.
 * Admin can see all tiers. Editor can only see editing/mastery.
 */
export function canAccessTier(role: string, serviceTier: string): boolean {
  if (role === "admin") return true;
  return EDITOR_VISIBLE_TIERS.includes(serviceTier);
}

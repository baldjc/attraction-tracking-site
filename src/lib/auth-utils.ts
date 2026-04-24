import { auth } from "@/lib/auth";
import { ServiceTier } from "@/generated/prisma/enums";

const EDITOR_VISIBLE_TIERS: ServiceTier[] = [
  ServiceTier.editing_2,
  ServiceTier.editing_4,
  ServiceTier.mastery_2,
  ServiceTier.mastery_4,
];

const DEFAULT_OWNER_EMAIL = "jared@chamberlaingroup.ca";

/**
 * The single "main owner" email — the founder admin (Jared) who has full
 * unrestricted visibility. Other admin/editor accounts are sub-admins and
 * may be scoped to a subset of members via `User.allowedMemberIds`.
 */
export function getMainOwnerEmail(): string {
  return (process.env.ADMIN_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase();
}

export function isMainOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getMainOwnerEmail();
}

export async function getSessionRole(): Promise<{ id: string; role: string } | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as string,
  };
}

export function isAdmin(role: string): boolean {
  return role === "admin";
}

export function isAdminOrEditor(role: string): boolean {
  return role === "admin" || role === "editor";
}

export function isEditor(role: string): boolean {
  return role === "editor";
}

export function editorTierFilter(role: string): { serviceTier: { in: ServiceTier[] } } | undefined {
  if (role === "editor") {
    return { serviceTier: { in: EDITOR_VISIBLE_TIERS } };
  }
  return undefined;
}

export function canAccessTier(role: string, serviceTier: string): boolean {
  if (role === "admin") return true;
  return EDITOR_VISIBLE_TIERS.includes(serviceTier as ServiceTier);
}

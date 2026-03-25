import { auth } from "@/lib/auth";
import { ServiceTier } from "@/generated/prisma/enums";

const EDITOR_VISIBLE_TIERS: ServiceTier[] = [
  ServiceTier.editing_2,
  ServiceTier.editing_4,
  ServiceTier.mastery_2,
  ServiceTier.mastery_4,
];

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

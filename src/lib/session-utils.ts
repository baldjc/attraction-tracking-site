import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

export { IMPERSONATE_COOKIE };
export { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";

export type ResolvedUser = {
  id: string;
  email: string;
  /** Role of the actual signed-in account (not the impersonated member). */
  role: string | null;
  /** True when the actual signed-in account has the admin role. */
  isAdmin: boolean;
  /** True when the resolved user is an impersonated member. */
  isImpersonating: boolean;
  /** Role of the impersonated user, when applicable. */
  impersonatedRole?: string | null;
};

export async function resolveUserFromSession(): Promise<ResolvedUser | null> {
  // This IS the impersonation resolver — the one place auth() is the raw source.
  const session = await auth();
  if (!session?.user) return null;

  const role = ((session.user as any).role as string | undefined) ?? null;
  const isAdmin = role === "admin";

  // Admin and editor impersonation: if they have an impersonation cookie, use that member's ID.
  // Cookie format: "<ownerId>:<memberId>" — only honored when ownerId matches the current
  // signed-in account, so a stale cookie from another staff member on a shared device
  // doesn't bleed into the next sign-in. Legacy unprefixed cookies are ignored.
  if (role === "admin" || role === "editor") {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    const sessionUserId = (session.user as any).id as string | undefined;
    let impersonateId: string | null = null;
    if (cookieValue && cookieValue.includes(":") && sessionUserId) {
      const [ownerId, memberId] = cookieValue.split(":");
      if (ownerId === sessionUserId && memberId) {
        impersonateId = memberId;
      }
    }
    if (impersonateId) {
      const impersonatedUser = await prisma.user.findUnique({
        where: { id: impersonateId },
        select: { id: true, email: true, role: true },
      });
      if (impersonatedUser) {
        return {
          id: impersonatedUser.id,
          email: impersonatedUser.email,
          role,
          isAdmin,
          isImpersonating: true,
          impersonatedRole: impersonatedUser.role,
        };
      }
    }
  }

  const sessionId = (session.user as any).id as string | undefined;
  const sessionEmail = session.user.email as string | undefined;

  let dbUser = sessionId
    ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, email: true } })
    : null;

  if (!dbUser && sessionEmail) {
    dbUser = await prisma.user.findUnique({ where: { email: sessionEmail }, select: { id: true, email: true } });
  }

  if (!dbUser) return null;
  return { ...dbUser, role, isAdmin, isImpersonating: false };
}

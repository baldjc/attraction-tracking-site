import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

export { IMPERSONATE_COOKIE };
export { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";

export async function resolveUserFromSession(): Promise<{ id: string; email: string } | null> {
  const session = await auth();
  if (!session?.user) return null;

  const role = (session.user as any).role;

  // Admin impersonation: if admin has an impersonation cookie, use that member's ID
  if (role === "admin") {
    const cookieStore = await cookies();
    const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impersonateId) {
      const impersonatedUser = await prisma.user.findUnique({
        where: { id: impersonateId },
        select: { id: true, email: true },
      });
      if (impersonatedUser) return impersonatedUser;
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

  return dbUser ?? null;
}

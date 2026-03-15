import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function resolveUserFromSession(): Promise<{ id: string; email: string } | null> {
  const session = await auth();
  if (!session?.user) return null;

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

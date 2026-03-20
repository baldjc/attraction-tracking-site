import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Always resolves to the REAL logged-in user — never the impersonated member.
// thankYouPageUrl belongs to the person whose snippet is embedded, which is
// always the actual account owner, not whoever they're currently impersonating.
async function resolveRealUser() {
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

export async function GET() {
  const user = await resolveRealUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, thankYouPageUrl: true, fullName: true, email: true, creatorCredentials: true },
  });

  console.log(`[profile GET] user=${user.id} thankYouPageUrl="${dbUser?.thankYouPageUrl ?? "NULL"}"`);
  return NextResponse.json(dbUser ?? {});
}

export async function PUT(req: NextRequest) {
  const user = await resolveRealUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { thankYouPageUrl, creatorCredentials } = await req.json();

  console.log(`[profile PUT] user=${user.id} saving thankYouPageUrl="${thankYouPageUrl ?? "NULL"}"`);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(thankYouPageUrl !== undefined && { thankYouPageUrl: thankYouPageUrl ?? null }),
      ...(creatorCredentials !== undefined && { creatorCredentials: creatorCredentials ?? null }),
    },
    select: { id: true, thankYouPageUrl: true, creatorCredentials: true },
  });

  console.log(`[profile PUT] saved OK — thankYouPageUrl="${updated.thankYouPageUrl ?? "NULL"}"`);
  return NextResponse.json(updated);
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isMainOwnerEmail, getMainOwnerEmail } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const su = session?.user as
    | { id?: string; email?: string; role?: string; isMainOwner?: boolean }
    | undefined;

  return NextResponse.json({
    sessionUser: {
      id: su?.id ?? null,
      email: su?.email ?? null,
      role: su?.role ?? null,
      isMainOwnerFlag: su?.isMainOwner ?? null,
    },
    server: {
      expectedOwnerEmail: getMainOwnerEmail(),
      adminEmailEnvSet: typeof process.env.ADMIN_EMAIL === "string" && process.env.ADMIN_EMAIL.length > 0,
      isOwnerComputedFromEmail: isMainOwnerEmail(su?.email ?? null),
    },
  });
}

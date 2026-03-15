import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { sendLoginCode } from "@/lib/email";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const { email } = await req.json() as { email: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalised } });

  if (!user) {
    return NextResponse.json(
      { error: "No account found for that email address. Please contact your coach." },
      { status: 404 }
    );
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.loginOtp.create({
    data: { email: normalised, codeHash, expiresAt },
  });

  await sendLoginCode(normalised, code, user.fullName);

  return NextResponse.json({ ok: true });
}

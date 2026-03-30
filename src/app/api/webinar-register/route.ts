import { NextRequest, NextResponse } from "next/server";
import { createGHLContact } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fullName, email, phone } = body;
  if (!fullName || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const nameParts = (fullName as string).trim().split(/\s+/);
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.slice(1).join(" ") || undefined;

  const result = await createGHLContact({
    firstName,
    lastName,
    email,
    phone: phone || undefined,
    tags: ["webinar_registrant"],
  });

  if (!result.ok) {
    console.error("[webinar-register] GHL error:", result.error);
    // Still return success — registration intent was captured
  }

  return NextResponse.json({ ok: true });
}

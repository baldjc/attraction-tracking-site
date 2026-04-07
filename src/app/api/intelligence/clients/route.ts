import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    email,
    city,
    province,
    niche,
    audiencePrimary,
    audienceSecondary = [],
    ownChannelUrl,
    notes,
  } = body;

  if (!name || !city || !niche || !audiencePrimary) {
    return NextResponse.json({ error: "name, city, niche, and audiencePrimary are required" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name,
      email: email || null,
      city,
      province: province || null,
      niche,
      audiencePrimary,
      audienceSecondary,
      ownChannelUrl: ownChannelUrl || null,
      notes: notes || null,
    },
  });

  return NextResponse.json(client, { status: 201 });
}

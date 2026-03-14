import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchContactsByTag, getCustomFieldValue, GHL_FIELDS } from "@/lib/ghl";
import bcrypt from "bcryptjs";

export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contacts = await fetchContactsByTag("foundations - weekly coaching");

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Track all emails seen in GHL
    const ghlEmails = new Set<string>();

    for (const contact of contacts) {
      if (!contact.email) {
        skipped++;
        continue;
      }

      ghlEmails.add(contact.email.toLowerCase());

      const youtubeUrl = getCustomFieldValue(contact, GHL_FIELDS.YOUTUBE_CHANNEL_URL);
      let youtubeHandle: string | null = null;
      if (youtubeUrl) {
        const handleMatch = youtubeUrl.match(/@[\w-]+/);
        if (handleMatch) {
          youtubeHandle = handleMatch[0];
        } else if (youtubeUrl.includes("youtube.com/")) {
          const parts = youtubeUrl.split("/").filter(Boolean);
          const last = parts[parts.length - 1];
          if (last && last !== "youtube.com") {
            youtubeHandle = last.startsWith("@") ? last : `@${last}`;
          }
        }
      }

      const fullName = [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ") || null;

      const existing = await prisma.user.findUnique({
        where: { email: contact.email },
      });

      if (existing) {
        const updates: Record<string, any> = {};
        if (contact.id && contact.id !== existing.ghlContactId) {
          updates.ghlContactId = contact.id;
        }
        if (fullName && fullName !== existing.fullName) {
          updates.fullName = fullName;
        }
        if (youtubeUrl && youtubeUrl !== existing.youtubeChannelUrl) {
          updates.youtubeChannelUrl = youtubeUrl;
        }
        if (youtubeHandle && youtubeHandle !== existing.youtubeHandle) {
          updates.youtubeHandle = youtubeHandle;
        }

        if (Object.keys(updates).length > 0) {
          await prisma.user.update({
            where: { email: contact.email },
            data: updates,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        const tempPassword = "member-" + Math.random().toString(36).slice(2, 10);
        const hash = await bcrypt.hash(tempPassword, 12);

        await prisma.user.create({
          data: {
            email: contact.email,
            fullName,
            passwordHash: hash,
            role: "foundations_member",
            ghlContactId: contact.id,
            youtubeChannelUrl: youtubeUrl || null,
            youtubeHandle,
            serviceTier: "foundations",
          },
        });
        created++;
      }
    }

    // Detect members in DB who are no longer in GHL (lost the tag)
    const allDbMembers = await prisma.user.findMany({
      where: { role: "foundations_member" },
      select: { email: true, fullName: true },
    });

    const flaggedInactive = allDbMembers
      .filter((m) => !ghlEmails.has(m.email.toLowerCase()))
      .map((m) => ({ email: m.email, name: m.fullName || m.email }));

    return NextResponse.json({
      success: true,
      total: contacts.length,
      created,
      updated,
      skipped,
      flaggedInactive,
    });
  } catch (error: any) {
    console.error("GHL sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: error.message },
      { status: 500 }
    );
  }
}

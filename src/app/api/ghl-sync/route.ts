import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { fetchContactsByTag, getCustomFieldValue, GHL_FIELDS } from "@/lib/ghl";
import { getChannelInfo } from "@/lib/youtube";
import { provisionMember } from "@/lib/provision-member";

export const maxDuration = 60;

function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
            .join("'")
        )
        .join("-")
    )
    .join(" ");
}

async function lookupChannelName(handle: string): Promise<string | null> {
  try {
    const info = await getChannelInfo(handle);
    return info.title ?? null;
  } catch {
    return null;
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawContacts = await fetchContactsByTag("foundations - weekly coaching");

    // Deduplicate by email — keep first occurrence
    const seenEmails = new Set<string>();
    const contacts = rawContacts.filter((c) => {
      if (!c.email) return false;
      const key = c.email.toLowerCase();
      if (seenEmails.has(key)) return false;
      seenEmails.add(key);
      return true;
    });

    console.log(`[GHL Sync] ${rawContacts.length} raw → ${contacts.length} after dedup`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const ghlEmails = new Set<string>();

    for (const contact of contacts) {
      if (!contact.email) { skipped++; continue; }

      ghlEmails.add(contact.email.toLowerCase());

      // YouTube URL + handle extraction
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

      const rawName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      const fullName = rawName ? toTitleCase(rawName) : null;
      const phone = contact.phone?.trim() || null;

      const existing = await prisma.user.findUnique({ where: { email: contact.email } });

      // Parse GHL dateAdded as the member's program start date
      const ghlDateAdded = contact.dateAdded ? new Date(contact.dateAdded) : null;

      if (existing) {
        const updates: Record<string, any> = {};

        if (contact.id && contact.id !== existing.ghlContactId) updates.ghlContactId = contact.id;
        if (fullName && fullName !== existing.fullName) updates.fullName = fullName;
        if (youtubeUrl && youtubeUrl !== existing.youtubeChannelUrl) updates.youtubeChannelUrl = youtubeUrl;
        if (youtubeHandle && youtubeHandle !== existing.youtubeHandle) updates.youtubeHandle = youtubeHandle;
        if (phone && phone !== existing.phone) updates.phone = phone;
        // Backfill invitedAt from GHL dateAdded if not already set
        if (ghlDateAdded && !existing.invitedAt) updates.invitedAt = ghlDateAdded;

        // Look up channel name if we have a handle but no channel name yet
        const handleForLookup = youtubeHandle ?? existing.youtubeHandle;
        if (handleForLookup && !existing.youtubeChannelName) {
          const channelName = await lookupChannelName(handleForLookup);
          if (channelName) updates.youtubeChannelName = channelName;
        }

        if (Object.keys(updates).length > 0) {
          await prisma.user.update({ where: { email: contact.email }, data: updates });
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Look up channel name for new members
        let youtubeChannelName: string | null = null;
        if (youtubeHandle) {
          youtubeChannelName = await lookupChannelName(youtubeHandle);
        }

        // Shared provisioning path — same function the manual admin "Add
        // member" flow uses, so synced and manual members are identical.
        await provisionMember({
          email: contact.email,
          fullName,
          ghlContactId: contact.id,
          phone,
          youtubeChannelUrl: youtubeUrl || null,
          youtubeHandle,
          youtubeChannelName,
          serviceTier: "foundations",
          invitedAt: ghlDateAdded,
        });
        created++;
      }
    }

    // Detect members no longer in GHL
    const allDbMembers = await prisma.user.findMany({
      where: { role: "foundations_member" },
      select: { email: true, fullName: true },
    });

    const flaggedInactive = allDbMembers
      .filter((m) => !ghlEmails.has(m.email.toLowerCase()))
      .map((m) => ({ email: m.email, name: m.fullName || m.email }));

    return NextResponse.json({ success: true, total: contacts.length, created, updated, skipped, flaggedInactive });
  } catch (error: any) {
    console.error("GHL sync error:", error);
    return NextResponse.json({ error: "Sync failed", details: error.message }, { status: 500 });
  }
}

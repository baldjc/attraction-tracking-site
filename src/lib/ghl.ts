const GHL_BASE_URL = "https://services.leadconnectorhq.com";

function getApiKey() {
  return process.env.GHL_API_KEY!;
}
function getLocationId() {
  return process.env.GHL_LOCATION_ID!;
}

export interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tags?: string[];
  customFields?: Array<{ id: string; value: string }>;
}

export async function fetchContactsByTag(tag: string): Promise<GHLContact[]> {
  const allContacts: GHLContact[] = [];
  const limit = 100;
  // Use the last contact's ID from each page as the cursor (not meta.startAfterId which loops)
  let lastContactId: string | null = null;
  let pageCount = 0;
  let totalFetched = 0;
  const MAX_PAGES = 25; // 25 × 100 = 2,500 contacts max

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      locationId: getLocationId(),
      limit: String(limit),
    });
    if (lastContactId) {
      params.set("startAfterId", lastContactId);
    }

    const res = await fetch(`${GHL_BASE_URL}/contacts/?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        Version: "2021-07-28",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL API error: ${res.status} ${res.statusText} — ${body}`);
    }

    const data = await res.json();
    const contacts: GHLContact[] = data.contacts ?? [];
    totalFetched += contacts.length;
    pageCount++;

    const tagged = contacts.filter(
      (c) => c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
    allContacts.push(...tagged);

    console.log(
      `[GHL] page ${pageCount}: fetched ${contacts.length}, tagged ${tagged.length} (matched so far: ${allContacts.length}, total fetched: ${totalFetched})`
    );

    // Stop when last page reached (fewer than limit returned)
    if (contacts.length < limit) {
      break;
    }

    // Use the last contact's ID as the next cursor
    lastContactId = contacts[contacts.length - 1].id;
  }

  console.log(
    `[GHL] Done — pages: ${pageCount}, total fetched: ${totalFetched}, matched tag "${tag}": ${allContacts.length}`
  );

  return allContacts;
}

export function getCustomFieldValue(
  contact: GHLContact,
  fieldId: string
): string | undefined {
  return contact.customFields?.find((f) => f.id === fieldId)?.value;
}

// GHL Custom Field IDs
export const GHL_FIELDS = {
  YOUTUBE_CHANNEL_URL: "AE8we7U1ZSApVL9vUP07",
  MONTHLY_ANALYSIS_LINK: "3IwK8sUBoGLsj1PlMjhe",
  LEAD_AUDIT_LINK: "zfEHoi06Cw8cmAi42dW6",
};

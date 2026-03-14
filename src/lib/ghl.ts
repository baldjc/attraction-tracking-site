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
  let pageCount = 0;
  let totalFetched = 0;
  const MAX_PAGES = 25;

  // First request — no cursor
  let nextUrl: string | null =
    `${GHL_BASE_URL}/contacts/?locationId=${getLocationId()}&limit=${limit}`;

  while (nextUrl && pageCount < MAX_PAGES) {
    console.log(`[GHL page ${pageCount + 1}] GET ${nextUrl}`);

    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        Version: "2021-07-28",
      },
    });

    console.log(`[GHL page ${pageCount + 1}] status: ${res.status}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GHL API error: ${res.status} ${res.statusText} — ${body}`);
    }

    const data = await res.json();
    const contacts: GHLContact[] = data.contacts ?? [];

    console.log(`[GHL page ${pageCount + 1}] contacts: ${contacts.length}, meta.nextPageUrl: ${data.meta?.nextPageUrl ?? "null"}`);

    const tagged = contacts.filter(
      (c) => c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
    );

    console.log(`[GHL page ${pageCount + 1}] matched tag: ${tagged.length}`);

    allContacts.push(...tagged);
    totalFetched += contacts.length;
    pageCount++;

    // Use GHL's own nextPageUrl — it includes both startAfter + startAfterId
    nextUrl = data.meta?.nextPageUrl ?? null;

    // Safety: if fewer contacts than limit, we're on the last page
    if (contacts.length < limit) {
      nextUrl = null;
    }
  }

  console.log(
    `[GHL] DONE — pages: ${pageCount}, total fetched: ${totalFetched}, matched "${tag}": ${allContacts.length}`
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

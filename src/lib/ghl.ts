const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tags?: string[];
  customFields?: Array<{ id: string; value: string }>;
}

interface GHLContactsResponse {
  contacts: GHLContact[];
  meta?: { total: number; nextPageUrl?: string; startAfterId?: string; startAfter?: number };
}

export async function fetchContactsByTag(tag: string): Promise<GHLContact[]> {
  const allContacts: GHLContact[] = [];
  let hasMore = true;
  let offset = 0;
  const limit = 100;

  while (hasMore) {
    const url = `${GHL_BASE_URL}/contacts/?locationId=${GHL_LOCATION_ID}&limit=${limit}&query=&startAfter=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: "2021-07-28",
      },
    });

    if (!res.ok) {
      throw new Error(`GHL API error: ${res.status} ${res.statusText}`);
    }

    const data: GHLContactsResponse = await res.json();
    const tagged = data.contacts.filter(
      (c) => c.tags && c.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
    allContacts.push(...tagged);

    if (data.contacts.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  return allContacts;
}

export function getCustomFieldValue(contact: GHLContact, fieldId: string): string | undefined {
  const field = contact.customFields?.find((f) => f.id === fieldId);
  return field?.value;
}

// GHL Custom Field IDs
export const GHL_FIELDS = {
  YOUTUBE_CHANNEL_URL: "AE8we7U1ZSApVL9vUP07",
  MONTHLY_ANALYSIS_LINK: "3IwK8sUBoGLsj1PlMjhe",
  LEAD_AUDIT_LINK: "zfEHoi06Cw8cmAi42dW6",
};

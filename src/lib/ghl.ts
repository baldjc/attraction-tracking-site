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

interface GHLContactsResponse {
  contacts: GHLContact[];
  meta?: {
    total?: number;
    nextPageUrl?: string;
    startAfterId?: string;
    startAfter?: number;
  };
}

export async function fetchContactsByTag(tag: string): Promise<GHLContact[]> {
  const allContacts: GHLContact[] = [];
  const limit = 100;
  let startAfterId: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50; // safety cap — 5,000 contacts max

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      locationId: getLocationId(),
      limit: String(limit),
    });
    if (startAfterId) {
      params.set("startAfterId", startAfterId);
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

    const data: GHLContactsResponse = await res.json();
    const contacts = data.contacts ?? [];

    const tagged = contacts.filter(
      (c) => c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
    allContacts.push(...tagged);

    pageCount++;

    // Stop if fewer than limit returned (last page) or no cursor to continue
    if (contacts.length < limit || !data.meta?.startAfterId) {
      break;
    }

    startAfterId = data.meta.startAfterId;
  }

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

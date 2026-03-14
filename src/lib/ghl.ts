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

  // --- Try POST /contacts/search with tag filter first ---
  try {
    let page = 1;
    let hasMore = true;
    let totalFetched = 0;
    let pageCount = 0;

    while (hasMore && pageCount < 50) {
      const body: Record<string, unknown> = {
        locationId: getLocationId(),
        pageSize: 100,
        filters: [{ field: "tags", operator: "contains", value: tag }],
        page,
      };

      const res = await fetch(`${GHL_BASE_URL}/contacts/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Search endpoint returned ${res.status}`);
      }

      const data = await res.json();
      const contacts: GHLContact[] = data.contacts ?? [];
      totalFetched += contacts.length;
      pageCount++;

      allContacts.push(...contacts);

      console.log(
        `[GHL Search] page ${pageCount}: got ${contacts.length} contacts (total so far: ${totalFetched})`
      );

      if (!data.nextPage || contacts.length < 100) {
        hasMore = false;
      } else {
        page = data.nextPage;
      }
    }

    console.log(
      `[GHL Search] Done. Pages: ${pageCount}, Total fetched: ${totalFetched}, Matched tag: ${allContacts.length}`
    );

    return allContacts;
  } catch (searchErr) {
    console.warn("[GHL Search] Search endpoint failed, falling back to GET /contacts/:", searchErr);
  }

  // --- Fallback: GET /contacts/ with cursor pagination ---
  const fallbackContacts: GHLContact[] = [];
  let startAfterId: string | null = null;
  let pageCount = 0;
  let totalFetched = 0;
  const MAX_PAGES = 50;

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      locationId: getLocationId(),
      limit: "100",
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

    const data = await res.json();
    const contacts: GHLContact[] = data.contacts ?? [];
    totalFetched += contacts.length;
    pageCount++;

    const tagged = contacts.filter(
      (c) => c.tags?.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
    fallbackContacts.push(...tagged);

    console.log(
      `[GHL Fallback] page ${pageCount}: fetched ${contacts.length}, tagged ${tagged.length} (matched so far: ${fallbackContacts.length})`
    );

    if (contacts.length < 100 || !data.meta?.startAfterId) {
      break;
    }

    startAfterId = data.meta.startAfterId;
  }

  console.log(
    `[GHL Fallback] Done. Pages: ${pageCount}, Total fetched: ${totalFetched}, Matched tag: ${fallbackContacts.length}`
  );

  return fallbackContacts;
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

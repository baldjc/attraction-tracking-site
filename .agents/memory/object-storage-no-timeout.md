---
name: Object Storage client has no built-in timeout
description: Why @replit/object-storage calls must be wrapped in a timeout race inside any request path
---

The `@replit/object-storage` `Client` (`uploadFromBytes` / `downloadAsBytes` /
`delete`) has **no client-side timeout**. A stalled bucket call therefore awaits
forever, hanging the whole HTTP request — the symptom is a UI control stuck in a
pending state (e.g. thumbnail upload frozen on "Uploading…") with no success and no
error, because the response never arrives.

**Why this bites specifically:** non-Production tiers always use Object Storage (Drive
is gated to production tiers), so they never benefit from the Drive path's existing
12s cap. The Object-Storage fallback was the *only* backend for those members and it
was unbounded.

**How to apply:**
- Wrap every Object-Storage call that runs inside a request path in a
  `Promise.race` against a timeout (the thumbnail helpers use a ~15s bound).
- The route must also return a **structured JSON** error on failure — an unhandled
  throw yields a non-JSON 500 that the client's `res.json()` then chokes on, masking
  the real error.
- Add a client-side `AbortController` timeout on the fetch as defense-in-depth so a
  network/proxy stall can't hang the control even if the server somehow doesn't reply.
- Same rule for Drive helpers: any `drive.files.*` call awaited in a request path
  (including best-effort cleanup like `deleteDriveFile`) must be timeout-bounded.

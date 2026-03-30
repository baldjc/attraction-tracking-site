# Audit Requests Queue — Design Spec

**Date:** 2026-03-30
**Status:** Draft

## Overview

Add a GHL-webhook-driven audit request queue to the admin audits page. When a lead fills out the Attraction by Video audit request form in GoHighLevel, their info appears in a new "Audit Requests" tab. Jared can review the request and trigger a baseline audit directly from the queue. If the lead later converts to a paying member, their baseline audit carries over automatically.

## Data Model

### New `AuditRequest` table

| Field                  | Type             | Notes                                              |
|------------------------|------------------|----------------------------------------------------|
| id                     | String (uuid)    | PK                                                 |
| fullName               | String           | From GHL webhook                                   |
| email                  | String           | From GHL webhook                                   |
| phone                  | String?          | From GHL webhook                                   |
| youtubeChannelUrl      | String           | From GHL webhook                                   |
| currentYoutubeIncome   | String?          | From GHL field `Current_YouTube_Commission`         |
| desiredYoutubeIncome   | String?          | From GHL field `Desired_YouTube_Commission`         |
| status                 | AuditRequestStatus | `pending` or `audited`                            |
| userId                 | String?          | FK to User — set when audit is triggered           |
| auditId                | String?          | FK to Audit — set when baseline completes          |
| createdAt              | DateTime         | When webhook arrived                               |
| updatedAt              | DateTime         |                                                    |

### New enum: `AuditRequestStatus`

- `pending` — request received, no audit run yet
- `audited` — baseline audit complete

### New User role value: `audit_lead`

- Created when "Run Baseline Audit" is clicked on a request
- Cannot log in (no password set)
- Does not appear in the normal members list or sidebar member picker
- Excluded from batch audit runs (monthly/baseline batches skip `audit_lead` users)
- When converted to a paying member, role is updated to `foundations_member` and all audit history carries over

## Webhook Endpoint

### `POST /api/webhooks/ghl/audit-request`

- **Auth:** No session auth. Secured via shared secret: `?token=<GHL_WEBHOOK_SECRET>` env var. Returns 401 on bad/missing token.
- **Deduplication:** If an `AuditRequest` with the same email already exists and is `pending`, skip creating a duplicate (return 200 OK silently).
- **Returns:** 200 on success, 401 on bad token, 400 on missing required fields.

**GHL field mapping:**

| GHL Field                    | Maps to                |
|------------------------------|------------------------|
| `full_name` / `contact.name` | `fullName`             |
| `email` / `contact.email`    | `email`                |
| `phone` / `contact.phone`    | `phone`                |
| `youtube_channel_url`        | `youtubeChannelUrl`    |
| `Current_YouTube_Commission` | `currentYoutubeIncome` |
| `Desired_YouTube_Commission` | `desiredYoutubeIncome` |

The endpoint checks nested `contact.*` fields first, then falls back to top-level fields — covers both GHL webhook payload shapes.

## Admin Audits Page — Tab Redesign

### Tab bar

Same style as the Generate Leads page (pill-style tabs in a muted background bar). Two tabs:

- **Audit Requests** — the new queue (default tab)
- **Member Audits** — all existing audits page content (batch controls, audit table, active jobs, etc.) moved here unchanged

Tab state managed via `?tab=` search param, same pattern as other tabbed pages in the app.

### Audit Requests tab

**Request cards**, sorted with pending first (newest at top), then audited below.

Each **pending** card shows:
- Name, email, phone (phone is click-to-call link)
- YouTube channel URL (clickable, opens in new tab)
- Current YouTube income / Desired YouTube income (side by side)
- Time since request (e.g., "2 hours ago", "3 days ago")
- **"Run Baseline Audit" button** — triggers the audit flow

Each **audited** card shows:
- Same contact info
- Score badge (e.g., "5.3 / 10") with colour coding matching existing audit score badges
- **"View Audit" button** — links to `/admin/audits/<auditId>`
- Muted styling so pending requests stand out visually

**Empty state:** "No audit requests yet. Requests will appear here when leads submit the audit form."

### Sidebar notification badge

The Audits sidebar link gets a `badgeKey: "auditRequests"` — same amber numbered badge as Hire a Human. Shows count of `pending` audit requests. New endpoint: `GET /api/admin/audit-requests/count`.

## Run Audit Flow

When "Run Baseline Audit" is clicked:

1. **Check for existing user:** If a User with that email already exists, use that user. Otherwise, create a new User with role `audit_lead`, `fullName`, `email`, and `youtubeChannelUrl` from the request. No password.
2. **Link request to user:** Set `AuditRequest.userId` to the user's ID.
3. **Trigger baseline audit:** Call `POST /api/audits/run` with `{ memberId: userId, auditType: "baseline" }` — reuses the entire existing audit pipeline.
4. **UI updates live:** Card shows active job spinner while processing (same pattern as the active jobs section on the Member Audits tab). Button disabled during processing.
5. **On completion:** `AuditRequest.auditId` is set, status flips to `audited`, card updates to show score and "View Audit" button.
6. **On failure:** Card shows error state with "Retry" button.

### Auto-linking audit to request

After an audit job completes successfully, the system checks if there's an `AuditRequest` linked to that user with status `pending` and no `auditId`. If found, it links the completed audit and flips the status to `audited`. This happens in the existing audit job completion flow (`process-audit-job.ts`).

## Conversion Path

Manual process — update user role from `audit_lead` to `foundations_member` when they become a paying member. Baseline audit and scores are already linked to their user record and appear on their member dashboard automatically.

## API Endpoints Summary

| Method | Path                                  | Auth       | Purpose                           |
|--------|---------------------------------------|------------|-----------------------------------|
| POST   | `/api/webhooks/ghl/audit-request`     | Token      | Receive GHL webhook               |
| GET    | `/api/admin/audit-requests`           | Admin      | List all audit requests           |
| GET    | `/api/admin/audit-requests/count`     | Admin      | Pending count (for sidebar badge) |
| POST   | `/api/admin/audit-requests/[id]/run`  | Admin      | Create user + trigger audit       |

## Out of Scope

- No auto-response email to the lead on request
- No GHL status sync back (not pushing audit results to GHL)
- No member-facing view for audit leads (they can't log in)
- No bulk "run all pending" button (one at a time for pacing control)
- No automated conversion flow from `audit_lead` to `foundations_member`

---
name: Drive service-account quota & delegation
description: Why Drive folder creation works but Docs/uploads don't, and what unblocks the full fix
---

# Google Drive integration — quota & delegation realities

The Drive automation (`src/lib/google-drive.ts`) uses a **service account** (its
address lives in `replit.md`). Two independent failure modes have bitten this
integration; both are environment/Workspace config, not code bugs.

## 1. Impersonation (domain-wide delegation) must be authorized or EVERYTHING fails
`getDriveClient()` enables Workspace domain-wide delegation only when
`GOOGLE_DRIVE_IMPERSONATE_EMAIL` is set (it passes `clientOptions.subject`).
If delegation is **not** authorized in the Workspace admin console for the
service account's numeric client id + `https://www.googleapis.com/auth/drive`
scope, every Drive call fails with `unauthorized_client` (HTTP 401) →
`classifyDriveError` maps it to `auth_failed` → members see "We couldn't sign in
to Google Drive."

**Why:** the var was set in production (a Workspace user) but delegation was never
authorized, so 100% of Drive calls broke — both the "+ Create Drive folder"
button and the status-change auto-create path (both funnel through
`createVideoFolder` / `ensureVideoFolderForPlan`).

**How to apply:** leave `GOOGLE_DRIVE_IMPERSONATE_EMAIL` **unset** unless
delegation is actually authorized. Setting it speculatively is worse than not
setting it.

## 2. A quota-less service account can't own files in a My Drive folder
With NO impersonation, the service account can **create folders** (zero bytes)
in a shared My Drive folder, but **Google Doc creation and file/thumbnail
uploads fail 403 `storageQuotaExceeded`** ("Service Accounts do not have storage
quota… leverage shared drives, or use OAuth delegation"). In the code those
upload/Doc paths are best-effort (catch → return `null`), so folder creation
still succeeds; only the auto "Video Research" Doc and Drive uploads silently
no-op.

**Why:** the root folder is a personal My Drive folder owned by a real user, not
a Shared Drive (its metadata has no `driveId`). Folders don't consume quota;
files do, and the service account has none.

## Full fix — Shared Drive migration runbook
1. Create a **Shared Drive** (folder id starts `0A…`).
2. Add the service account as **Content manager** (see gotcha below if the share
   dialog rejects it).
3. Point `GOOGLE_DRIVE_ROOT_FOLDER_ID` at the Shared Drive id, keep
   `GOOGLE_DRIVE_IMPERSONATE_EMAIL` **unset**.
4. **Verify before declaring done:** smoke-test that the service account can,
   under the new root, (a) create a folder, (b) create a Google Doc, and
   (c) upload a binary file — all should succeed (Shared Drives own their files,
   so quota is a non-issue). `drive.drives.list()` returning the new drive
   confirms membership.

The code is already Shared-Drive compatible (every `drive.files.*` /
`drive.permissions.*` call passes `supportsAllDrives` / `includeItemsFromAllDrives`).

## Gotcha adding a service account to a Shared Drive
The Shared Drive share dialog may reject the service account with
"Sharing to email addresses without a Google account is not yet supported" when
Workspace external-sharing is restricted (the SA lives in another org → treated
as external). Workarounds: (a) create a Google Group that allows external
members, add the SA to the group, then add the **group** to the Shared Drive; or
(b) enable external sharing in Admin → Drive sharing settings.

## Fast diagnosis
Run a throwaway script with `GOOGLE_SERVICE_ACCOUNT_KEY` from env: try
`drive.files.get` on the root both with and without `clientOptions.subject`. With
impersonation → `unauthorized_client` means delegation unauthorized. Without it,
folder create OK but Doc/upload 403 `storageQuotaExceeded` means My-Drive (not
Shared Drive) root. `drive.drives.list()` returning `[]` confirms the SA is not a
member of any Shared Drive yet.

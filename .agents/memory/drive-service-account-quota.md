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

## 3. The failing upload must be time-bounded or it hangs the caller's request
Because every binary upload into the My-Drive root 403s, callers depend on
`uploadBinaryToFolder` returning `null` so they can fall back to Object Storage
(e.g. the member thumbnail upload route). But `Promise.race`-less, an in-flight
Drive upload (slow network / internal retries on a one-shot `Readable` stream)
can stall indefinitely, leaving the member's UI stuck on "Uploading…" forever.

**How to apply:** `uploadBinaryToFolder` caps each attempt with a timeout
(`Promise.race` vs `DRIVE_UPLOAD_TIMEOUT_MS`) and returns `null` on timeout so
the request always completes via the Object-Storage fallback. The race can't
cancel the Google request, so on timeout it also fires a best-effort
`deleteDriveFile` if the upload later lands, to avoid an orphaned Drive file the
DB never references. Keep this guard on any Drive write the request path awaits.

## 4. A Content-manager SA can create but not PERMANENTLY delete on a Shared Drive
On a Shared Drive the service account added as **Content manager** has
`capabilities.canDelete = false` / `canTrash = true`. So `drive.files.delete`
(permanent delete) returns **404 "File not found"** (not 403) even on a file it
just created and can `files.list`. Only an **organizer/manager** can permanently
delete shared-drive content; everyone else can only trash (`files.update {trashed:true}`).

**Why:** confusing because the 404 looks like the file vanished, but it's a
capability gate. The app's best-effort orphan-cleanup `deleteDriveFile` (timeout
path in §3) will therefore 404 on a Shared Drive root — harmless because it's
non-blocking, but it won't actually reclaim the orphan. To clean up shared-drive
items programmatically, trash them instead of deleting.

**Verified state (2026-06-03):** SA is Content manager on Shared Drive
"Attraction By Video Client Videos" (`0A…`); smoke test confirmed folder + Doc +
binary upload all succeed. **Production** `GOOGLE_DRIVE_ROOT_FOLDER_ID` points at
that Shared Drive; **development** still points at the old My-Drive root (so dev
keeps the §2 quota behavior). Per-env, not shared.

## Fast diagnosis
Run a throwaway script with `GOOGLE_SERVICE_ACCOUNT_KEY` from env: try
`drive.files.get` on the root both with and without `clientOptions.subject`. With
impersonation → `unauthorized_client` means delegation unauthorized. Without it,
folder create OK but Doc/upload 403 `storageQuotaExceeded` means My-Drive (not
Shared Drive) root. `drive.drives.list()` returning `[]` confirms the SA is not a
member of any Shared Drive yet.

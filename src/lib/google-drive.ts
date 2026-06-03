import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import prisma from "@/lib/prisma";
import { PRODUCTION_TIERS } from "@/lib/content-plan-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Structured Drive errors
// ─────────────────────────────────────────────────────────────────────────────
// Drive folder creation can fail for several distinct reasons, and the member-
// facing copy + HTTP status differ per reason. Every Drive write path classifies
// raw googleapis errors into one of these categories so the UI can map them.
export type DriveErrorCategory =
  | "not_configured"
  | "auth_failed"
  | "permission_denied"
  | "quota_exceeded"
  | "rate_limited"
  | "not_found"
  | "unknown";

export const DRIVE_ERROR_MESSAGES: Record<DriveErrorCategory, string> = {
  not_configured: "Google Drive isn't fully set up yet — your coaching team needs to finish connecting it.",
  auth_failed: "We couldn't sign in to Google Drive. The connection may need to be re-authorized.",
  permission_denied: "We don't have permission to manage the Drive folder. Your team may need to re-share it.",
  quota_exceeded: "The connected Google Drive account is out of storage. Your team needs to free up space.",
  rate_limited: "Google Drive is busy right now. Wait a moment and try again.",
  not_found: "The Drive parent folder couldn't be found. Your team may need to reset the Drive setup.",
  unknown: "Something went wrong creating the Drive folder. Please try again.",
};

export const DRIVE_ERROR_STATUS: Record<DriveErrorCategory, number> = {
  not_configured: 503,
  auth_failed: 502,
  permission_denied: 502,
  quota_exceeded: 507,
  rate_limited: 429,
  not_found: 502,
  unknown: 502,
};

export class DriveError extends Error {
  category: DriveErrorCategory;
  userMessage: string;
  constructor(category: DriveErrorCategory, message?: string) {
    super(message ?? category);
    this.name = "DriveError";
    this.category = category;
    this.userMessage = DRIVE_ERROR_MESSAGES[category];
  }
}

/** Maps a raw googleapis / fetch error onto a DriveError category. */
export function classifyDriveError(err: unknown): DriveError {
  if (err instanceof DriveError) return err;
  const e = err as {
    code?: number | string;
    status?: number;
    message?: string;
    errors?: Array<{ reason?: string }>;
    // googleapis throws Gaxios errors that nest the real status + reason under
    // `response` rather than on the top-level object. Parse both shapes so
    // native API failures classify correctly instead of degrading to `unknown`.
    response?: {
      status?: number;
      data?: { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> } };
    };
  };
  const respError = e?.response?.data?.error;
  const status =
    typeof e?.code === "number"
      ? e.code
      : typeof e?.status === "number"
        ? e.status
        : typeof e?.response?.status === "number"
          ? e.response.status
          : typeof respError?.code === "number"
            ? respError.code
            : undefined;
  const reason = e?.errors?.[0]?.reason ?? respError?.errors?.[0]?.reason ?? "";
  const msg = (e?.message ?? respError?.message ?? "").toLowerCase();

  if (status === 401 || reason === "authError" || msg.includes("invalid_grant") || msg.includes("invalid credentials")) {
    return new DriveError("auth_failed", e?.message);
  }
  if (status === 429 || reason === "userRateLimitExceeded" || reason === "rateLimitExceeded") {
    return new DriveError("rate_limited", e?.message);
  }
  if (status === 404 || reason === "notFound") {
    return new DriveError("not_found", e?.message);
  }
  if (status === 403) {
    if (reason === "storageQuotaExceeded" || msg.includes("storage quota") || msg.includes("quota")) {
      return new DriveError("quota_exceeded", e?.message);
    }
    return new DriveError("permission_denied", e?.message);
  }
  if (status === 507) {
    return new DriveError("quota_exceeded", e?.message);
  }
  return new DriveError("unknown", e?.message);
}

function getDriveClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new DriveError("not_configured", "GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(keyRaw);
  } catch {
    throw new DriveError("not_configured", "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  // A service account has no Drive storage quota of its own, so it cannot own
  // files inside a regular "My Drive" folder — Drive rejects the write with
  // 403 "Service Accounts do not have storage quota". When
  // GOOGLE_DRIVE_IMPERSONATE_EMAIL is set, we use Google Workspace domain-wide
  // delegation to act as that real Workspace user instead, so every file and
  // folder we create is owned by them (and counts against their quota).
  const impersonate = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL?.trim() || undefined;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
    ...(impersonate ? { clientOptions: { subject: impersonate } } : {}),
  });

  return google.drive({ version: "v3", auth });
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<string> {
  const safeName = name.replace(/['"\\]/g, "");
  const res = await drive.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

/**
 * Creates (or finds) a member's top-level asset folder under the root Drive folder.
 * Returns the shareable Google Drive link.
 */
export async function createMemberFolder(memberName: string): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new DriveError("not_configured", "GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");

  try {
    const drive = getDriveClient();
    const memberFolderId = await findOrCreateFolder(drive, memberName, rootFolderId);

    // Make the folder accessible via link (viewer access for the member)
    try {
      await drive.permissions.create({
        fileId: memberFolderId,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
      });
    } catch {
      // Permission may already exist — safe to ignore
    }

    return `https://drive.google.com/drive/folders/${memberFolderId}`;
  } catch (err) {
    throw classifyDriveError(err);
  }
}

export interface VideoFolderResult {
  memberFolderUrl: string;
  videoFolderUrl: string;
  researchDocUrl: string | null;
  // Result of the best-effort permission grant applied after creation (Phase 3).
  // Null when no owner was supplied to share with. Never causes creation to fail.
  sharing?: DriveShareResult | null;
}

/**
 * Finds (or creates) a blank Google Doc with the given name inside `folderId`.
 * Idempotent: if a Doc with that name already exists in the folder we return
 * its URL instead of creating a duplicate. Errors are swallowed so that a
 * Docs hiccup never blocks Drive folder creation.
 */
async function findOrCreateDocInFolder(
  drive: drive_v3.Drive,
  folderId: string,
  docName: string
): Promise<string | null> {
  try {
    const safeName = docName.replace(/['"\\]/g, "");
    const existing = await drive.files.list({
      q: `name='${safeName}' and mimeType='application/vnd.google-apps.document' and '${folderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    if (existing.data.files && existing.data.files.length > 0) {
      return `https://docs.google.com/document/d/${existing.data.files[0].id}/edit`;
    }
    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [folderId],
        mimeType: "application/vnd.google-apps.document",
      },
      fields: "id",
      supportsAllDrives: true,
    });
    return `https://docs.google.com/document/d/${created.data.id}/edit`;
  } catch (err) {
    console.error("[google-drive] findOrCreateDocInFolder failed:", err);
    return null;
  }
}

export async function createVideoFolder(
  memberName: string,
  videoTitle: string,
  ownerUserId?: string
): Promise<VideoFolderResult> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new DriveError("not_configured", "GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");

  try {
    const drive = getDriveClient();

    const memberFolderId = await findOrCreateFolder(drive, memberName, rootFolderId);
    const videoFolderId = await findOrCreateFolder(drive, videoTitle, memberFolderId);

    // Auto-seed each video folder with a "Video Research" Google Doc so members
    // have a place to start as soon as the folder spins up. Idempotent — safe
    // to re-run on existing folders.
    const researchDocUrl = await findOrCreateDocInFolder(drive, videoFolderId, "Video Research");

    // Phase 3 — explicitly share the new folder with the owning member, their
    // active team members, and support. Best-effort: a sharing failure must
    // never fail folder creation (the folder already exists; sharing can be
    // retried via the admin backfill endpoint).
    let sharing: DriveShareResult | null = null;
    if (ownerUserId) {
      try {
        sharing = await shareVideoFolderWithMember(videoFolderId, ownerUserId);
      } catch (err) {
        console.error("[drive-share] post-creation sharing threw unexpectedly:", err);
      }
    }

    return {
      memberFolderUrl: `https://drive.google.com/drive/folders/${memberFolderId}`,
      videoFolderUrl: `https://drive.google.com/drive/folders/${videoFolderId}`,
      researchDocUrl,
      sharing,
    };
  } catch (err) {
    throw classifyDriveError(err);
  }
}

/**
 * Extracts a Google Drive folder ID from a folder URL.
 * Returns null if the URL is not a recognisable Drive folder link.
 */
export function folderIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Sprint 6 — expanded Drive helpers. Every exported function in this section
// must swallow Drive errors (log + return null/undefined). Save flows should
// never break because Drive hiccuped.
// ---------------------------------------------------------------------------

/**
 * Uploads (or replaces) a text file in the given Drive folder. Idempotent —
 * if a file with the same name already exists we update its contents in place
 * rather than creating a duplicate.
 */
export async function uploadTextFileToFolder(
  folderId: string,
  filename: string,
  content: string,
  mimeType: string = "text/plain"
): Promise<{ fileId: string; fileUrl: string } | null> {
  try {
    const drive = getDriveClient();
    const safeName = filename.replace(/['"\\]/g, "");

    const existing = await drive.files.list({
      q: `name='${safeName}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const media = {
      mimeType,
      body: Readable.from([content]),
    };

    let fileId: string;
    if (existing.data.files && existing.data.files.length > 0) {
      fileId = existing.data.files[0].id!;
      await drive.files.update({ fileId, media, supportsAllDrives: true });
    } else {
      const created = await drive.files.create({
        requestBody: { name: safeName, parents: [folderId], mimeType },
        media,
        fields: "id",
        supportsAllDrives: true,
      });
      fileId = created.data.id!;
    }

    return { fileId, fileUrl: `https://drive.google.com/file/d/${fileId}/view` };
  } catch (err) {
    console.error("[google-drive] uploadTextFileToFolder failed:", err);
    return null;
  }
}

/**
 * Upload a binary file (e.g. a thumbnail image) into a Drive folder. Overwrites
 * an existing file with the same name. Returns null on any failure.
 */
// Hard upper bound on a single Drive binary upload attempt. The service account
// can't own files in a My-Drive-rooted folder (403 storageQuotaExceeded), and a
// stalled/retrying upload stream must never hang the caller's request — callers
// (e.g. thumbnail upload) fall back to Object Storage when this returns null.
const DRIVE_UPLOAD_TIMEOUT_MS = 12_000;

export async function uploadBinaryToFolder(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ fileId: string; fileUrl: string } | null> {
  const doUpload = async (): Promise<{ fileId: string; fileUrl: string }> => {
    const drive = getDriveClient();
    const safeName = filename.replace(/['"\\]/g, "");

    const existing = await drive.files.list({
      q: `name='${safeName}' and '${folderId}' in parents and trashed=false`,
      fields: "files(id, name)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    let fileId: string;
    if (existing.data.files && existing.data.files.length > 0) {
      fileId = existing.data.files[0].id!;
      await drive.files.update({
        fileId,
        media: { mimeType, body: Readable.from([buffer]) },
        supportsAllDrives: true,
      });
    } else {
      const created = await drive.files.create({
        requestBody: { name: safeName, parents: [folderId], mimeType },
        media: { mimeType, body: Readable.from([buffer]) },
        fields: "id",
        supportsAllDrives: true,
      });
      fileId = created.data.id!;
    }
    return { fileId, fileUrl: `https://drive.google.com/file/d/${fileId}/view` };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const uploadPromise = doUpload();
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("drive_upload_timeout")),
        DRIVE_UPLOAD_TIMEOUT_MS,
      );
    });
    return await Promise.race([uploadPromise, timeout]);
  } catch (err) {
    console.error("[google-drive] uploadBinaryToFolder failed:", err);
    // Promise.race only stops *waiting* — it can't cancel the in-flight Google
    // request. If the upload actually lands after we've already given up (and the
    // caller has fallen back to Object Storage), delete the orphaned Drive file.
    void uploadPromise
      .then((res) => deleteDriveFile(res.fileId))
      .catch(() => {});
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Best-effort delete of a Drive file by id. Used to clean up thumbnail uploads
 * when a variant is removed or a DB write is rolled back. Never throws — a
 * dangling Drive file is harmless and we don't want cleanup to fail the request.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const drive = getDriveClient();
    // Best-effort cleanup must never block the caller's response: a slow/hung
    // Drive delete (e.g. on the thumbnail cap / DB-rollback path) would
    // otherwise stall the request. Bound it like the upload.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("drive_delete_timeout")), DRIVE_UPLOAD_TIMEOUT_MS);
    });
    await Promise.race([drive.files.delete({ fileId, supportsAllDrives: true }), timeout]);
  } catch (err) {
    console.error("[google-drive] deleteDriveFile failed:", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Idempotently ensures a video folder exists for the given plan. Returns the
 * folder URL (existing or newly created). Returns `null` on any failure —
 * callers must tolerate a missing folder silently.
 *
 * Only creates folders for PRODUCTION_TIERS members.
 */
export async function ensureVideoFolderForPlan(
  planId: string,
  userId: string
): Promise<{ folderUrl: string } | null> {
  const plan = await prisma.contentPlan.findFirst({
    where: { id: planId, userId, deletedAt: null },
    select: { id: true, title: true, driveFolderLink: true },
  });
  if (!plan) return null;

  if (plan.driveFolderLink && plan.driveFolderLink.startsWith("http")) {
    return { folderUrl: plan.driveFolderLink };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { serviceTier: true, fullName: true, email: true, assetsDriveLink: true },
  });
  if (!user) return null;
  if (!PRODUCTION_TIERS.includes(user.serviceTier ?? "foundations")) return null;

  const memberName = user.fullName || user.email || userId;
  // createVideoFolder throws a structured DriveError on failure. We deliberately
  // DO NOT swallow it here — the caller surfaces the category so the member sees
  // a real reason instead of a silent no-op.
  const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(memberName, plan.title, userId);

  const updates: Promise<unknown>[] = [
    prisma.contentPlan.update({ where: { id: plan.id }, data: { driveFolderLink: videoFolderUrl } }),
  ];
  if (!user.assetsDriveLink) {
    updates.push(prisma.user.update({ where: { id: userId }, data: { assetsDriveLink: memberFolderUrl } }));
  }
  await Promise.all(updates);

  return { folderUrl: videoFolderUrl };
}

/**
 * Lists the files inside a Drive folder URL.
 */
export async function listFilesInFolder(folderUrl: string): Promise<Array<{ id: string; name: string; webViewLink: string | null; modifiedTime: string | null; mimeType: string | null }>> {
  try {
    const folderId = folderIdFromUrl(folderUrl);
    if (!folderId) return [];
    const drive = getDriveClient();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, webViewLink, modifiedTime, mimeType)",
      spaces: "drive",
      orderBy: "name",
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      webViewLink: f.webViewLink ?? null,
      modifiedTime: f.modifiedTime ?? null,
      mimeType: f.mimeType ?? null,
    }));
  } catch (err) {
    console.error("[google-drive] listFilesInFolder failed:", err);
    return [];
  }
}

/**
 * Fetches a Drive file's binary content as a Buffer + mimeType. Used by the
 * thumbnail proxy route to stream member-picked images through our origin so
 * the client never needs Drive auth and the URL stays stable.
 */
export async function fetchDriveFileBytes(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const drive = getDriveClient();
    const meta = await drive.files.get({ fileId, fields: "id, mimeType, parents", supportsAllDrives: true });
    const mimeType = meta.data.mimeType ?? "application/octet-stream";
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    return { buffer, mimeType };
  } catch (err) {
    console.error("[google-drive] fetchDriveFileBytes failed:", err);
    return null;
  }
}

/**
 * Verifies that the given Drive file lives inside the given folder URL —
 * prevents members from picking arbitrary file ids as thumbnails.
 */
export async function isFileInFolder(fileId: string, folderUrl: string): Promise<boolean> {
  try {
    const folderId = folderIdFromUrl(folderUrl);
    if (!folderId) return false;
    const drive = getDriveClient();
    const meta = await drive.files.get({ fileId, fields: "parents", supportsAllDrives: true });
    return (meta.data.parents ?? []).includes(folderId);
  } catch (err) {
    console.error("[google-drive] isFileInFolder failed:", err);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 3 — explicit folder sharing
// ───────────────────────────────────────────────────────────────────────────
// Shared-Drive folders are only visible to the service account by default, so
// the Client Hub link returns "You need access" for the member. After a folder
// is created we explicitly grant "writer" (Contributor) access to the owning
// member, their active team members, and the support address. Every helper here
// is BEST-EFFORT: a permission failure is logged and surfaced in the structured
// result, but never throws — folder creation and team-revoke must not break over
// a Drive sharing hiccup. Sharing can always be retried via the admin backfill.

// The support address that gets edit access to every plan folder for admin
// support. Override via DRIVE_SUPPORT_EMAIL without a code change.
export const DRIVE_SUPPORT_EMAIL =
  process.env.DRIVE_SUPPORT_EMAIL?.trim() || "jared@chamberlaingroup.ca";

export type DriveShareResult = {
  // Emails that now have access (newly granted OR already had a permission).
  granted: string[];
  // Recipients we deliberately skipped, with a machine-readable reason
  // (e.g. "member_email_missing", "team_member_email_missing").
  skipped: Array<{ email: string | null; reason: string }>;
  // Recipients whose permission grant failed, classified for observability.
  failed: Array<{ email: string; category: DriveErrorCategory }>;
};

function driveSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lists a folder's user/group permissions (paged). Throws on API error — the
 * caller decides how to degrade.
 */
async function listFolderPermissions(
  drive: drive_v3.Drive,
  folderId: string
): Promise<Array<{ id: string; emailAddress: string; role: string; type: string }>> {
  const out: Array<{ id: string; emailAddress: string; role: string; type: string }> = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.permissions.list({
      fileId: folderId,
      fields: "nextPageToken, permissions(id, emailAddress, role, type)",
      supportsAllDrives: true,
      pageSize: 100,
      pageToken,
    });
    for (const p of res.data.permissions ?? []) {
      out.push({
        id: p.id ?? "",
        emailAddress: (p.emailAddress ?? "").toLowerCase(),
        role: p.role ?? "",
        type: p.type ?? "",
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * Grants "writer" access to a plan's Drive folder to the owning member, their
 * active team members, and the support address. Idempotent (skips emails that
 * already hold a permission) and best-effort (never throws). `gapMs` inserts a
 * pause before each Drive API call so bulk/backfill runs stay under rate limits.
 */
export async function shareVideoFolderWithMember(
  folderId: string,
  ownerUserId: string,
  opts: { gapMs?: number } = {}
): Promise<DriveShareResult> {
  const gapMs = opts.gapMs ?? 0;
  const result: DriveShareResult = { granted: [], skipped: [], failed: [] };

  // Resolve the recipient list from the DB (owner email + active team emails).
  let ownerEmail: string | null = null;
  let teamEmails: string[] = [];
  try {
    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { email: true },
    });
    ownerEmail = owner?.email ?? null;
    const team = await prisma.teamMember.findMany({
      where: { primaryUserId: ownerUserId, status: "active" },
      select: { email: true },
    });
    teamEmails = team.map((t) => t.email);
  } catch (err) {
    console.error("[drive-share] failed to load recipients for owner", ownerUserId, err);
  }

  const recipients: string[] = [];
  const seen = new Set<string>();
  const addRecipient = (raw: string | null | undefined, label: string) => {
    const email = raw?.trim();
    if (!email) {
      result.skipped.push({ email: null, reason: `${label}_email_missing` });
      console.warn(`[drive-share] folder ${folderId}: ${label} has no email — skipping share`);
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push(email);
  };

  addRecipient(ownerEmail, "member");
  for (const e of teamEmails) addRecipient(e, "team_member");
  addRecipient(DRIVE_SUPPORT_EMAIL, "support");

  if (recipients.length === 0) return result;

  let drive: drive_v3.Drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    const de = classifyDriveError(err);
    for (const email of recipients) result.failed.push({ email, category: de.category });
    console.error("[drive-share] Drive client unavailable:", de.category);
    return result;
  }

  // Idempotency: skip emails that already have a permission on the folder.
  let existing = new Set<string>();
  try {
    if (gapMs) await driveSleep(gapMs);
    const perms = await listFolderPermissions(drive, folderId);
    existing = new Set(perms.filter((p) => p.emailAddress).map((p) => p.emailAddress));
  } catch (err) {
    // If we can't enumerate existing permissions, fall through and let
    // permissions.create run — it is forgiving for already-shared users.
    console.warn(
      `[drive-share] folder ${folderId}: could not list permissions (${classifyDriveError(err).category}); creating anyway`
    );
  }

  for (const email of recipients) {
    if (existing.has(email.toLowerCase())) {
      result.granted.push(email);
      continue;
    }
    try {
      if (gapMs) await driveSleep(gapMs);
      await drive.permissions.create({
        fileId: folderId,
        requestBody: { role: "writer", type: "user", emailAddress: email },
        sendNotificationEmail: false,
        supportsAllDrives: true,
      });
      result.granted.push(email);
    } catch (err) {
      const de = classifyDriveError(err);
      result.failed.push({ email, category: de.category });
      console.error(`[drive-share] folder ${folderId}: failed to share with ${email}:`, de.category);
    }
  }

  return result;
}

/**
 * Revokes a single email's permission on a Drive folder. Best-effort, never
 * throws. Returns whether a permission was actually removed.
 */
export async function revokeFolderAccessForEmail(
  folderId: string,
  email: string,
  opts: { gapMs?: number } = {}
): Promise<{ revoked: boolean; reason?: string; category?: DriveErrorCategory }> {
  const gapMs = opts.gapMs ?? 0;
  const target = email.trim().toLowerCase();
  if (!target) return { revoked: false, reason: "email_missing" };

  let drive: drive_v3.Drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    return { revoked: false, category: classifyDriveError(err).category };
  }

  let matches: Array<{ id: string; emailAddress: string; role: string; type: string }>;
  try {
    if (gapMs) await driveSleep(gapMs);
    const perms = await listFolderPermissions(drive, folderId);
    // An email can hold more than one permission (e.g. an inherited one plus a
    // direct one). Inherited permissions can't be deleted at the child and
    // return permission_denied, so try every match until a deletable (direct)
    // one succeeds instead of giving up on the first failure.
    matches = perms.filter((p) => p.emailAddress === target && p.id);
  } catch (err) {
    const de = classifyDriveError(err);
    console.error(`[drive-share] folder ${folderId}: failed to list permissions for revoke:`, de.category);
    return { revoked: false, category: de.category };
  }

  if (matches.length === 0) return { revoked: false, reason: "not_present" };

  let lastCategory: DriveErrorCategory | undefined;
  for (const m of matches) {
    try {
      if (gapMs) await driveSleep(gapMs);
      await drive.permissions.delete({
        fileId: folderId,
        permissionId: m.id,
        supportsAllDrives: true,
      });
      return { revoked: true };
    } catch (err) {
      const de = classifyDriveError(err);
      lastCategory = de.category;
      console.error(
        `[drive-share] folder ${folderId}: failed to revoke ${email} (perm ${m.id}):`,
        de.category
      );
    }
  }
  return { revoked: false, category: lastCategory };
}

/**
 * When a team member is removed, revoke their access to every Drive folder under
 * the primary's content plans. Rate-limited (~100ms between Drive calls) and
 * best-effort.
 */
export async function revokeTeamMemberFromAllFolders(
  primaryUserId: string,
  email: string
): Promise<{ scanned: number; revoked: number; notPresent: number; failed: number }> {
  const summary = { scanned: 0, revoked: 0, notPresent: 0, failed: 0 };
  let plans: Array<{ id: string; driveFolderLink: string | null }> = [];
  try {
    plans = await prisma.contentPlan.findMany({
      where: { userId: primaryUserId, driveFolderLink: { not: null } },
      select: { id: true, driveFolderLink: true },
    });
  } catch (err) {
    console.error("[drive-share] revokeTeamMember: failed to load plans", err);
    return summary;
  }

  for (const plan of plans) {
    const folderId = folderIdFromUrl(plan.driveFolderLink);
    if (!folderId) continue;
    summary.scanned += 1;
    const res = await revokeFolderAccessForEmail(folderId, email, { gapMs: 100 });
    if (res.revoked) summary.revoked += 1;
    else if (res.reason === "not_present") summary.notPresent += 1;
    else summary.failed += 1;
  }
  console.log(`[drive-share] revoked ${email} from ${primaryUserId}'s folders:`, summary);
  return summary;
}

/**
 * Admin backfill — apply the Phase 3 sharing rules to every existing plan folder.
 * Idempotent and rate-limited (~100ms between Drive calls). Safe to re-run.
 */
export async function backfillFolderSharing(): Promise<{
  plansScanned: number;
  plansShared: number;
  totalGranted: number;
  totalFailed: number;
  results: Array<{ planId: string; granted: number; skipped: number; failed: number }>;
}> {
  const summary = {
    plansScanned: 0,
    plansShared: 0,
    totalGranted: 0,
    totalFailed: 0,
    results: [] as Array<{ planId: string; granted: number; skipped: number; failed: number }>,
  };

  const plans = await prisma.contentPlan.findMany({
    where: { driveFolderLink: { not: null }, deletedAt: null },
    select: { id: true, userId: true, driveFolderLink: true },
  });

  for (const plan of plans) {
    const folderId = folderIdFromUrl(plan.driveFolderLink);
    if (!folderId) continue;
    summary.plansScanned += 1;
    const r = await shareVideoFolderWithMember(folderId, plan.userId, { gapMs: 100 });
    summary.totalGranted += r.granted.length;
    summary.totalFailed += r.failed.length;
    if (r.granted.length > 0) summary.plansShared += 1;
    summary.results.push({
      planId: plan.id,
      granted: r.granted.length,
      skipped: r.skipped.length,
      failed: r.failed.length,
    });
  }

  console.log("[drive-share] backfill done:", {
    plansScanned: summary.plansScanned,
    plansShared: summary.plansShared,
    totalGranted: summary.totalGranted,
    totalFailed: summary.totalFailed,
  });
  return summary;
}


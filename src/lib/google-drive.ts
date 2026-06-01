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
  videoTitle: string
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

    return {
      memberFolderUrl: `https://drive.google.com/drive/folders/${memberFolderId}`,
      videoFolderUrl: `https://drive.google.com/drive/folders/${videoFolderId}`,
      researchDocUrl,
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
export async function uploadBinaryToFolder(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
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

    const media = { mimeType, body: Readable.from([buffer]) };

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
    console.error("[google-drive] uploadBinaryToFolder failed:", err);
    return null;
  }
}

/**
 * Best-effort delete of a Drive file by id. Used to clean up thumbnail uploads
 * when a variant is removed or a DB write is rolled back. Never throws — a
 * dangling Drive file is harmless and we don't want cleanup to fail the request.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err) {
    console.error("[google-drive] deleteDriveFile failed:", err);
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
  const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(memberName, plan.title);

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

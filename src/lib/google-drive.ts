import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import prisma from "@/lib/prisma";
import { PRODUCTION_TIERS } from "@/lib/content-plan-utils";

function getDriveClient() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");

  const credentials = JSON.parse(keyRaw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
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
  });

  return folder.data.id!;
}

/**
 * Creates (or finds) a member's top-level asset folder under the root Drive folder.
 * Returns the shareable Google Drive link.
 */
export async function createMemberFolder(memberName: string): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");

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
    });
  } catch {
    // Permission may already exist — safe to ignore
  }

  return `https://drive.google.com/drive/folders/${memberFolderId}`;
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
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");

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
    });

    const media = {
      mimeType,
      body: Readable.from([content]),
    };

    let fileId: string;
    if (existing.data.files && existing.data.files.length > 0) {
      fileId = existing.data.files[0].id!;
      await drive.files.update({ fileId, media });
    } else {
      const created = await drive.files.create({
        requestBody: { name: safeName, parents: [folderId], mimeType },
        media,
        fields: "id",
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
  try {
    const plan = await prisma.contentPlan.findFirst({
      where: { id: planId, userId },
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
    const { videoFolderUrl, memberFolderUrl } = await createVideoFolder(memberName, plan.title);

    const updates: Promise<unknown>[] = [
      prisma.contentPlan.update({ where: { id: plan.id }, data: { driveFolderLink: videoFolderUrl } }),
    ];
    if (!user.assetsDriveLink) {
      updates.push(prisma.user.update({ where: { id: userId }, data: { assetsDriveLink: memberFolderUrl } }));
    }
    await Promise.all(updates);

    return { folderUrl: videoFolderUrl };
  } catch (err) {
    console.error("[google-drive] ensureVideoFolderForPlan failed:", err);
    return null;
  }
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

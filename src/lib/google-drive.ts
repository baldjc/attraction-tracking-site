import { google } from "googleapis";

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
  drive: ReturnType<typeof google.drive>,
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

  return {
    memberFolderUrl: `https://drive.google.com/drive/folders/${memberFolderId}`,
    videoFolderUrl: `https://drive.google.com/drive/folders/${videoFolderId}`,
  };
}

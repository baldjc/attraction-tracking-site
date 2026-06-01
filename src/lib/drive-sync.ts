import prisma from "@/lib/prisma";
import { folderIdFromUrl, uploadTextFileToFolder } from "@/lib/google-drive";
import { getFeatureFlags } from "@/lib/feature-flags";

/**
 * Maps PlanArtifact.type values to the filename used in the Drive folder.
 * Any type not in this map is treated as an opaque markdown file named after
 * the type (with underscores swapped for spaces, title-cased).
 */
export const ARTIFACT_FILENAMES: Record<string, string> = {
  script: "Script.md",
  script_review: "Script Review.md",
  title: "Title & Options.md",
  thumbnail: "Thumbnail Notes.md",
  description: "YouTube Description.md",
  repurpose_newsletter: "Repurposed - Newsletter.md",
  repurpose_linkedin: "Repurposed - LinkedIn.md",
  repurpose_facebook: "Repurposed - Facebook.md",
  repurpose_blog: "Repurposed - Blog.md",
  repurpose_postcard: "Repurposed - Postcard.md",
};

function fallbackFilename(type: string): string {
  const cleaned = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${cleaned}.md`;
}

/**
 * Looks up the plan's Drive folder and uploads/replaces the given artifact as
 * a markdown file. Silent failure — errors are logged but never thrown.
 *
 * No-ops when the `drive_auto_upload` flag is off or the plan has no folder.
 */
export async function syncArtifactToDrive(
  planId: string,
  artifactType: string,
  artifactContent: string
): Promise<void> {
  try {
    if (!artifactContent || typeof artifactContent !== "string") return;

    const flags = await getFeatureFlags();
    if (!flags.drive_auto_upload) return;

    const plan = await prisma.contentPlan.findFirst({
      where: { id: planId, deletedAt: null },
      select: { driveFolderLink: true },
    });
    if (!plan?.driveFolderLink) return;

    const folderId = folderIdFromUrl(plan.driveFolderLink);
    if (!folderId) return;

    const filename = ARTIFACT_FILENAMES[artifactType] ?? fallbackFilename(artifactType);
    await uploadTextFileToFolder(folderId, filename, artifactContent, "text/markdown");
  } catch (err) {
    console.error("[drive-sync] syncArtifactToDrive failed:", err);
  }
}

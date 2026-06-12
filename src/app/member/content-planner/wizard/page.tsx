import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * RETIRED: the standalone Content Engine wizard has been consolidated into the
 * Jarvis "Browse all content ideas" flow. This page no longer renders the
 * step UI — instead it redirects ALL remaining entries (saved bookmarks, old
 * deep-links, in-app `?step=`/`?draftId=` links, resume-draft prompts, and any
 * back-to-planner round-trips) into the Jarvis three-path browse chooser so
 * nothing 404s.
 *
 * NOTE: this only retires the IDEA wizard at `/member/content-planner/wizard`.
 * The separate Script Builder v2 at `/member/content-planner/wizard/script`
 * (its own route segment, still launched from the planner editor) is untouched.
 */
export default async function RetiredWizardPage() {
  redirect("/member/jarvis?thread=new&browse=1");
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getFeatureFlags } from "@/lib/feature-flags";
import TeamPipelineClient from "./TeamPipelineClient";

export const metadata = { title: "Team Pipeline – Attraction by Video" };

export default async function AdminTeamPipelinePage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "editor")) {
    redirect("/admin");
  }

  const flags = await getFeatureFlags();
  if (!flags.team_pipeline) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">🎬 Team Pipeline</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-2">This feature is currently disabled. Enable <code>team_pipeline</code> in Admin Settings → Feature Visibility to use it.</p>
      </div>
    );
  }

  return <TeamPipelineClient currentUserId={(session.user as { id: string }).id} currentUserRole={role!} />;
}

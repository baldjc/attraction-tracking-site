import { resolveUserFromSession } from "@/lib/session-utils";
import EditorDashboard from "./EditorDashboard";
import MemberDashboard from "./MemberDashboard";

export default async function DashboardPage() {
  // Impersonation-aware: role is the real account role; isImpersonating is true
  // only for a valid impersonation cookie owned by the current account.
  const resolved = await resolveUserFromSession();
  const role = resolved?.role;

  // If a member, always show personal dashboard
  if (role === "foundations_member") {
    return <MemberDashboard />;
  }

  // If an admin/editor is actively impersonating a member, show that member's personal dashboard
  if (resolved?.isImpersonating) {
    return <MemberDashboard />;
  }

  // Editors/admins with no impersonation → member selector view
  return <EditorDashboard />;
}

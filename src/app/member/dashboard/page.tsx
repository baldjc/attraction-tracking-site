import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";
import EditorDashboard from "./EditorDashboard";
import MemberDashboard from "./MemberDashboard";

export default async function DashboardPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;

  // If a member, always show personal dashboard
  if (role === "foundations_member") {
    return <MemberDashboard />;
  }

  // If an admin/editor is actively impersonating a member, show that member's personal dashboard
  const cookieStore = await cookies();
  const isImpersonating = !!cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (isImpersonating) {
    return <MemberDashboard />;
  }

  // Editors/admins with no impersonation → member selector view
  return <EditorDashboard />;
}

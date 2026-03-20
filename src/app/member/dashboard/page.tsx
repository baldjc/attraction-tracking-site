import { auth } from "@/lib/auth";
import EditorDashboard from "./EditorDashboard";
import MemberDashboard from "./MemberDashboard";

export default async function DashboardPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role === "foundations_member") {
    return <MemberDashboard />;
  }
  return <EditorDashboard />;
}

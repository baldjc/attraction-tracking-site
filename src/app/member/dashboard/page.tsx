import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EditorDashboard from "./EditorDashboard";

export default async function DashboardPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role === "foundations_member") {
    redirect("/member/scores");
  }
  return <EditorDashboard />;
}

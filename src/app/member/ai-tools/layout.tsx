import { auth } from "@/lib/auth";
import WorkingForBanner from "@/components/ai-tools/WorkingForBanner";
import AvatarTestPanel from "@/components/admin/AvatarTestPanel";

export default async function AIToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? "";
  const isAdmin = role === "admin";
  const isEditor = role === "editor";

  return (
    <>
      {isAdmin && <AvatarTestPanel />}
      {isEditor && <WorkingForBanner />}
      {children}
    </>
  );
}

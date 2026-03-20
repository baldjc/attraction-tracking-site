import { auth } from "@/lib/auth";
import WorkingForBanner from "@/components/ai-tools/WorkingForBanner";

export default async function AIToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? "";
  const isStaff = role === "admin" || role === "editor";

  return (
    <>
      {isStaff && <WorkingForBanner />}
      {children}
    </>
  );
}

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import WorkingForBanner from "@/components/ai-tools/WorkingForBanner";
import AvatarTestPanel from "@/components/admin/AvatarTestPanel";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";

export default async function AIToolsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? "";
  const isAdmin = role === "admin";
  const isEditor = role === "editor";

  const cookieStore = await cookies();
  const isImpersonating = !!cookieStore.get(IMPERSONATE_COOKIE)?.value;

  return (
    <>
      {isAdmin && !isImpersonating && <AvatarTestPanel />}
      {(isEditor || (isAdmin && isImpersonating)) && <WorkingForBanner />}
      {children}
    </>
  );
}

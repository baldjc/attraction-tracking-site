import { resolveUserFromSession } from "@/lib/session-utils";
import WorkingForBanner from "@/components/ai-tools/WorkingForBanner";
import AvatarTestPanel from "@/components/admin/AvatarTestPanel";

export default async function AIToolsLayout({ children }: { children: React.ReactNode }) {
  // role is the real signed-in account's role (admin chrome must key off the
  // actual account, not the impersonated member); isImpersonating reflects a
  // valid impersonation cookie owned by this account.
  const resolved = await resolveUserFromSession();
  const role = resolved?.role ?? "";
  const isAdmin = role === "admin";
  const isEditor = role === "editor";

  const isImpersonating = !!resolved?.isImpersonating;

  return (
    <>
      {isAdmin && !isImpersonating && <AvatarTestPanel />}
      {(isEditor || (isAdmin && isImpersonating)) && <WorkingForBanner />}
      {children}
    </>
  );
}

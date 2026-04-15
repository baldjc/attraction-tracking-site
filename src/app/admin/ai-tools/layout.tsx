import { auth } from "@/lib/auth";
import AvatarTestPanel from "@/components/admin/AvatarTestPanel";

export default async function AdminAIToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.role === "admin";

  return (
    <>
      {isAdmin && <AvatarTestPanel />}
      {children}
    </>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminIntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "admin") {
    redirect("/admin");
  }
  return <>{children}</>;
}

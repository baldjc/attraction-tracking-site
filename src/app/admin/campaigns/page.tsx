import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CampaignsPage() {
  const session = await auth();
  if ((session?.user as any)?.role === "editor") redirect("/admin");

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1e2a38]">Campaigns</h1>
      <p className="text-[#1e2a38]/60 mt-2">Link tracker coming in Phase 3.</p>
    </div>
  );
}

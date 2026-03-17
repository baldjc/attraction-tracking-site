import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import ScriptReviewChatUI from "@/components/ai-tools/ScriptReviewChatUI";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const metadata = { title: "Script Review – Admin" };

export default async function AdminScriptReviewPage() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email! },
    select: { avatarSummary: true, avatarName: true },
  });

  const noAvatar = !user?.avatarSummary && !user?.avatarName;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-5">
        <Link
          href="/admin/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#1e2a38]">Script Review</h1>
        <p className="text-sm text-[#1e2a38]/60 mt-1">
          Paste a script and get scored on 14 Attraction principles — then chat to improve it.
        </p>
      </div>

      <ScriptReviewChatUI basePath="/admin/ai-tools" noAvatar={noAvatar} />
    </div>
  );
}

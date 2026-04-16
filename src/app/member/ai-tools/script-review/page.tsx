import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import ScriptReviewChatUI from "@/components/ai-tools/ScriptReviewChatUI";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const metadata = { title: "Script Review – Attraction by Video" };

export default async function MemberScriptReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const planId = params.planId;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email! },
    select: { avatarSummary: true, avatarName: true },
  });

  const noAvatar = !user?.avatarSummary && !user?.avatarName;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <Link
          href="/member/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#2f3437]">📋 Script Review</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">
          Paste your script and get scored on 14 Attraction principles — then chat to improve it.
        </p>
      </div>

      {planId && <LinkedPlanBanner planId={planId} />}

      <ScriptReviewChatUI basePath="/member/ai-tools" noAvatar={noAvatar} />
    </div>
  );
}

import { resolveUserFromSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import ScriptReviewChatUI from "@/components/ai-tools/ScriptReviewChatUI";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";
import InlineUpgradeBanner from "@/components/upgrade/InlineUpgradeBanner";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const metadata = { title: "Script Review – Attraction by Video" };

export default async function MemberScriptReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  // Impersonation-aware so the avatar context loads for the impersonated member.
  const resolved = await resolveUserFromSession();
  if (!resolved) redirect("/login");

  const params = await searchParams;
  const planId = params.planId;

  const user = await prisma.user.findUnique({
    where: { id: resolved.id },
    select: { avatarSummary: true, avatarName: true },
  });

  const noAvatar = !user?.avatarSummary && !user?.avatarName;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <Link
          href="/member/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-ai-tools)] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">📋 Script Review</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">
          Paste your script and get scored on 14 Attraction principles — then chat to improve it.
        </p>
      </div>

      {planId && <LinkedPlanBanner planId={planId} />}
      <InlineUpgradeBanner message="Want scripts to save back to a planner with their score? That's a Production feature." />

      <ScriptReviewChatUI basePath="/member/ai-tools" noAvatar={noAvatar} defaultPlanId={planId} />
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import { getChannelInfo } from "@/lib/youtube";
import PortfolioBalance from "@/components/reviewer/PortfolioBalance";
import FortyEightHourPulse from "@/components/reviewer/FortyEightHourPulse";
import GlanceTestQueue from "@/components/reviewer/GlanceTestQueue";
import { SuggestedWinners } from "@/components/reviewer/SuggestedWinners";
import { CoachPanel } from "@/components/reviewer/CoachPanel";
import SyncNowButton from "./SyncNowButton";

export const dynamic = "force-dynamic";

async function resolveChannel(
  id: string,
): Promise<{ name: string; channelRef: string } | null> {
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, ownChannelId: true, ownChannelUrl: true },
  });
  if (client) {
    let channelRef = client.ownChannelId;
    if (!channelRef && client.ownChannelUrl) {
      try {
        const info = await getChannelInfo(client.ownChannelUrl);
        channelRef = info?.channelId ?? null;
      } catch {
        // ignore
      }
    }
    if (channelRef) {
      return { name: client.name, channelRef };
    }
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      youtubeHandle: true,
      youtubeChannelUrl: true,
    },
  });
  if (user) {
    const handle = user.youtubeHandle || user.youtubeChannelUrl;
    if (handle) {
      try {
        const info = await getChannelInfo(handle);
        if (info?.channelId) {
          return {
            name: user.fullName || user.email || "Channel",
            channelRef: info.channelId,
          };
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export default async function ReviewerChannelPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    redirect("/login");
  }
  if (!(await isReviewerEnabled())) {
    notFound();
  }

  const { clientId } = await params;
  const resolved = await resolveChannel(clientId);
  if (!resolved) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-2 py-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/intelligence/clients/${clientId}`}
            className="text-sm text-[#787774] hover:text-[#2f3437]"
          >
            ← Client
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-[#2f3437] dark:text-white">
            {resolved.name}
          </h1>
          <p className="mt-1 text-sm text-[#787774]">
            Analytics Reviewer · channel{" "}
            <code className="font-data text-xs">{resolved.channelRef}</code>
          </p>
        </div>
        <SyncNowButton channelId={resolved.channelRef} />
      </div>

      <PortfolioBalance channelRef={resolved.channelRef} />
      <FortyEightHourPulse channelRef={resolved.channelRef} />
      <GlanceTestQueue channelRef={resolved.channelRef} />
      <SuggestedWinners channelRef={resolved.channelRef} />
      <CoachPanel channelRef={resolved.channelRef} />
    </div>
  );
}

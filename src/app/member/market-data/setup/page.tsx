import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { emptyMarketConfig } from "@/lib/market-config";
import { getMarketConfigForUser } from "@/lib/market-config-server";
import SetupForm from "@/components/market-data/SetupForm";

export const dynamic = "force-dynamic";

export default async function MarketDataSetupPage() {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_market_data) redirect("/member/dashboard");

  const existing = await getMarketConfigForUser(user.id);
  const initial = existing ?? emptyMarketConfig();
  const isEdit = !!existing;

  // Ship B — voice-guide upload is gated by its own flag (Done-With-You
  // tier + allowlist). Foundations members never see the section. Pull the
  // existing voice-guide metadata so the UI can render the "Last uploaded"
  // pill + source-file pill without an extra round-trip.
  const voiceGuideEnabled = !!flags.tool_member_voice_guide;
  let voiceGuideInitial: {
    charCount: number;
    uploadedAt: string | null;
    sourceFile: string | null;
  } | null = null;
  if (voiceGuideEnabled && isEdit) {
    const row = await prisma.marketConfig.findUnique({
      where: { userId: user.id },
      select: {
        voiceGuide: true,
        voiceGuideUploadedAt: true,
        voiceGuideSourceFile: true,
      },
    });
    if (row?.voiceGuide && row.voiceGuide.trim().length > 0) {
      voiceGuideInitial = {
        charCount: row.voiceGuide.length,
        uploadedAt: row.voiceGuideUploadedAt
          ? row.voiceGuideUploadedAt.toISOString()
          : null,
        sourceFile: row.voiceGuideSourceFile,
      };
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {isEdit ? "Edit your market" : "Set up your market"}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Tell us about your local MLS market. Only market name and MLS source
          are required to start uploading data — everything else has sensible
          defaults you can adjust later.
        </p>
      </header>
      <SetupForm
        initial={initial}
        isEdit={isEdit}
        voiceGuideEnabled={voiceGuideEnabled}
        voiceGuideInitial={voiceGuideInitial}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import {
  getMarketConfigForUser,
  getMaxUploadBatchForUser,
} from "@/lib/market-config-server";
import UploadPanel from "@/components/market-data/UploadPanel";
import UploadHistoryTable from "@/components/market-data/UploadHistoryTable";
import UploadProgressBanner from "@/components/market-data/UploadProgressBanner";
import CsvRulesCard from "@/components/market-data/CsvRulesCard";
import MethodologySettings from "@/components/market-data/MethodologySettings";

export const dynamic = "force-dynamic";

export default async function MarketDataPage() {
  const user = await resolveUserFromSession();
  if (!user) redirect("/login");

  const flags = await getFeatureFlags({
    userId: user.id,
    userRole: user.role,
  });
  if (!flags.tool_market_data) redirect("/member/dashboard");

  const config = await getMarketConfigForUser(user.id);
  if (!config) redirect("/member/market-data/setup");

  const { limit: maxUploadBatch } = await getMaxUploadBatchForUser(user.id);

  const uploadsRaw = await prisma.marketDataUpload.findMany({
    where: { userId: user.id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      label: true,
      monthYear: true,
      csvFileName: true,
      rowCount: true,
      status: true,
      uploadedAt: true,
      _count: {
        select: {
          facts: true,
          storyLeads: true,
        },
      },
    },
  });

  // Lightweight companion query: which uploads have stored validator output.
  // We deliberately DON'T select rawValidatorOutput in the main query above —
  // it's a large blob — so we fetch just the ids of rows that have it and build
  // a Set. Drives the "re-trying persistence only (no cost)" Regenerate copy.
  const withRawRows = await prisma.marketDataUpload.findMany({
    where: { userId: user.id, NOT: { rawValidatorOutput: null } },
    select: { id: true },
  });
  const withRawSet = new Set(withRawRows.map((r) => r.id));

  const uploads = uploadsRaw.map(({ _count, ...rest }) => ({
    ...rest,
    factCount: _count.facts,
    storyLeadCount: _count.storyLeads,
    hasValidatorOutput: withRawSet.has(rest.id),
  }));

  const hasColumnMapping =
    !!config.columnMapping &&
    Object.keys(config.columnMapping).length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Market Data
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {config.marketName} · {config.mlsSource}
          </p>
        </div>
        <a
          href="/member/market-data/setup"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Edit market settings
        </a>
      </header>

      <UploadProgressBanner
        uploads={uploads.map((u) => ({ id: u.id, status: u.status }))}
      />

      <CsvRulesCard />

      <UploadPanel
        existingMapping={config.columnMapping}
        hasColumnMapping={hasColumnMapping}
        maxUploadBatch={maxUploadBatch}
      />

      <section>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          Upload history
        </h2>
        <UploadHistoryTable
          isAdmin={user.isAdmin}
          initial={uploads.map((u) => ({
            ...u,
            uploadedAt: u.uploadedAt.toISOString(),
          }))}
        />
      </section>

      <MethodologySettings />
    </div>
  );
}

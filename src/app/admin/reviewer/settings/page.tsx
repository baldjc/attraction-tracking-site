import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { getOAuthStatus } from "@/lib/youtube-oauth";
import ReviewerSettingsClient from "./ReviewerSettingsClient";
import FeatureFlagToggle from "./FeatureFlagToggle";

export const dynamic = "force-dynamic";

export default async function ReviewerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; reason?: string }>;
}) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    redirect("/login");
  }

  const [status, flagRow] = await Promise.all([
    getOAuthStatus(),
    prisma.appSetting.findUnique({
      where: { key: "tool_analytics_reviewer" },
      select: { value: true },
    }),
  ]);

  const flagOn = flagRow?.value === "true";
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-sm text-[var(--abv-text-secondary)] hover:text-[var(--abv-text)]"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[var(--abv-text)]">
          Analytics Reviewer — Settings
        </h1>
        <p className="mt-2 text-sm text-[var(--abv-text-secondary)]">
          Admin-only coaching layer. Connect YouTube Analytics to enable
          channel data sync.
        </p>
      </div>

      <FeatureFlagToggle initialEnabled={flagOn} />

      {!flagOn && (
        <div
          className="mb-6 rounded-xl border border-[var(--abv-scores)]/30 bg-[var(--abv-scores)]/5 p-4 text-sm text-[var(--abv-text)]"
          style={{ borderRadius: "var(--atbv-radius-lg)" }}
        >
          <strong className="font-semibold">Feature flag is OFF.</strong>{" "}
          API routes return 404 and the sidebar section is hidden until you
          toggle this on.
        </div>
      )}

      {params.oauth === "success" && (
        <div className="mb-6 rounded-xl border border-[var(--abv-academy)]/30 bg-[var(--abv-academy)]/5 p-4 text-sm text-[var(--abv-text)]">
          Connected successfully.
        </div>
      )}

      {params.oauth === "failed" && (
        <div className="mb-6 rounded-xl border border-[var(--abv-crimson)]/30 bg-[var(--abv-crimson)]/5 p-4 text-sm text-[var(--abv-text)]">
          Connection failed: {params.reason || "unknown error"}
        </div>
      )}

      <ReviewerSettingsClient initialStatus={status} />
    </div>
  );
}

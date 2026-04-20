import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { getOAuthStatus } from "@/lib/youtube-oauth";
import ReviewerSettingsClient from "./ReviewerSettingsClient";

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
          className="text-sm text-[#787774] hover:text-[#2f3437]"
        >
          ← Admin
        </Link>
        <h1 className="font-display mt-2 text-3xl text-[#2f3437]">
          Analytics Reviewer — Settings
        </h1>
        <p className="mt-2 text-sm text-[#787774]">
          Admin-only coaching layer. Connect YouTube Analytics to enable
          channel data sync.
        </p>
      </div>

      {!flagOn && (
        <div
          className="mb-6 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 text-sm text-[#2f3437]"
          style={{ borderRadius: "var(--atbv-radius-lg)" }}
        >
          <strong className="font-semibold">Feature flag is OFF.</strong>{" "}
          Enable <code className="font-data">tool_analytics_reviewer</code> in{" "}
          AppSetting to expose the Reviewer surfaces.
        </div>
      )}

      {params.oauth === "success" && (
        <div className="mb-6 rounded-xl border border-[#10b981]/30 bg-[#10b981]/5 p-4 text-sm text-[#2f3437]">
          Connected successfully.
        </div>
      )}

      {params.oauth === "failed" && (
        <div className="mb-6 rounded-xl border border-[#e63946]/30 bg-[#e63946]/5 p-4 text-sm text-[#2f3437]">
          Connection failed: {params.reason || "unknown error"}
        </div>
      )}

      <ReviewerSettingsClient initialStatus={status} />
    </div>
  );
}

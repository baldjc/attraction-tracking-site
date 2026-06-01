"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, FolderIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { STATUS_STYLES } from "@/lib/content-plan-utils";
import { LinkButton } from "@/components/ui/Button";

interface ContentPlan {
  id: string;
  title: string;
  status: string;
  shootDate: string | null;
  editDueDate: string | null;
  driveFolderLink: string | null;
}

interface QuickLink {
  id: string;
  label: string;
  url: string;
}

interface HubData {
  assetsDriveLink: string | null;
  productionPlans: ContentPlan[];
  quickLinks: QuickLink[];
  serviceTier: string;
}

const GROWTH_DWY = ["growth", "done_with_you"];

export default function ClientHubClient() {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/member/client-hub")
      .then((r) => {
        if (r.status === 403) { setForbidden(true); return null; }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-48 mb-3" />
            <div className="h-10 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (forbidden || !data) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
        <FolderIcon className="w-10 h-10 mx-auto mb-4 text-[var(--abv-azure)] opacity-60" />
        <h2 className="text-lg font-semibold text-[var(--abv-text)] mb-2">
          Client Hub is a done-with-you feature
        </h2>
        <p className="text-sm text-[var(--abv-text)]/60 max-w-md mx-auto mb-6">
          Your assets folder, production pipeline, and quick links live here once
          you have a Production, Growth, or Done-With-You plan. Want a team to
          handle the production work for you?
        </p>
        <LinkButton href="/member/hire">
          Explore Hire a Human
          <ArrowRightIcon className="w-4 h-4" />
        </LinkButton>
      </div>
    );
  }

  const showEditDue = GROWTH_DWY.includes(data.serviceTier);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderIcon className="w-5 h-5 text-[var(--abv-azure)]" />
          <h2 className="text-base font-semibold text-[var(--abv-text)]">Assets Folder</h2>
        </div>
        {data.assetsDriveLink ? (
          <div>
            <LinkButton href={data.assetsDriveLink} target="_blank">
              <FolderIcon className="w-4 h-4" />
              Open Assets Folder
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </LinkButton>
            <p className="text-xs text-[var(--abv-text)]/40 mt-3">
              All video-specific folders are created automatically when videos are added to your Content Planner. If your assets folder hasn't been set up yet, contact your admin.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[var(--abv-text)]/40">
            <FolderIcon className="w-8 h-8 shrink-0 opacity-30" />
            <p className="text-sm">
              Your assets folder is being set up. We'll have this ready for you shortly.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">Content Pipeline</h2>
        {data.productionPlans.length === 0 ? (
          <p className="text-sm text-[var(--abv-text)]/40">No videos in your pipeline yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-[var(--abv-text)]/50 py-2 pr-4">Title</th>
                  <th className="text-left text-xs font-medium text-[var(--abv-text)]/50 py-2 pr-4">Status</th>
                  <th className="text-left text-xs font-medium text-[var(--abv-text)]/50 py-2 pr-4">Shoot Date</th>
                  {showEditDue && (
                    <th className="text-left text-xs font-medium text-[var(--abv-text)]/50 py-2 pr-4">Edit Due</th>
                  )}
                  <th className="text-left text-xs font-medium text-[var(--abv-text)]/50 py-2">Folder</th>
                </tr>
              </thead>
              <tbody>
                {data.productionPlans.map((plan) => (
                  <tr key={plan.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-[var(--abv-text)]">{plan.title}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="inline-block text-xs font-medium px-2 py-0.5 rounded"
                        style={{
                          background: STATUS_STYLES[plan.status]?.bg ?? "#E3E2E0",
                          color: STATUS_STYLES[plan.status]?.text ?? "#3F3D38",
                        }}
                      >
                        {plan.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--abv-text)]/60">
                      {plan.shootDate
                        ? new Date(plan.shootDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
                        : "—"}
                    </td>
                    {showEditDue && (
                      <td className="py-2.5 pr-4 text-[var(--abv-text)]/60">
                        {plan.editDueDate
                          ? new Date(plan.editDueDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
                          : "—"}
                      </td>
                    )}
                    <td className="py-2.5">
                      {plan.driveFolderLink ? (
                        <a
                          href={plan.driveFolderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--abv-azure)] hover:text-[#5a8fb0] text-xs"
                        >
                          <FolderIcon className="w-3.5 h-3.5" />
                          Open
                        </a>
                      ) : (
                        <span className="text-[var(--abv-text)]/30 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link
            href="/member/content-planner"
            className="inline-flex items-center gap-1 text-sm text-[var(--abv-azure)] hover:text-[#5a8fb0] font-medium"
          >
            View Full Planner
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {GROWTH_DWY.includes(data.serviceTier) && data.quickLinks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-[var(--abv-text)] mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.quickLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 transition-colors group"
              >
                <span className="text-sm font-medium text-[var(--abv-text)] truncate">{link.label}</span>
                <ArrowTopRightOnSquareIcon className="w-4 h-4 text-[var(--abv-text)]/30 group-hover:text-[var(--abv-azure)] shrink-0 transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, FolderIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { STATUS_STYLES } from "@/lib/content-plan-utils";

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

const GROWTH_DWY = ["mastery_2", "mastery_4", "done_with_you"];

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
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-[#2f3437]/40 text-sm">
        This page is available for Production, Growth, and Done-With-You members.
      </div>
    );
  }

  const showEditDue = GROWTH_DWY.includes(data.serviceTier);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderIcon className="w-5 h-5 text-[#6ba3c7]" />
          <h2 className="text-base font-semibold text-[#2f3437]">Assets Folder</h2>
        </div>
        {data.assetsDriveLink ? (
          <div>
            <a
              href={data.assetsDriveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5a8fb0] text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              <FolderIcon className="w-4 h-4" />
              Open Assets Folder
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </a>
            <p className="text-xs text-[#2f3437]/40 mt-3">
              All video-specific folders are created automatically when videos are added to your Content Planner. If your assets folder hasn't been set up yet, contact your admin.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[#2f3437]/40">
            <FolderIcon className="w-8 h-8 shrink-0 opacity-30" />
            <p className="text-sm">
              Your assets folder is being set up. We'll have this ready for you shortly.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-[#2f3437] mb-4">Content Pipeline</h2>
        {data.productionPlans.length === 0 ? (
          <p className="text-sm text-[#2f3437]/40">No videos in your pipeline yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-[#2f3437]/50 py-2 pr-4">Title</th>
                  <th className="text-left text-xs font-medium text-[#2f3437]/50 py-2 pr-4">Status</th>
                  <th className="text-left text-xs font-medium text-[#2f3437]/50 py-2 pr-4">Shoot Date</th>
                  {showEditDue && (
                    <th className="text-left text-xs font-medium text-[#2f3437]/50 py-2 pr-4">Edit Due</th>
                  )}
                  <th className="text-left text-xs font-medium text-[#2f3437]/50 py-2">Folder</th>
                </tr>
              </thead>
              <tbody>
                {data.productionPlans.map((plan) => (
                  <tr key={plan.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-[#2f3437]">{plan.title}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: STATUS_STYLES[plan.status]?.bg ?? "#f3f4f6",
                          color: STATUS_STYLES[plan.status]?.text ?? "#6b7280",
                        }}
                      >
                        {plan.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[#2f3437]/60">
                      {plan.shootDate
                        ? new Date(plan.shootDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
                        : "—"}
                    </td>
                    {showEditDue && (
                      <td className="py-2.5 pr-4 text-[#2f3437]/60">
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
                          className="inline-flex items-center gap-1 text-[#6ba3c7] hover:text-[#5a8fb0] text-xs"
                        >
                          <FolderIcon className="w-3.5 h-3.5" />
                          Open
                        </a>
                      ) : (
                        <span className="text-[#2f3437]/30 text-xs">—</span>
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
            className="inline-flex items-center gap-1 text-sm text-[#6ba3c7] hover:text-[#5a8fb0] font-medium"
          >
            View Full Planner
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {GROWTH_DWY.includes(data.serviceTier) && data.quickLinks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#2f3437] mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.quickLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 transition-colors group"
              >
                <span className="text-sm font-medium text-[#2f3437] truncate">{link.label}</span>
                <ArrowTopRightOnSquareIcon className="w-4 h-4 text-[#2f3437]/30 group-hover:text-[#6ba3c7] shrink-0 transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

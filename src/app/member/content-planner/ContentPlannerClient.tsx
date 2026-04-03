"use client";

import { useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import ContentPlanTable from "@/components/content-planner/ContentPlanTable";
import { hasEditDueDate } from "@/lib/content-plan-utils";

type ViewId = "publish_cal" | "shoot_cal" | "edit_due" | "table" | "by_theme";

interface Props {
  serviceTier: string;
}

const COMING_SOON_VIEWS: ViewId[] = ["publish_cal", "shoot_cal", "edit_due", "by_theme"];

export default function ContentPlannerClient({ serviceTier }: Props) {
  const [view, setView] = useState<ViewId>("table");
  const showEditDueTab = hasEditDueDate(serviceTier);

  const ALL_TABS: { id: ViewId; label: string; restricted: boolean }[] = [
    { id: "publish_cal", label: "Publish Calendar", restricted: false },
    { id: "shoot_cal",   label: "Shoot Calendar",   restricted: false },
    { id: "edit_due",    label: "Edit Due",          restricted: !showEditDueTab },
    { id: "table",       label: "Table",             restricted: false },
    { id: "by_theme",    label: "By Theme",          restricted: false },
  ];
  const TABS = ALL_TABS.filter((t) => !t.restricted);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                view === tab.id
                  ? "bg-[#6ba3c7] text-white shadow-sm"
                  : "text-[#2f3437]/60 hover:text-[#2f3437] hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-1.5 text-sm text-[#2f3437]/40 border border-gray-200 bg-white px-3 py-1.5 rounded-lg cursor-not-allowed"
          >
            <CalendarDaysIcon className="w-4 h-4" />
            Subscribe to Calendar
          </button>
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 shadow-md text-[#2f3437]/70 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
            Coming soon
          </div>
        </div>
      </div>

      {COMING_SOON_VIEWS.includes(view) ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-[#2f3437]/40 text-sm">
          <CalendarDaysIcon className="w-10 h-10 mx-auto mb-3 text-[#2f3437]/20" />
          <p>This view is coming soon.</p>
        </div>
      ) : (
        <ContentPlanTable
          apiBase="/api/member/content-plans"
          forcedServiceTier={serviceTier}
        />
      )}
    </div>
  );
}

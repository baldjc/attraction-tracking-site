"use client";

import { useState } from "react";
import { CalendarDaysIcon, ClipboardDocumentIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import ContentPlanTable from "@/components/content-planner/ContentPlanTable";
import CalendarView from "@/components/content-planner/CalendarView";
import BoardView from "@/components/content-planner/BoardView";
import { hasEditDueDate } from "@/lib/content-plan-utils";

type ViewId = "publish_cal" | "shoot_cal" | "edit_due" | "table" | "by_theme";

interface Props {
  serviceTier: string;
  apiBase?: string;
  isAdminView?: boolean;
}

export default function ContentPlannerClient({
  serviceTier,
  apiBase = "/api/member/content-plans",
  isAdminView = false,
}: Props) {
  const [view, setView] = useState<ViewId>("table");
  const [showCalModal, setShowCalModal] = useState(false);
  const [calUrl, setCalUrl] = useState<string | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const showEditDueTab = hasEditDueDate(serviceTier);

  const ALL_TABS: { id: ViewId; label: string; restricted: boolean }[] = [
    { id: "table",       label: "Table",             restricted: false },
    { id: "publish_cal", label: "Publish Calendar",  restricted: false },
    { id: "shoot_cal",   label: "Shoot Calendar",    restricted: false },
    { id: "edit_due",    label: "Edit Due",           restricted: !showEditDueTab },
    { id: "by_theme",    label: "By Theme",           restricted: false },
  ];
  const TABS = ALL_TABS.filter((t) => !t.restricted);

  async function openCalModal() {
    setShowCalModal(true);
    if (calUrl) return;
    setCalLoading(true);
    try {
      const res = await fetch("/api/member/content-planner/calendar-token");
      const data = await res.json();
      setCalUrl(data.url ?? null);
    } catch {
      // silent
    } finally {
      setCalLoading(false);
    }
  }

  function copyUrl() {
    if (!calUrl) return;
    navigator.clipboard.writeText(calUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center flex-wrap gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
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
        {!isAdminView && (
          <button
            onClick={openCalModal}
            className="flex items-center gap-1.5 text-sm text-[#2f3437]/70 border border-gray-200 bg-white px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <CalendarDaysIcon className="w-4 h-4" />
            Subscribe to Calendar
          </button>
        )}
      </div>

      {view === "table" && (
        <ContentPlanTable
          apiBase={apiBase}
          forcedServiceTier={serviceTier}
        />
      )}

      {view === "publish_cal" && (
        <CalendarView
          apiBase={apiBase}
          calendarType="publish"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
        />
      )}

      {view === "shoot_cal" && (
        <CalendarView
          apiBase={apiBase}
          calendarType="shoot"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
        />
      )}

      {view === "edit_due" && showEditDueTab && (
        <CalendarView
          apiBase={apiBase}
          calendarType="edit_due"
          serviceTier={serviceTier}
          isAdmin={isAdminView}
        />
      )}

      {view === "by_theme" && (
        <BoardView
          apiBase={apiBase}
          serviceTier={serviceTier}
          isAdmin={isAdminView}
        />
      )}

      {!isAdminView && showCalModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-[#6ba3c7]" />
                <h3 className="text-base font-semibold text-[#2f3437]">Subscribe to Calendar</h3>
              </div>
              <button onClick={() => setShowCalModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {calLoading ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse mb-4" />
            ) : calUrl ? (
              <div className="flex gap-2 mb-5">
                <input
                  type="text"
                  readOnly
                  value={calUrl}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-[#2f3437]/70 bg-gray-50 focus:outline-none"
                />
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#6ba3c7] hover:bg-[#5a8fb0] text-white text-sm rounded-lg transition-colors shrink-0"
                >
                  {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-red-600 mb-4">Failed to generate your calendar link. Please try again.</p>
            )}

            <div className="space-y-3 text-sm text-[#2f3437]/70">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="font-medium text-[#2f3437]">How to subscribe:</p>
                <p><span className="font-medium">Google Calendar:</span> Settings → Add calendar → From URL → paste the link</p>
                <p><span className="font-medium">Apple Calendar:</span> File → New Calendar Subscription → paste the link</p>
              </div>
              <p className="text-xs text-[#2f3437]/40">
                Your calendar updates automatically when you make changes. Google Calendar refreshes every 12–24 hours. Apple Calendar refreshes every 15–60 minutes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

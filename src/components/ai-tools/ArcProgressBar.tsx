"use client";

export const SECTIONS = [
  { key: "research_strategy", label: "Research & Strategy" },
  { key: "opening", label: "Opening" },
  { key: "credibility", label: "Credibility" },
  { key: "insights", label: "Insights" },
  { key: "closing", label: "Closing" },
  { key: "lead_magnets", label: "Lead Magnets" },
  { key: "final_script", label: "Final Script" },
] as const;

interface Props {
  currentSection: string;
  completedSections: string[];
  onSectionClick: (section: string) => void;
}

export default function ArcProgressBar({ currentSection, completedSections, onSectionClick }: Props) {
  return (
    <div className="flex items-start gap-1.5 mb-6">
      {SECTIONS.map((section, i) => {
        const isCompleted = completedSections.includes(section.key);
        const isCurrent = currentSection === section.key;

        return (
          <div key={section.key} className="flex-1 min-w-0">
            <button
              onClick={() => isCompleted && onSectionClick(section.key)}
              disabled={!isCompleted}
              className="w-full"
              title={isCompleted ? `View ${section.label}` : undefined}
            >
              <div
                className={`h-1.5 rounded-full transition-all ${
                  isCurrent
                    ? "bg-[#6ba3c7]"
                    : isCompleted
                    ? "bg-[#6ba3c7]/50 hover:bg-[#6ba3c7]/70"
                    : "bg-[#111]/10"
                }`}
              />
              <p
                className={`text-[10px] mt-1.5 text-center leading-tight truncate transition-colors ${
                  isCurrent
                    ? "text-[#6ba3c7] font-bold"
                    : isCompleted
                    ? "text-[#6ba3c7]/70 font-medium"
                    : "text-[#2f3437]/25 dark:text-white/25"
                } ${isCompleted ? "cursor-pointer" : "cursor-default"}`}
              >
                {i + 1}. {section.label}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );
}

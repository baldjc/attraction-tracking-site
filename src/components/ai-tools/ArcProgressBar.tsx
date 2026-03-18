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
                    ? "bg-[#3dc3ff]"
                    : isCompleted
                    ? "bg-[#3dc3ff]/50 hover:bg-[#3dc3ff]/70"
                    : "bg-[#1e2a38]/10"
                }`}
              />
              <p
                className={`text-[10px] mt-1.5 text-center leading-tight truncate transition-colors ${
                  isCurrent
                    ? "text-[#3dc3ff] font-bold"
                    : isCompleted
                    ? "text-[#3dc3ff]/70 font-medium"
                    : "text-[#1e2a38]/25"
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

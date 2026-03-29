"use client";

const LABELS = ["YouTube", "About You", "Goals", "Avatar", "Tour"];

export default function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center w-full">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                i < currentStep
                  ? "bg-[#6ba3c7]"
                  : i === currentStep
                  ? "bg-[#6ba3c7] ring-4 ring-[#6ba3c7]/20"
                  : "bg-[#2f3437]/10 dark:bg-white/10"
              }`}
            />
            <span
              className={`hidden sm:block text-[10px] mt-1.5 font-medium transition-colors whitespace-nowrap ${
                i === currentStep
                  ? "text-[#6ba3c7]"
                  : i < currentStep
                  ? "text-[#2f3437]/50 dark:text-white/40"
                  : "text-[#2f3437]/25 dark:text-white/20"
              }`}
            >
              {LABELS[i]}
            </span>
          </div>
          {i < totalSteps - 1 && (
            <div
              className={`h-[2px] flex-1 mx-2 mb-4 transition-colors ${
                i < currentStep ? "bg-[#6ba3c7]" : "bg-[#2f3437]/10 dark:bg-white/10"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

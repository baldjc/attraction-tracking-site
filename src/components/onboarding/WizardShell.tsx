"use client";

import ProgressBar from "./ProgressBar";

interface Props {
  currentStep: number;
  totalSteps: number;
  heading: string;
  subheading?: string;
  onBack?: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
}

export default function WizardShell({ currentStep, totalSteps, heading, subheading, onBack, onSkip, children }: Props) {
  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419] flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-[#2f3437] dark:text-white">{heading}</h1>
            {subheading && (
              <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-2 leading-relaxed">{subheading}</p>
            )}
          </div>
          {children}
        </div>

        <div className="mt-4 px-2 flex justify-between items-center">
          {onBack ? (
            <button
              onClick={onBack}
              className="text-sm text-[#2f3437]/50 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-sm text-[#2f3437]/30 dark:text-white/20 hover:text-[#2f3437]/50 dark:hover:text-white/40 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

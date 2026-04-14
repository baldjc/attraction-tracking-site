"use client";

type AvatarPath = "existing" | "imported" | "build_later";

interface Props {
  avatarPath: AvatarPath;
  onFinish: () => void;
}

export default function StepTour({ avatarPath, onFinish }: Props) {
  return (
    <div className="space-y-5">
      {/* Roadmap */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-[#2f3437] dark:text-[#e2e8f0] mb-1">
          You&apos;re all set — here&apos;s your roadmap
        </h2>
        <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8] mb-6">
          Follow these steps in your first week to get the most out of the platform.
        </p>

        <div className="relative ml-4">
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-[#6ba3c7]/20" />

          {[
            {
              num: 1,
              title: "Complete Your Avatar",
              desc: "Define who you're creating content for so every tool is personalised.",
              time: "~10 min",
              highlight: avatarPath === "build_later",
              highlightNote: "→ You'll do this next",
            },
            {
              num: 2,
              title: "Watch Your First Academy Lesson",
              desc: "Learn the Attraction framework that powers everything on this platform.",
              time: "~15 min",
              highlight: false,
              highlightNote: null,
            },
            {
              num: 3,
              title: "Generate Your First Content Ideas",
              desc: "Use the Content Engine to brainstorm video topics your audience will love.",
              time: "~5 min",
              highlight: false,
              highlightNote: null,
            },
            {
              num: 4,
              title: "Write Your First Script",
              desc: "Turn an idea into a full video script using the ARC method.",
              time: "~10 min",
              highlight: false,
              highlightNote: null,
            },
            {
              num: 5,
              title: "Review & Improve",
              desc: "Score your script against the 14 Attraction principles and refine it.",
              time: "~5 min",
              highlight: false,
              highlightNote: null,
            },
          ].map((step) => (
            <div
              key={step.num}
              className={`relative flex gap-4 pb-6 last:pb-0 ${
                step.highlight ? "bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10 rounded-lg p-3 -ml-1" : ""
              }`}
            >
              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step.highlight
                    ? "bg-[#6ba3c7] text-white"
                    : "bg-white dark:bg-[#1a1a1a] border-2 border-[#6ba3c7]/30 text-[#6ba3c7]"
                }`}
              >
                {step.num}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">
                    {step.title}
                  </span>
                  <span className="text-[10px] text-[#2f3437]/40 dark:text-white/30 font-medium">
                    {step.time}
                  </span>
                </div>
                <p className="text-xs text-[#2f3437]/60 dark:text-[#94a3b8] mt-0.5 leading-relaxed">
                  {step.desc}
                </p>
                {step.highlight && step.highlightNote && (
                  <span className="inline-block mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {step.highlightNote}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kit co-pilot card */}
      <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#6ba3c7] flex items-center justify-center shrink-0">
          <span className="text-xl leading-none">🤖</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#2f3437] dark:text-white">Meet Kit — your co-pilot</p>
          <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-1 leading-relaxed">
            Tap the 🤖 button in the bottom right corner of any page. Ask Kit anything — where to find things, how tools work, or what to do next.
          </p>
        </div>
      </div>

      <button
        onClick={onFinish}
        className="w-full bg-[#6ba3c7] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
      >
        {avatarPath === "build_later" ? "Build My Avatar Now" : "Go to Dashboard"}
      </button>
    </div>
  );
}

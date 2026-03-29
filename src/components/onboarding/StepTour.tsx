"use client";

type AvatarPath = "existing" | "imported" | "build_later";

const FEATURES = [
  {
    emoji: "📚",
    title: "Academy",
    desc: "Your structured learning path. Start with Foundations and work through at your own pace.",
  },
  {
    emoji: "🤖",
    title: "AI Tools",
    desc: "Build scripts, generate content ideas, review your work — all tailored to your avatar.",
  },
  {
    emoji: "📈",
    title: "Generate Leads",
    desc: "Set up tracking links, run campaigns, and see which videos drive real business.",
  },
  {
    emoji: "🎯",
    title: "My Scores",
    desc: "See how your channel stacks up and where to focus next.",
  },
];

interface Props {
  avatarPath: AvatarPath;
  onFinish: () => void;
}

export default function StepTour({ avatarPath, onFinish }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="p-4 border border-[#2f3437]/10 dark:border-white/10 rounded-xl">
            <div className="text-2xl mb-2">{f.emoji}</div>
            <p className="text-sm font-semibold text-[#2f3437] dark:text-white">{f.title}</p>
            <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-1 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#6ba3c7] flex items-center justify-center shrink-0">
          <span className="text-white font-bold italic text-base font-serif">J</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#2f3437] dark:text-white">Meet Jarvis — your platform assistant</p>
          <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-1 leading-relaxed">
            Tap the J button in the bottom right corner of any page. Ask Jarvis anything — where to find things, how tools work, or what to do next.
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

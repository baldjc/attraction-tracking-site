"use client";

import Link from "next/link";
import { CalendarDaysIcon, CheckIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

const TIERS = [
  {
    name: "Production",
    emoji: "🎬",
    tagline: "We edit. You publish.",
    price: "From $500/mo",
    highlight: false,
    features: [
      "Professional editing, graphics, titles, and b-roll",
      "Music and asset licensing",
      "Upload to Frame.io for review",
      "2–3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
    plannerFeatures: [
      "Video table with status tracking",
      "Publish calendar view",
      "Shoot calendar view",
      "Theme-based planning",
    ],
  },
  {
    name: "Growth",
    emoji: "📈",
    tagline: "Editing + strategy + funnels.",
    price: "From $1,995/mo",
    highlight: true,
    badge: "Most Popular",
    features: [
      "Everything in Production, plus:",
      "Full funnel built at launch",
      "Lead magnet strategy and setup",
      "Monthly strategy session with Jared",
      "Content calendar planning",
    ],
    plannerFeatures: [
      "Everything in Production, plus:",
      "Edit due date tracking",
      "Google Drive folder per video",
      "Advanced status workflow",
    ],
  },
  {
    name: "Done With You",
    emoji: "💎",
    tagline: "You film and close deals. We do the rest.",
    price: "From $4,500/mo",
    highlight: false,
    features: [
      "Everything in Growth, plus:",
      "Unlimited video edits",
      "Full YouTube channel management",
      "Thumbnail design and A/B testing",
      "SEO, descriptions, and publishing",
      "Weekly performance reporting",
    ],
    plannerFeatures: [
      "Everything in Growth, plus:",
      "Priority pipeline management",
      "Scripts researched and written for you",
    ],
  },
];

export default function ContentPlannerUpgrade() {
  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-[#6ba3c7]/10 rounded-full mb-4">
          <CalendarDaysIcon className="w-7 h-7 text-[#6ba3c7]" />
        </div>
        <h1 className="text-xl font-bold text-[#2f3437] dark:text-[#e2e8f0] mb-2">
          Content Planner
        </h1>
        <p className="text-sm text-[#2f3437]/60 dark:text-[#94a3b8] max-w-lg mx-auto leading-relaxed mb-3">
          Plan, schedule, and track every video from idea to published. See your shoot calendar,
          publish dates, and status at a glance — so nothing falls through the cracks and your
          channel never misses a week.
        </p>
        <p className="text-xs text-[#2f3437]/40 dark:text-white/30">
          Available on Production, Growth, and Done-With-You plans.
        </p>
      </div>

      {/* Feature Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-4">
          What&apos;s included with the Content Planner
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: "📋", title: "Video Table", desc: "Track every video's title, status, theme, and priority in one view." },
            { icon: "📅", title: "Publish Calendar", desc: "See your publish schedule on a calendar so you never miss a week." },
            { icon: "🎥", title: "Shoot Calendar", desc: "Plan your filming days and keep your pipeline full." },
            { icon: "🎨", title: "By Theme View", desc: "Group your videos by theme to keep your content balanced." },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-4 flex gap-3"
            >
              <span className="text-xl shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">{item.title}</p>
                <p className="text-xs text-[#2f3437]/50 dark:text-[#94a3b8] mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tier Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0] mb-1">
          Choose a plan to unlock the Content Planner
        </h2>
        <p className="text-xs text-[#2f3437]/40 dark:text-white/30 mb-4">
          Each plan adds to your Foundations membership. The Content Planner comes included with all of them.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`bg-white dark:bg-[#1a1a1a] rounded-xl border-2 overflow-hidden flex flex-col ${
                tier.highlight
                  ? "border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/10"
                  : "border-gray-200 dark:border-[#2a2a2a]"
              }`}
            >
              {tier.highlight && tier.badge && (
                <div className="bg-[#8B5CF6] text-white text-[10px] font-bold uppercase tracking-wider text-center py-1.5">
                  {tier.badge}
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{tier.emoji}</span>
                    <h3 className="text-base font-bold text-[#2f3437] dark:text-[#e2e8f0]">{tier.name}</h3>
                  </div>
                  <p className="text-xs text-[#2f3437]/50 dark:text-[#94a3b8]">{tier.tagline}</p>
                  <p className="text-lg font-black text-[#2f3437] dark:text-white mt-2">{tier.price}</p>
                </div>

                <div className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2f3437]/30 dark:text-white/20 mb-2">
                    What you get
                  </p>
                  <ul className="space-y-1.5">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#2f3437]/70 dark:text-[#94a3b8]">
                        <CheckIcon className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mb-5 bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10 rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6ba3c7] mb-2">
                    📅 Content Planner includes
                  </p>
                  <ul className="space-y-1">
                    {tier.plannerFeatures.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[#2f3437]/60 dark:text-[#94a3b8]">
                        <CalendarDaysIcon className="w-3 h-3 text-[#6ba3c7] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto">
                  <Link
                    href="/member/hire"
                    className={`flex items-center justify-center gap-2 w-full text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors ${
                      tier.highlight
                        ? "bg-[#8B5CF6] text-white hover:bg-[#7C3AED]"
                        : "bg-[#2f3437] dark:bg-white text-white dark:text-[#2f3437] hover:bg-[#2f3437]/90 dark:hover:bg-white/90"
                    }`}
                  >
                    View {tier.name} Plan
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center">
        <p className="text-xs text-[#2f3437]/40 dark:text-white/30 mb-3">
          Not sure which plan is right for you? All plans add to your current Foundations membership.
        </p>
        <Link
          href="/member/hire"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#6ba3c7] hover:text-[#5490b5] transition-colors"
        >
          Compare all plans on Hire a Human →
        </Link>
      </div>
    </div>
  );
}

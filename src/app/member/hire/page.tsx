import {
  FilmIcon,
  RocketLaunchIcon,
  SparklesIcon,
  PuzzlePieceIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

// ── Package Data ──────────────────────────────────────────────

interface EditingPackage {
  name: string;
  price: string;
  videos: string;
  hasJared: boolean;
  stripeUrl: string;
  features: string[];
  jaredFeatures?: string[];
}

const EDITING_PACKAGES: EditingPackage[] = [
  {
    name: "2 Video Package",
    price: "$500/mo",
    videos: "2 long-form videos/mo",
    hasJared: false,
    stripeUrl: "https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
  },
  {
    name: "2 Video + Jared",
    price: "$800/mo",
    videos: "2 long-form videos/mo",
    hasJared: true,
    stripeUrl: "https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
    jaredFeatures: [
      "Comprehensive review of shooting, setup, and delivery",
      "Editing suggestions delivered in Frame.io",
      "Ideas for future content improvements",
      "15-minute coaching call",
    ],
  },
  {
    name: "4 Video Package",
    price: "$1,000/mo",
    videos: "4 long-form videos/mo",
    hasJared: false,
    stripeUrl: "https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
  },
  {
    name: "4 Video + Jared",
    price: "$1,500/mo",
    videos: "4 long-form videos/mo",
    hasJared: true,
    stripeUrl: "https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n",
    features: [
      "Professional editing by ABV team",
      "Music and asset licensing",
      "Graphics, titles, and b-roll",
      "Upload to Frame.io for review",
      "2-3 revisions per video",
      "Onboarding call to customise to your brand",
    ],
    jaredFeatures: [
      "Comprehensive review of shooting, setup, and delivery",
      "Editing suggestions delivered in Frame.io",
      "Ideas for future content improvements",
      "15-minute coaching call",
    ],
  },
];

interface MasteryPackage {
  name: string;
  price: string;
  videos: string;
  funnels: string;
  badge?: string;
  stripeUrl: string;
  features: string[];
}

const MASTERY_PACKAGES: MasteryPackage[] = [
  {
    name: "Mastery 2",
    price: "$2,495/mo",
    videos: "2 long-form video edits/mo",
    funnels: "1 full funnel built at launch",
    stripeUrl: "https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q",
    features: [
      "Foundational Membership Benefits included",
      "1 new funnel every 90 days",
      "Custom thumbnails per video",
      "GoHighLevel account (lead capture, follow-up, pipeline)",
      "Title & thumbnail review via Slack (1-1 with Jared)",
      "Priority Slack responses",
      "Every video scored & reviewed",
      "Strategy call with Jared (30 min) — 1/month",
    ],
  },
  {
    name: "Mastery 4",
    price: "$3,495/mo",
    videos: "4 long-form video edits/mo",
    funnels: "2 full funnels built at launch",
    badge: "Most Comprehensive",
    stripeUrl: "https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r",
    features: [
      "Foundational Membership Benefits included",
      "1 new funnel every 90 days",
      "Custom thumbnails per video",
      "GoHighLevel account (lead capture, follow-up, pipeline)",
      "Title & thumbnail review via Slack (1-1 with Jared)",
      "Priority Slack responses",
      "Every video scored & reviewed",
      "Strategy call with Jared (30 min) — 1/month",
    ],
  },
];

interface UltimatePackage {
  name: string;
  price: string;
  badge: string;
  stripeUrl: string;
  highlightFeatures: string[];
  features: string[];
}

const ULTIMATE_PACKAGE: UltimatePackage = {
  name: "Ultimate Mastery",
  price: "$4,999/mo",
  badge: "Full Service",
  stripeUrl: "#", // Stripe link to be added
  highlightFeatures: [
    "4 long-form video edits per month",
    "2 full funnels built at launch",
    "Ready-to-film scripts researched and written for you",
  ],
  features: [
    "Everything in Mastery 4 included",
    "2 lead magnet funnels built per month",
    "Local market research — what's ranking and trending in your city",
    "SEO-optimised descriptions and tags for every video",
    "A/B thumbnail variants per video",
    "Ongoing content calendar management and updates",
    "Strategy session with Jared (60 min) — every 2 weeks",
    "Quarterly 16-principle channel audit with written report",
    "Priority everything — fastest turnaround, same-day responses",
    "Community post and pinned comment strategy written and scheduled",
  ],
};

interface AddOn {
  name: string;
  price: string;
  note?: string;
  description: string;
}

const ADD_ONS: AddOn[] = [
  {
    name: "Custom Thumbnails",
    price: "$100 – $150",
    note: "$100 with an Editing or Mastery package, $150 standalone",
    description: "Professional, click-worthy thumbnails designed for your brand and audience.",
  },
  {
    name: "Lead Magnet Creation",
    price: "~$1,000 USD",
    description: "Buyer guides, relocation guides, market reports, or any PDF built for your market. Includes writing, design, and delivery setup.",
  },
  {
    name: "Rush Funnel",
    price: "$950",
    note: "Available to Mastery members only",
    description: "Need a funnel faster than the 90-day cadence? We'll build it on a priority timeline.",
  },
];

// ── Components ────────────────────────────────────────────────

function EditingCard({ pkg }: { pkg: EditingPackage }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 overflow-hidden flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#2f3437] dark:text-white">{pkg.name}</h3>
          {pkg.hasJared && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              + Jared&apos;s Feedback
            </span>
          )}
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40">{pkg.videos}</p>
        <p className="text-3xl font-extrabold text-[#2f3437] dark:text-white mt-3">
          {pkg.price}
          <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">USD</span>
        </p>
      </div>

      <div className="px-6 pb-4 flex-1">
        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {pkg.jaredFeatures && (
          <div className="mt-4 pt-4 border-t border-[#eaeaea] dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
              Jared&apos;s Feedback Includes
            </p>
            <ul className="space-y-2">
              {pkg.jaredFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
                  <CheckCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-6 pb-6">
        <a
          href={pkg.stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-[#6ba3c7] hover:bg-[#5490b5] text-white font-bold text-sm py-3 rounded-lg transition-colors"
        >
          Get Started
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function MasteryCard({ pkg }: { pkg: MasteryPackage }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border-2 border-slate-200 dark:border-slate-600/40 overflow-hidden flex flex-col relative">
      {pkg.badge && (
        <div className="absolute top-4 right-4">
          <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
            {pkg.badge}
          </span>
        </div>
      )}

      <div className="px-6 pt-6 pb-4">
        <h3 className="text-lg font-bold text-[#2f3437] dark:text-white">{pkg.name}</h3>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">{pkg.videos}</p>
        <p className="text-3xl font-extrabold text-[#2f3437] dark:text-white mt-3">
          {pkg.price}
          <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">USD</span>
        </p>
      </div>

      <div className="mx-6 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/40 mb-4">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Includes everything in Editing, plus:
        </p>
      </div>

      <div className="px-6 pb-4 flex-1">
        <div className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white mb-2">
          <CheckCircleIcon className="w-4 h-4 text-slate-600 dark:text-slate-300 mt-0.5 shrink-0" />
          <span>{pkg.videos}</span>
        </div>
        <div className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white mb-4">
          <CheckCircleIcon className="w-4 h-4 text-slate-600 dark:text-slate-300 mt-0.5 shrink-0" />
          <span>{pkg.funnels}</span>
        </div>

        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-6">
        <a
          href={pkg.stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-sm py-3 rounded-lg transition-colors"
        >
          Get Started
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function UltimateCard({ pkg }: { pkg: UltimatePackage }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border-2 border-purple-200 dark:border-purple-700/40 overflow-hidden flex flex-col relative">
      <div className="absolute top-4 right-4">
        <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-800/40 dark:text-purple-200">
          {pkg.badge}
        </span>
      </div>

      <div className="px-6 pt-6 pb-4">
        <h3 className="text-lg font-bold text-[#2f3437] dark:text-white">{pkg.name}</h3>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-0.5">You show up, film, and close deals. We do everything else.</p>
        <p className="text-3xl font-extrabold text-[#2f3437] dark:text-white mt-3">
          {pkg.price}
          <span className="text-sm font-normal text-[#2f3437]/40 dark:text-white/30 ml-1">USD</span>
        </p>
      </div>

      <div className="mx-6 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30 mb-4">
        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
          Includes everything in Mastery 4, plus:
        </p>
      </div>

      <div className="px-6 pb-4 flex-1">
        {pkg.highlightFeatures.map((f) => (
          <div key={f} className="flex items-start gap-2 text-sm font-medium text-[#2f3437] dark:text-white mb-2">
            <CheckCircleIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
            <span>{f}</span>
          </div>
        ))}

        <div className="mt-2" />

        <ul className="space-y-2">
          {pkg.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-[#2f3437]/70 dark:text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-6">
        <a
          href={pkg.stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white font-bold text-sm py-3 rounded-lg transition-colors"
        >
          Get Started
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

function AddOnCard({ addon }: { addon: AddOn }) {
  return (
    <div className="bg-white dark:bg-[#1a2433] rounded-xl border border-[#eaeaea] dark:border-white/10 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-[#2f3437] dark:text-white mb-1">{addon.name}</h3>
      <p className="text-xl font-extrabold text-[#2f3437] dark:text-white mb-1">{addon.price}</p>
      {addon.note && (
        <p className="text-[11px] text-[#2f3437]/40 dark:text-white/30 mb-2">{addon.note}</p>
      )}
      <p className="text-xs text-[#2f3437]/60 dark:text-white/50 leading-relaxed flex-1">{addon.description}</p>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6ba3c7]">
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
          Message us to get started
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  return (
    <div className="space-y-12 max-w-7xl pb-12">
      {/* Hero */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-[#6ba3c7]/10 rounded-lg">
            <UserGroupIcon className="w-6 h-6 text-[#6ba3c7]" />
          </div>
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">Hire a Human</h1>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mt-2 max-w-2xl">
          You film, we handle the rest. Add editing, coaching, or full implementation support based on how fast you want to grow.
        </p>
      </div>

      {/* ── Editing Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <FilmIcon className="w-5 h-5 text-[#6ba3c7]" />
          <h2 className="text-xl font-bold text-[#2f3437] dark:text-white">Attraction Editing</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">
          Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EDITING_PACKAGES.map((pkg) => (
            <EditingCard key={pkg.name} pkg={pkg} />
          ))}
        </div>
      </section>

      {/* ── Mastery Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <RocketLaunchIcon className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          <h2 className="text-xl font-bold text-[#2f3437] dark:text-white">Attraction Mastery</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">
          The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MASTERY_PACKAGES.map((pkg) => (
            <MasteryCard key={pkg.name} pkg={pkg} />
          ))}
        </div>
      </section>

      {/* ── Ultimate Mastery Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <SparklesIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-bold text-[#2f3437] dark:text-white">Ultimate Mastery</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-6 max-w-2xl">
          You show up, film, and close deals. We do literally everything else.
        </p>
        <div className="max-w-xl">
          <UltimateCard pkg={ULTIMATE_PACKAGE} />
        </div>
      </section>

      {/* ── Add-Ons Section ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <PuzzlePieceIcon className="w-5 h-5 text-[#2f3437]/40 dark:text-white/40" />
          <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Add-Ons</h2>
        </div>
        <p className="text-sm text-[#2f3437]/50 dark:text-white/40 mb-5">
          Available extras to complement your package.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ADD_ONS.map((a) => (
            <AddOnCard key={a.name} addon={a} />
          ))}
        </div>
      </section>
    </div>
  );
}

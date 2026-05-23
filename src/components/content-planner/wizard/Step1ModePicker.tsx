/**
 * Wave 2 wizard — Step 1: Mode picker.
 *
 * Three co-equal entry modes (NOT a sequential funnel):
 *   - Browse Story Leads   → ?step=2a
 *   - Validate an idea     → ?step=2b  (hidden when tool_idea_validation OFF)
 *   - Pick a rotation slot → ?step=2c
 */
import Link from "next/link";

interface Props {
  showIdeaValidation: boolean;
}

export function Step1ModePicker({ showIdeaValidation }: Props) {
  return (
    <div>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Pick how you want to start. You can come back to switch modes at any time.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModeCard
          href="/member/content-planner/wizard?step=2a"
          icon="📍"
          title="Browse Story Leads"
          description="Start from a data pattern we already found in your latest upload (e.g. a neighbourhood that's tightened sharply, or an outlier on price/inventory)."
          cta="Browse leads"
        />
        {showIdeaValidation && (
          <ModeCard
            href="/member/content-planner/wizard?step=2b"
            icon="🧪"
            title="Validate an idea"
            description="Already have a video idea in mind? We'll check it against your validated facts library and tell you if it holds up, needs sharpening, or doesn't."
            cta="Type my idea"
          />
        )}
        <ModeCard
          href="/member/content-planner/wizard?step=2c"
          icon="🎯"
          title="Pick a rotation slot"
          description="Choose the type of video you want to make (Market Update, Neighbourhood Fact, Do Not, Should You, Contrarian Take) and we'll generate 5 ideas in that slot."
          cta="Pick a slot"
        />
      </div>
    </div>
  );
}

function ModeCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
    >
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
      <span className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300">
        {cta} →
      </span>
    </Link>
  );
}

import Link from "next/link";

interface Props {
  hasColumnMapping: boolean;
  hasStatusMapping: boolean;
}

interface LayerRow {
  n: number;
  title: string;
  body: React.ReactNode;
  status: { label: string; done: boolean };
  cta?: { href: string; label: string };
}

/**
 * Task #66 — "Market Data Setup" overview. Surfaces the three mapping layers a
 * member's MLS export goes through so the configuration is discoverable in one
 * place, and links Layer 3 to the existing Knowledge Base cleanup surface.
 *
 * Layers 1 & 2 are configured inline in the upload flow (status values are
 * confirmed when a NEW one appears; columns via "Edit column mapping" on the
 * upload panel), so this card explains + reports state rather than duplicating
 * those editors.
 */
export default function MarketSetupCard({
  hasColumnMapping,
  hasStatusMapping,
}: Props) {
  const layers: LayerRow[] = [
    {
      n: 1,
      title: "Status values",
      body: (
        <>
          We read your MLS&apos;s status labels (sold, active, pending,
          off-market) automatically. When a new label shows up, we&apos;ll ask
          you to confirm what it means during upload, then remember it.
        </>
      ),
      status: hasStatusMapping
        ? { label: "Custom mapping saved", done: true }
        : { label: "Using auto-detected defaults", done: true },
    },
    {
      n: 2,
      title: "Column mapping",
      body: (
        <>
          Tells us which of your columns are price, sold date, neighbourhood,
          square footage, and so on. Edit it any time from{" "}
          <span className="font-medium">&ldquo;Edit column mapping&rdquo;</span>{" "}
          on the upload panel below.
        </>
      ),
      status: hasColumnMapping
        ? { label: "Saved", done: true }
        : { label: "Not set up yet", done: false },
    },
    {
      n: 3,
      title: "Neighbourhoods",
      body: (
        <>
          MLS exports often shatter one neighbourhood across dozens of
          subdivision names. Collapse the fragments into single areas so more
          areas clear the sample floor for scripts.
        </>
      ),
      status: { label: "Manage in Knowledge Base", done: true },
      cta: { href: "/member/knowledge-base", label: "Open Knowledge Base →" },
    },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        Market data setup
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Three quick layers let us read any MLS board&apos;s export correctly.
      </p>

      <ol className="mt-4 space-y-3">
        {layers.map((l) => (
          <li
            key={l.n}
            className="flex gap-3 rounded-md border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--abv-ink)] text-sm font-semibold text-white">
              {l.n}
            </span>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {l.title}
                </span>
                <span
                  className={`text-xs ${
                    l.status.done
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {l.status.done ? "✓ " : "• "}
                  {l.status.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {l.body}
              </p>
              {l.cta && (
                <Link
                  href={l.cta.href}
                  className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {l.cta.label}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

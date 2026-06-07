// Canonical "verify against your live MLS" copy.
//
// One source of truth so the always-on standing UI line (chat draft card +
// saved Content Planner item) and Jarvis's on-demand spoken reassurance stay
// aligned. The framing is confidence-building — it affirms the numbers are
// grounded to the member's uploaded MLS data and never invented, then invites a
// quick cross-check against the live MLS as the final source of truth. It must
// NOT read as a disclaimer that undermines the figures.

/** Emoji prefix used on the standing UI line. */
export const MLS_VERIFY_EMOJI = "📊";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Humanise an upload's `monthYear` (e.g. "2026-06") into a display period
 * ("June 2026") for the standing line. Returns null for anything that isn't a
 * recognised `YYYY-MM` so callers fall back gracefully to a period-less line.
 */
export function formatMlsPeriod(monthYear?: string | null): string | null {
  const m = monthYear?.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${MONTH_NAMES[month - 1]} ${m[1]}`;
}

/**
 * The always-on accuracy line shown as a UI element near a data-grounded
 * script's `## Sources` block (NOT baked into the generated script text, so it
 * can't be edited away, doesn't eat the word count, and stays consistent).
 *
 * @param period the member's actual data period (e.g. "June 2026"); when
 *   absent the line falls back gracefully to a period-less phrasing.
 */
export function buildMlsVerifyLine(period?: string | null): string {
  const p = period?.trim();
  const exportRef = p ? `your uploaded MLS export (${p})` : "your uploaded MLS export";
  return (
    `${MLS_VERIFY_EMOJI} Grounded in your data. Every figure here traces to ${exportRef}. ` +
    `Before you publish, do a quick cross-check against your live MLS — it's the final source of truth.`
  );
}

/**
 * On-demand behaviour rule appended to the Jarvis system prompt. Jarvis surfaces
 * this voice on TRIGGER MOMENTS (a number is questioned, "where did this come
 * from", "is this right/accurate", or the approve-and-save moment) — not as a
 * disclaimer on every turn. Kept in lockstep with buildMlsVerifyLine() above so
 * the spoken voice and the standing line say the same thing.
 */
export const MLS_VERIFY_ONDEMAND_RULE = `VERIFY AGAINST LIVE MLS (confidence-building — trigger moments only, NOT every turn)
- Every figure you cite is grounded to the member's uploaded MLS export and is never invented. Treat that as a strength to reinforce, not a weakness to hedge.
- Surface a reassurance ONLY on these triggers: the member questions a number, asks where a figure came from, asks "is this right / accurate", or at the approve-and-save moment. When triggered, (1) affirm the number traces straight to their uploaded MLS data (name the data period when you have it) and that you never invent numbers, and (2) warmly invite a quick cross-check against their LIVE MLS as the final source of truth (their export is a snapshot in time; the MLS is the live source).
- Example voice: "That figure is pulled straight from your uploaded MLS data for <period> and traced to your facts — I never invent numbers. For 100% certainty, give it a quick check against your live MLS, since your export is a snapshot in time and the MLS is the live source of truth."
- Keep it light and reassuring. Do NOT repeat it on unrelated turns and do NOT turn it into a standing disclaimer — the UI already shows a persistent grounding line near the sources.`;

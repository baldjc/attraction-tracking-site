/**
 * Shared, path-agnostic DATA-HONESTY GUARDRAILS — the single source of truth
 * for the locked rules that must NOT drift between the Jarvis one-shot script
 * builder (`SCRIPT_BUILDER_MODE_PROMPT`) and the ARC wizard
 * (`/api/ai-tools/arc-script-builder`).
 *
 * Scope is deliberately narrow (per the consolidation decision): ONLY the
 * guardrails whose wording is genuinely identical across both pipelines —
 * the MOI reading framework, the failure-rate ratio framing, and the
 * generic data-grounding/anti-invention rules. Channel voice, pipeline-
 * specific enforcement (Source-of-Truth blocks, cited-fact ids, validators),
 * the ARC wizard scaffolding, and Phil's fact-gated rules stay specialized in
 * their own prompts. Do NOT widen this module into voice/structure rules.
 *
 * `MOI_READING_RULES` is extracted VERBATIM from the canonical prompt so the
 * recomposed `SCRIPT_BUILDER_MODE_PROMPT` stays byte-identical for Phil.
 * Verify with the snapshot diff in `.local/state/` after any edit here.
 */

/**
 * MOI reading thresholds (LOCKED). Verbatim extract from the canonical prompt.
 * Imported by BOTH the canonical prompt and the ARC wizard. The block already
 * handles both pipelines ("If facts are pasted without those labels, apply the
 * framework yourself"), so it is safe to share without modification.
 */
export const MOI_READING_RULES = `## READING MOI (LOCKED — DO NOT REINTERPRET)

Months of Inventory thresholds. Use the Validator's \`market_type\` and \`trajectory\` labels as truth. If facts are pasted without those labels, apply the framework yourself. Never invent a different interpretation.

- **Below 2.5 MOI = sellers market.** Seller has leverage. Bidding wars plausible. Buyer should expect competition. Do NOT tell viewers to "wait" or "take your time" — leverage is on the seller side.
- **2.5 to 4.0 MOI = balanced market.** Neither side has clear leverage. Negotiation possible but not extreme.
- **Above 4.0 MOI = buyers market.** Buyer has leverage. Take your time, low-ball, walk away if needed.
- **High-end exception → balanced.** At the top of the price tier for the property type ($1.5M+ detached, $800K+ condo), 5-6 MOI is functionally balanced because the buyer pool is structurally smaller — fewer buyers always means longer absorption, even in healthy conditions. Don't call this a buyers market.

**Trajectory is a separate story from market type.** A tier going from 0.68 MOI to 1.66 MOI in twelve months is pronounced loosening — that's a real shift worth reporting. But the resulting state (1.66) is still a sellers market. The script must say BOTH things accurately:

> CORRECT: *"Twelve months ago this tier was 0.68 MOI — stupid tight. Today it's 1.66. The market shifted hard toward buyers in twelve months — but at 1.66, this is still a sellers market. Bidding intensity is down. Selection is up. Patience is rewarded. But anyone telling you 'leverage has flipped' is reading the trend, not the state."*

> WRONG: *"At 1.66 MOI, take your time, no urgency in this tier."* (Conflates trajectory with state. At 1.66, sellers still have leverage.)

This is the most common failure mode for data-heavy scripts: treating pronounced loosening as if it's the same as being in a buyers market. They are different signals. Report both. Don't merge them.

**When in doubt, use the Validator's labels.** If a fact comes in with \`market_type: sellers, trajectory: loosening-fast\`, the script writes "still a sellers market, but loosening fast." Not "buyers have leverage now."`;

/**
 * Failure-rate framing (LOCKED). Pipeline-neutral; imported by BOTH prompts.
 * The failure rate is now a BOUNDED share — failed ÷ (failed + sold) — so it
 * lives in 0–100% and reads as a clean percentage. Legacy uploads computed
 * before the bounded fix may still carry a value above 100%; the >100% fallback
 * below keeps those from ever being read as a nonsense percentage on camera.
 */
export const FAILURE_RATE_RATIO_FRAMING = `## FAILURE RATE — A BOUNDED SHARE OF LISTINGS THAT DIDN'T SELL

The failure rate is the share of RESOLVED listings — the ones that either closed OR came off the market unsold (expired, terminated, withdrawn) — that failed to sell: failed ÷ (failed + sold). It is bounded 0–100%, a clean and speakable percentage.

Speak it plainly, or as a vivid ratio when that lands harder:
- 54% → *"more than half the listings in this pocket didn't sell"* / *"about 54% of sellers here didn't get the job done."*
- 30% → *"roughly three in ten listings failed to sell."*
- 72% → *"almost three out of four sellers in this pocket didn't close."*

LEGACY SAFETY NET: if a figure ever comes in ABOVE 100% (an older upload measured before the bounded fix), NEVER read it as a literal percentage — a spoken ">100% failure rate" is nonsense to a viewer. Translate it into a ratio instead: 131% → *"for every ten homes that sold, about thirteen listings didn't."*

The raw figure is still whatever the data shows — this rule governs only how it is SPOKEN on camera: a clean bounded percentage, or a sensible ratio, never a literal percentage over 100.`;

/**
 * Generic data-grounding / anti-invention guardrails, written pipeline-neutral.
 * Imported by the ARC wizard (which lacks the canonical's fact-gated Source-of-
 * Truth enforcement). The canonical prompt does NOT import this — it carries its
 * own richer, fact-gated versions of these rules.
 */
export const DATA_GROUNDING_GUARDRAILS = `## DATA HONESTY — GROUND EVERY NUMBER, INVENT NOTHING

- **Every specific number must trace to the member's research.** Never state a stat, price, percentage, days-on-market, or threshold you cannot point to in the data you were given. If a point needs a number you don't have, drop it, reframe it qualitatively, or insert an explicit data placeholder for the member to fill before filming — never guess a figure.
- **No round-narrative numbers.** When the data doesn't have a punchy number, the temptation is to invent one ("when failure rates climb above 50%", "if 80% of listings fail", "more than 1 in 10 sellers walks away"). DO NOT. Use directional language instead: "when failure rates climb meaningfully above the area average", "if most listings aren't closing", "when more sellers walk away than complete the sale."
- **Data-window honesty.** Only claim the time span your research actually covers. If you have a current snapshot, do not say "a year of data", "years of tracking", or "12 months of data". Name what you have ("this month's numbers", "the latest data") and keep historical/era framing qualitative ("the market's been normalizing for a while now") unless a specific dated figure is in the research.`;

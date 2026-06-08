// Per-member metric methodology settings — "How we calculate your stats".
//
// PURE module (no prisma) — safe to import from Client Components and from the
// client-safe `market-config.ts`. The DB load/save accessors live in
// `member-metric-settings-server.ts`.
//
// Source of truth for the five variant choices a member can make about how
// their derived market metrics are computed, the three named presets, and the
// sample-size thresholds each variant compiles to.
//
// CRITICAL: the Default preset MUST equal the behaviour shipping before this
// feature existed, so a member who never opens the panel sees identical output.

// ── Variant unions ──────────────────────────────────────────────────────────

export type MoiVariant =
  | "active_plus_pending_single"
  | "active_only_single"
  | "active_plus_pending_rolling3";

export type DomVariant = "average" | "median" | "both";

export type FailureRateVariant =
  | "all_off_market"
  | "expired_only"
  | "expired_plus_withdrawn"
  | "disabled";

export type SalePriceVariant = "median" | "average" | "benchmark";

export type SampleSizeVariant = "conservative" | "permissive" | "strict";

export interface MemberMethodologySettings {
  moiVariant: MoiVariant;
  domVariant: DomVariant;
  failureRateVariant: FailureRateVariant;
  salePriceVariant: SalePriceVariant;
  sampleSizeVariant: SampleSizeVariant;
}

// ── Allowed-value sets (single source of truth for validation) ──────────────

export const MOI_VARIANTS: readonly MoiVariant[] = [
  "active_plus_pending_single",
  "active_only_single",
  "active_plus_pending_rolling3",
];
export const DOM_VARIANTS: readonly DomVariant[] = ["average", "median", "both"];
export const FAILURE_RATE_VARIANTS: readonly FailureRateVariant[] = [
  "all_off_market",
  "expired_only",
  "expired_plus_withdrawn",
  "disabled",
];
export const SALE_PRICE_VARIANTS: readonly SalePriceVariant[] = [
  "median",
  "average",
  "benchmark",
];
export const SAMPLE_SIZE_VARIANTS: readonly SampleSizeVariant[] = [
  "conservative",
  "permissive",
  "strict",
];

// ── Presets ─────────────────────────────────────────────────────────────────

/**
 * The Default preset. MUST match the pre-feature behaviour exactly:
 *   - MOI: (Active + Pending) ÷ single-month Sold  (moiInclusive — the prior
 *     citation default for the canonical market view).
 *   - DOM: average.
 *   - Failure rate: all off-market (Expired + Terminated + Withdrawn) ÷ Sold.
 *   - Sale price: median.
 *   - Sample floor: conservative (5 sold + 3 off-market), matching
 *     MIN_SOLD_SAMPLE / MIN_OFF_MARKET_SAMPLE in market-status-buckets.ts.
 */
export const DEFAULT_METHODOLOGY: MemberMethodologySettings = {
  moiVariant: "active_plus_pending_single",
  domVariant: "average",
  failureRateVariant: "all_off_market",
  salePriceVariant: "median",
  sampleSizeVariant: "conservative",
};

export const STRICT_METHODOLOGY: MemberMethodologySettings = {
  moiVariant: "active_only_single",
  domVariant: "median",
  failureRateVariant: "expired_only",
  salePriceVariant: "median",
  sampleSizeVariant: "strict",
};

export const SMOOTHED_METHODOLOGY: MemberMethodologySettings = {
  moiVariant: "active_plus_pending_rolling3",
  domVariant: "median",
  failureRateVariant: "expired_plus_withdrawn",
  salePriceVariant: "average",
  sampleSizeVariant: "conservative",
};

export type PresetName = "default" | "strict" | "smoothed" | "custom";

export const PRESETS: Record<
  Exclude<PresetName, "custom">,
  MemberMethodologySettings
> = {
  default: DEFAULT_METHODOLOGY,
  strict: STRICT_METHODOLOGY,
  smoothed: SMOOTHED_METHODOLOGY,
};

/** Return the named preset that exactly matches `s`, or "custom" if none do. */
export function detectPreset(s: MemberMethodologySettings): PresetName {
  for (const name of ["default", "strict", "smoothed"] as const) {
    if (settingsEqual(s, PRESETS[name])) return name;
  }
  return "custom";
}

export function settingsEqual(
  a: MemberMethodologySettings,
  b: MemberMethodologySettings,
): boolean {
  return (
    a.moiVariant === b.moiVariant &&
    a.domVariant === b.domVariant &&
    a.failureRateVariant === b.failureRateVariant &&
    a.salePriceVariant === b.salePriceVariant &&
    a.sampleSizeVariant === b.sampleSizeVariant
  );
}

// ── Sample-size thresholds ──────────────────────────────────────────────────

export interface SampleFloor {
  /** Minimum closed sales before a metric is citable for a neighbourhood. */
  sold: number;
  /** Minimum off-market listings before a failure/sale-share metric is citable. */
  offMarket: number;
}

/**
 * Each sample-size variant compiles to a (sold, off-market) floor pair.
 * Conservative MUST equal MIN_SOLD_SAMPLE (5) + MIN_OFF_MARKET_SAMPLE (3) in
 * market-status-buckets.ts so the Default preset reproduces today's gating.
 */
export const SAMPLE_FLOORS: Record<SampleSizeVariant, SampleFloor> = {
  conservative: { sold: 5, offMarket: 3 },
  permissive: { sold: 3, offMarket: 2 },
  strict: { sold: 10, offMarket: 5 },
};

export function sampleFloorFor(variant: SampleSizeVariant): SampleFloor {
  return SAMPLE_FLOORS[variant] ?? SAMPLE_FLOORS.conservative;
}

/**
 * Minimum closed sales before a neighbourhood figure may be a *headline* claim.
 *
 * Lowered 30 → 15: thin-but-real samples are no longer silently benched to
 * texture-only. A figure at/above this floor headlines normally; a figure
 * between the per-member hard sample floor (sampleFloorFor().sold, default 5)
 * and this floor stays USABLE but only WITH an explicit "based on N sales"
 * disclosure baked into the claim; below the hard floor it is too thin to
 * headline at all (texture/colour only, never fabricated).
 *
 * Single tunable source of truth — applied in computeCut.ts and the fact
 * validator. May later be promoted to an admin setting.
 */
export const HEADLINE_SOLD_FLOOR = 15;

/** Honesty band a neighbourhood figure falls into, by closed-sale count. */
export type SampleBand = "headline" | "disclose" | "thin";

/**
 * Classify a closed-sale count into one of the three honesty bands.
 *  - >= headlineFloor          → "headline" (may anchor a video)
 *  - hardMin .. headlineFloor-1 → "disclose" (usable WITH sample disclosure)
 *  - < hardMin                  → "thin" (texture/colour only, never headline)
 */
export function sampleBandFor(
  soldCount: number,
  headlineFloor: number,
  hardMin: number,
): SampleBand {
  if (soldCount >= headlineFloor) return "headline";
  if (soldCount >= hardMin) return "disclose";
  return "thin";
}

// ── Validation ──────────────────────────────────────────────────────────────

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Coerce any untrusted object (request body, persisted JSON snapshot, DB row)
 * into a valid MemberMethodologySettings, filling unknown/invalid fields from
 * the Default preset. Never throws — mirrors the "validate at every entry point"
 * discipline used for columnMapping / statusMapping.
 */
export function normalizeMethodologySettings(
  input: unknown,
): MemberMethodologySettings {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  return {
    moiVariant: oneOf(src.moiVariant, MOI_VARIANTS, DEFAULT_METHODOLOGY.moiVariant),
    domVariant: oneOf(src.domVariant, DOM_VARIANTS, DEFAULT_METHODOLOGY.domVariant),
    failureRateVariant: oneOf(
      src.failureRateVariant,
      FAILURE_RATE_VARIANTS,
      DEFAULT_METHODOLOGY.failureRateVariant,
    ),
    salePriceVariant: oneOf(
      src.salePriceVariant,
      SALE_PRICE_VARIANTS,
      DEFAULT_METHODOLOGY.salePriceVariant,
    ),
    sampleSizeVariant: oneOf(
      src.sampleSizeVariant,
      SAMPLE_SIZE_VARIANTS,
      DEFAULT_METHODOLOGY.sampleSizeVariant,
    ),
  };
}

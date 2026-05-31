// Pure types + constants — safe to import from Client Components. Anything
// that needs prisma, next/headers, or session resolution lives in
// `market-config-server.ts` to keep the client bundle clean.

export const CANONICAL_FIELDS = [
  "date",
  "neighbourhood",
  "salePrice",
  "listPrice",
  "daysOnMarket",
  "sqft",
  "propertyType",
] as const;

export const OPTIONAL_FIELDS = [
  "bedrooms",
  "bathrooms",
  "yearBuilt",
  "mlsNumber",
  "status",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export type OptionalField = (typeof OPTIONAL_FIELDS)[number];
export type AnyMappedField = CanonicalField | OptionalField;

export type ColumnMapping = Partial<Record<AnyMappedField, string>>;

export const FIELD_LABELS: Record<AnyMappedField, string> = {
  date: "Date sold",
  neighbourhood: "Neighbourhood / Community",
  salePrice: "Sale price",
  listPrice: "List price",
  daysOnMarket: "Days on market",
  sqft: "Square footage",
  propertyType: "Property type",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  yearBuilt: "Year built",
  mlsNumber: "MLS #",
  status: "Status",
};

export interface PriceTier {
  name: string;
  maxPrice: number | null;
}

export interface MoiThresholds {
  sellers: number;
  buyers: number;
}

export interface HighEndException {
  enabled: boolean;
  priceThreshold: number;
  propertyTypes: string[];
}

/**
 * One MLS status-code label and how the validator should treat it. `canonical`
 * drives the headline-metric numerator / inventory / failure-rate maths;
 * `note` is a one-line treatment description rendered into the prompt's
 * CSV STATUS CODES block.
 */
export interface StatusCode {
  label: string;
  canonical:
    | "active"
    | "pending"
    | "sold"
    | "expired"
    | "terminated"
    | "withdrawn"
    | "other";
  note?: string;
}

/** Board property-type vocabulary + an optional aggregation merge rule. */
export interface PropertyTypeVocab {
  types: string[];
  /** e.g. "Roll Full Duplex records into Semi-Detached for all aggregations." */
  mergeRule?: string;
}

/**
 * MOI floors above which the "balanced (high-end)" exception applies, per
 * property class. At these price points the buyer pool is structurally
 * smaller so a higher MOI is functionally balanced, not a buyers market.
 */
export interface MoiHighEndExceptionFloor {
  detached: number;
  condo: number;
}

export interface KeywordKit {
  pillars?: string[];
  longTail?: string[];
  notes?: string;
}

/**
 * Point-in-time snapshot of the Avatar Architect output. Avatar Architect
 * stays canonical on the User row (`avatarProfile`, `avatarName`,
 * `avatarSummary`); MarketConfig only stores a copy so the Wave 1 → Wave 2/3
 * pipelines have a stable shape, not a parallel editable source of truth.
 *
 * Empty snapshot = `snappedAt === ""`. Use `hasAvatarSnapshot()` to check.
 */
export interface PrimaryAvatar {
  source: "avatar-architect" | "manual";
  /** ISO timestamp of when the snapshot was taken. "" = no snapshot yet. */
  snappedAt: string;
  name: string | null;
  summary: string | null;
  profile: Record<string, unknown> | null;
}

/** Legacy shape (pre Wave-1 follow-up): freeform `{ description }`. */
interface LegacyPrimaryAvatar {
  description?: string;
}

export function emptyPrimaryAvatar(): PrimaryAvatar {
  return {
    source: "avatar-architect",
    snappedAt: "",
    name: null,
    summary: null,
    profile: null,
  };
}

export function hasAvatarSnapshot(avatar: PrimaryAvatar | null | undefined): boolean {
  return !!(avatar && avatar.snappedAt && avatar.snappedAt.length > 0);
}

/**
 * Normalise whatever sits in MarketConfig.primaryAvatar JSON into the
 * current PrimaryAvatar shape. Handles three cases:
 *   - new shape: pass through (with type guards)
 *   - legacy `{ description }`: treat as a manual snapshot, summary = description
 *   - null/empty/unknown: return empty snapshot
 *
 * `fallbackSnappedAt` is used when converting the legacy shape so the snapshot
 * carries a real timestamp (use MarketConfig.configuredAt).
 */
export function normalizePrimaryAvatar(
  raw: unknown,
  fallbackSnappedAt: string,
): PrimaryAvatar {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // New shape
    if (typeof obj.snappedAt === "string" && typeof obj.source === "string") {
      const source: "avatar-architect" | "manual" =
        obj.source === "manual" ? "manual" : "avatar-architect";
      return {
        source,
        snappedAt: obj.snappedAt,
        name: typeof obj.name === "string" ? obj.name : null,
        summary: typeof obj.summary === "string" ? obj.summary : null,
        profile:
          obj.profile && typeof obj.profile === "object"
            ? (obj.profile as Record<string, unknown>)
            : null,
      };
    }
    // Legacy `{ description }` shape — only treat as a snapshot if there's actual text
    const legacy = obj as LegacyPrimaryAvatar;
    if (typeof legacy.description === "string" && legacy.description.trim().length > 0) {
      return {
        source: "manual",
        snappedAt: fallbackSnappedAt,
        name: null,
        summary: legacy.description,
        profile: null,
      };
    }
  }
  return emptyPrimaryAvatar();
}

export interface SubPersona {
  id: string;
  label: string;
  enabled: boolean;
}

export const DEFAULT_PRICE_TIERS: PriceTier[] = [
  { name: "Entry", maxPrice: 500_000 },
  { name: "Mid", maxPrice: 800_000 },
  { name: "Upper", maxPrice: 1_500_000 },
  { name: "Luxury", maxPrice: null },
];

export const DEFAULT_MOI_THRESHOLDS: MoiThresholds = {
  sellers: 2.5,
  buyers: 4.0,
};

export const DEFAULT_HIGH_END_EXCEPTION: HighEndException = {
  enabled: false,
  priceThreshold: 1_500_000,
  propertyTypes: ["detached"],
};

export const DEFAULT_MOI_HIGH_END_EXCEPTION_FLOOR: MoiHighEndExceptionFloor = {
  detached: 1_500_000,
  condo: 800_000,
};

// Canonical status-code treatment notes — shared across boards so the per-source
// seeds below only need to vary the raw label strings. The validator uses
// `canonical` for the maths; these notes render into the prompt's STATUS CODES
// block for human-readable treatment.
const STATUS_NOTE: Record<StatusCode["canonical"], string> = {
  active: "On-market, unsold inventory. Numerator for strict MOI.",
  pending:
    "Under contract, not yet closed. Counts toward INCLUSIVE MOI only, never the sold denominator.",
  sold: "Closed transaction. The denominator for absorption and the basis for ALL price / PSF / DOM medians.",
  expired: "Listing period ended unsold. Counts toward failure rate.",
  terminated:
    "Listing agreement ended early by agreement. Counts toward failure rate.",
  withdrawn:
    "Temporarily removed from market. Counts toward failure rate, not sold.",
  other: "Treated as non-sold; excluded from absorption and median maths.",
};

const sc = (label: string, canonical: StatusCode["canonical"]): StatusCode => ({
  label,
  canonical,
  note: STATUS_NOTE[canonical],
});

/**
 * Per-MLS-source seed defaults. These replace the previously hardcoded Calgary /
 * CREB knowledge in the Fact Validator prompt. A MarketConfig row whose new
 * fields are null falls back to the entry matched on `mlsSource` (see
 * resolveMarketDefaults); unknown sources fall back to GENERIC_MARKET_DEFAULTS.
 */
export interface MarketSourceDefaults {
  sourceAuthority: string;
  statusCodes: StatusCode[];
  propertyTypeVocab: PropertyTypeVocab;
  priceTiers: PriceTier[];
  moiThresholds: MoiThresholds;
  highEndException: HighEndException;
  moiHighEndExceptionFloor: MoiHighEndExceptionFloor;
}

export const GENERIC_MARKET_DEFAULTS: MarketSourceDefaults = {
  sourceAuthority: "the local MLS / real-estate board",
  statusCodes: [
    sc("Active", "active"),
    sc("Pending", "pending"),
    sc("Sold", "sold"),
    sc("Expired", "expired"),
    sc("Terminated", "terminated"),
    sc("Withdrawn", "withdrawn"),
  ],
  propertyTypeVocab: {
    types: ["Detached", "Semi-Detached", "Row/Townhouse", "Apartment", "Duplex"],
    mergeRule:
      "Group attached forms (Semi-Detached, Row/Townhouse, Duplex) into the attached family; Detached stands alone; Apartment/Condo is its own family.",
  },
  priceTiers: DEFAULT_PRICE_TIERS,
  moiThresholds: DEFAULT_MOI_THRESHOLDS,
  highEndException: DEFAULT_HIGH_END_EXCEPTION,
  moiHighEndExceptionFloor: DEFAULT_MOI_HIGH_END_EXCEPTION_FLOOR,
};

export const MARKET_SOURCE_DEFAULTS: Record<string, MarketSourceDefaults> = {
  // Calgary Real Estate Board (data system: Pillar 9). Preserves the original
  // hardcoded prompt knowledge so Calgary uploads see no regression.
  CREB: {
    sourceAuthority: "CREB",
    statusCodes: [
      sc("Active", "active"),
      sc("Pending", "pending"),
      sc("Sold", "sold"),
      sc("Expired", "expired"),
      sc("Terminated", "terminated"),
      sc("Withdrawn", "withdrawn"),
    ],
    propertyTypeVocab: {
      types: [
        "Detached",
        "Semi-Detached",
        "Row/Townhouse",
        "Apartment",
        "Full Duplex",
      ],
      mergeRule:
        "Roll Full Duplex records into Semi-Detached for all aggregations. Detached stands alone; Row/Townhouse + Semi-Detached + Full Duplex are the attached family; Apartment is the condo family.",
    },
    priceTiers: [
      { name: "Entry", maxPrice: 500_000 },
      { name: "Mid", maxPrice: 800_000 },
      { name: "Upper", maxPrice: 1_500_000 },
      { name: "Luxury", maxPrice: null },
    ],
    moiThresholds: { sellers: 2.5, buyers: 4.0 },
    highEndException: {
      enabled: true,
      priceThreshold: 1_500_000,
      propertyTypes: ["detached"],
    },
    moiHighEndExceptionFloor: { detached: 1_500_000, condo: 800_000 },
  },
  // North Texas Real Estate Information Systems (Dallas–Fort Worth).
  NTREIS: {
    sourceAuthority: "NTREIS",
    statusCodes: [
      sc("Active", "active"),
      sc("Active Option Contract", "pending"),
      sc("Active Contingent", "pending"),
      sc("Pending", "pending"),
      sc("Closed", "sold"),
      sc("Expired", "expired"),
      sc("Cancelled", "terminated"),
      sc("Withdrawn", "withdrawn"),
    ],
    propertyTypeVocab: {
      types: [
        "Single Family",
        "Townhouse",
        "Condominium",
        "Half Duplex",
        "Farm/Ranch",
      ],
      mergeRule:
        "Single Family is detached; Townhouse + Half Duplex are the attached family; Condominium is the condo family; treat Farm/Ranch as its own low-volume class.",
    },
    priceTiers: [
      { name: "Entry", maxPrice: 300_000 },
      { name: "Mid", maxPrice: 500_000 },
      { name: "Upper", maxPrice: 800_000 },
      { name: "Luxury", maxPrice: null },
    ],
    moiThresholds: { sellers: 4.0, buyers: 6.0 },
    highEndException: {
      enabled: true,
      priceThreshold: 1_000_000,
      propertyTypes: ["detached"],
    },
    moiHighEndExceptionFloor: { detached: 1_000_000, condo: 600_000 },
  },
  // Bright MLS (Mid-Atlantic: DC, MD, VA, PA, NJ, DE, WV).
  BRIGHT: {
    sourceAuthority: "Bright MLS",
    statusCodes: [
      sc("Active", "active"),
      sc("Active Under Contract", "pending"),
      sc("Pending", "pending"),
      sc("Closed", "sold"),
      sc("Expired", "expired"),
      sc("Canceled", "terminated"),
      sc("Withdrawn", "withdrawn"),
    ],
    propertyTypeVocab: {
      types: [
        "Detached",
        "Twin/Semi-Detached",
        "Interior Row/Townhouse",
        "Unit/Flat/Apartment",
      ],
      mergeRule:
        "Detached stands alone; Twin/Semi-Detached + Interior Row/Townhouse are the attached family; Unit/Flat/Apartment is the condo family.",
    },
    priceTiers: [
      { name: "Entry", maxPrice: 400_000 },
      { name: "Mid", maxPrice: 700_000 },
      { name: "Upper", maxPrice: 1_200_000 },
      { name: "Luxury", maxPrice: null },
    ],
    moiThresholds: { sellers: 4.0, buyers: 6.0 },
    highEndException: {
      enabled: true,
      priceThreshold: 1_500_000,
      propertyTypes: ["detached"],
    },
    moiHighEndExceptionFloor: { detached: 1_500_000, condo: 800_000 },
  },
  // Arizona Regional MLS (Phoenix metro).
  ARMLS: {
    sourceAuthority: "ARMLS",
    statusCodes: [
      sc("Active", "active"),
      sc("Active With Contingent", "pending"),
      sc("Pending", "pending"),
      sc("Closed", "sold"),
      sc("Expired", "expired"),
      sc("Cancelled", "terminated"),
      sc("Temp Off Market", "withdrawn"),
    ],
    propertyTypeVocab: {
      types: [
        "Single Family - Detached",
        "Gemini/Twin Home",
        "Townhouse",
        "Patio Home",
        "Apartment Style/Flat",
      ],
      mergeRule:
        "Single Family - Detached + Patio Home are detached; Gemini/Twin Home + Townhouse are the attached family; Apartment Style/Flat is the condo family.",
    },
    priceTiers: [
      { name: "Entry", maxPrice: 400_000 },
      { name: "Mid", maxPrice: 600_000 },
      { name: "Upper", maxPrice: 1_000_000 },
      { name: "Luxury", maxPrice: null },
    ],
    moiThresholds: { sellers: 4.0, buyers: 6.0 },
    highEndException: {
      enabled: true,
      priceThreshold: 1_500_000,
      propertyTypes: ["detached"],
    },
    moiHighEndExceptionFloor: { detached: 1_500_000, condo: 700_000 },
  },
  // Stellar MLS (formerly My Florida Regional MLS) — Central/West Florida.
  MFRMLS: {
    sourceAuthority: "Stellar MLS",
    statusCodes: [
      sc("Active", "active"),
      sc("Pending", "pending"),
      sc("Sold", "sold"),
      sc("Expired", "expired"),
      sc("Canceled", "terminated"),
      sc("Withdrawn", "withdrawn"),
    ],
    propertyTypeVocab: {
      types: [
        "Single Family Residence",
        "Townhouse",
        "Villa",
        "Condominium",
        "Half Duplex",
      ],
      mergeRule:
        "Single Family Residence is detached; Townhouse + Villa + Half Duplex are the attached family; Condominium is the condo family.",
    },
    priceTiers: [
      { name: "Entry", maxPrice: 350_000 },
      { name: "Mid", maxPrice: 550_000 },
      { name: "Upper", maxPrice: 900_000 },
      { name: "Luxury", maxPrice: null },
    ],
    moiThresholds: { sellers: 4.0, buyers: 6.0 },
    highEndException: {
      enabled: true,
      priceThreshold: 1_500_000,
      propertyTypes: ["detached"],
    },
    moiHighEndExceptionFloor: { detached: 1_500_000, condo: 700_000 },
  },
};

// Aliases — data-system or colloquial names that should resolve to a board key.
const MARKET_SOURCE_ALIASES: Record<string, string> = {
  PILLAR9: "CREB",
  CALGARY: "CREB",
  BRIGHTMLS: "BRIGHT",
  STELLAR: "MFRMLS",
  STELLARMLS: "MFRMLS",
  MYFLORIDA: "MFRMLS",
  DALLAS: "NTREIS",
  PHOENIX: "ARMLS",
};

/**
 * Resolve per-source seed defaults from an mlsSource / board string. Matching is
 * case- and whitespace-insensitive and honours a small alias table (e.g. the
 * Calgary data system "Pillar 9" maps to the CREB board). Unknown sources get
 * GENERIC_MARKET_DEFAULTS so a never-before-seen board still validates.
 */
export function resolveMarketDefaults(
  mlsSource?: string | null,
): MarketSourceDefaults {
  const key = (mlsSource ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key) return GENERIC_MARKET_DEFAULTS;
  const direct = MARKET_SOURCE_DEFAULTS[key];
  if (direct) return direct;
  const aliased = MARKET_SOURCE_ALIASES[key];
  if (aliased && MARKET_SOURCE_DEFAULTS[aliased]) {
    return MARKET_SOURCE_DEFAULTS[aliased];
  }
  return GENERIC_MARKET_DEFAULTS;
}

/**
 * Maximum CSV files per upload batch. 25 = enough for 2-year YoY comparison
 * (current month + 24 prior months). Do not lower below 13 (1-year YoY).
 */
export const MAX_CSV_UPLOAD_BATCH = 25;

/**
 * Order matters — this is the canonical preset list and the order shown in UI.
 * IDs are stable so existing MarketConfig.subPersonas survive future additions
 * via `mergeSubPersonasWithPresets` (appends new preset IDs that aren't stored
 * yet). Custom (user-added) personas have IDs ending in `_custom_<ts>` and are
 * detected via `isPresetSubPersonaId`.
 */
export const DEFAULT_SUB_PERSONAS: SubPersona[] = [
  { id: "first_time_buyer", label: "First-Time Buyer", enabled: false },
  { id: "move_up", label: "Move-Up Buyer", enabled: false },
  { id: "move_down", label: "Move-Down", enabled: false },
  { id: "simultaneous_mover", label: "Simultaneous Mover", enabled: false },
  { id: "relocator", label: "Relocator", enabled: false },
  { id: "investor", label: "Investor", enabled: false },
  { id: "investor_parent", label: "Investor Parent", enabled: false },
  { id: "curious_owner", label: "Curious Owner", enabled: false },
  { id: "aspirational", label: "Aspirational", enabled: false },
];

const PRESET_SUB_PERSONA_IDS = new Set(DEFAULT_SUB_PERSONAS.map((p) => p.id));

export function isPresetSubPersonaId(id: string): boolean {
  return PRESET_SUB_PERSONA_IDS.has(id);
}

/**
 * Merge a member's stored subPersonas with the current preset list. Any preset
 * id that isn't already in `stored` is appended (enabled: false). This lets
 * members pick up new presets on next form load without losing prior choices
 * or any custom personas they've added.
 */
export function mergeSubPersonasWithPresets(
  stored: SubPersona[] | null | undefined,
): SubPersona[] {
  if (!Array.isArray(stored) || stored.length === 0) {
    return DEFAULT_SUB_PERSONAS.map((p) => ({ ...p }));
  }
  const storedIds = new Set(stored.map((p) => p.id));
  const missingPresets = DEFAULT_SUB_PERSONAS.filter(
    (p) => !storedIds.has(p.id),
  ).map((p) => ({ ...p }));
  return [...stored, ...missingPresets];
}

export const KEYWORD_KIT_TEMPLATE: KeywordKit = {
  pillars: [
    "{{marketName}} real estate market update",
    "{{marketName}} home prices",
    "{{marketName}} housing inventory",
  ],
  longTail: [
    "should I buy a home in {{marketName}}",
    "{{marketName}} market forecast",
    "{{marketName}} months of inventory",
  ],
  notes: "Edit pillars + long-tail to match your audience research.",
};

export interface MarketConfigShape {
  marketName: string;
  mlsSource: string;
  priceTiers: PriceTier[];
  moiThresholds: MoiThresholds;
  highEndException: HighEndException;
  neighbourhoodVocab: string[];
  keywordKit: KeywordKit;
  primaryAvatar: PrimaryAvatar;
  subPersonas: SubPersona[];
  columnMapping: ColumnMapping;
  // Market-agnostic parameterization (null DB columns resolve to per-source
  // seed defaults via resolveMarketDefaults(mlsSource)).
  sourceAuthority: string;
  statusCodes: StatusCode[];
  propertyTypeVocab: PropertyTypeVocab;
  moiHighEndExceptionFloor: MoiHighEndExceptionFloor;
}

export function emptyMarketConfig(): MarketConfigShape {
  const seed = GENERIC_MARKET_DEFAULTS;
  return {
    marketName: "",
    mlsSource: "",
    priceTiers: DEFAULT_PRICE_TIERS,
    moiThresholds: DEFAULT_MOI_THRESHOLDS,
    highEndException: DEFAULT_HIGH_END_EXCEPTION,
    neighbourhoodVocab: [],
    keywordKit: {},
    primaryAvatar: emptyPrimaryAvatar(),
    subPersonas: DEFAULT_SUB_PERSONAS,
    columnMapping: {},
    sourceAuthority: seed.sourceAuthority,
    statusCodes: seed.statusCodes,
    propertyTypeVocab: seed.propertyTypeVocab,
    moiHighEndExceptionFloor: seed.moiHighEndExceptionFloor,
  };
}

export function toShape(
  row: {
    marketName: string;
    mlsSource: string | null;
    priceTiers: unknown;
    moiThresholds: unknown;
    highEndException: unknown;
    neighbourhoodVocab: unknown;
    keywordKit: unknown;
    primaryAvatar: unknown;
    subPersonas: unknown;
    columnMapping: unknown;
    sourceAuthority?: unknown;
    statusCodes?: unknown;
    propertyTypeVocab?: unknown;
    moiHighEndExceptionFloor?: unknown;
    configuredAt?: Date;
  } | null,
): MarketConfigShape {
  if (!row) return emptyMarketConfig();
  const fallback = emptyMarketConfig();
  const fallbackSnappedAt = (row.configuredAt ?? new Date(0)).toISOString();
  // Per-source seed: any new field left null on the row inherits from the board
  // resolved off mlsSource (Calgary/Pillar 9 → CREB, etc.).
  const seed = resolveMarketDefaults(row.mlsSource);
  return {
    marketName: row.marketName ?? "",
    mlsSource: row.mlsSource ?? "",
    priceTiers: (row.priceTiers as PriceTier[] | null) ?? seed.priceTiers,
    moiThresholds:
      (row.moiThresholds as MoiThresholds | null) ?? seed.moiThresholds,
    highEndException:
      (row.highEndException as HighEndException | null) ??
      seed.highEndException,
    neighbourhoodVocab:
      (row.neighbourhoodVocab as string[] | null) ?? fallback.neighbourhoodVocab,
    keywordKit: (row.keywordKit as KeywordKit | null) ?? fallback.keywordKit,
    primaryAvatar: normalizePrimaryAvatar(row.primaryAvatar, fallbackSnappedAt),
    subPersonas: mergeSubPersonasWithPresets(
      row.subPersonas as SubPersona[] | null,
    ),
    columnMapping:
      (row.columnMapping as ColumnMapping | null) ?? fallback.columnMapping,
    sourceAuthority:
      (typeof row.sourceAuthority === "string" && row.sourceAuthority.trim()
        ? row.sourceAuthority
        : null) ?? seed.sourceAuthority,
    statusCodes:
      (row.statusCodes as StatusCode[] | null) ?? seed.statusCodes,
    propertyTypeVocab:
      (row.propertyTypeVocab as PropertyTypeVocab | null) ??
      seed.propertyTypeVocab,
    moiHighEndExceptionFloor:
      (row.moiHighEndExceptionFloor as MoiHighEndExceptionFloor | null) ??
      seed.moiHighEndExceptionFloor,
  };
}


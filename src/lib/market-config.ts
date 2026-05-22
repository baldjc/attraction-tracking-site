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

export const DEFAULT_SUB_PERSONAS: SubPersona[] = [
  { id: "first_time_buyer", label: "First-Time Buyer", enabled: false },
  { id: "move_down", label: "Move-Down", enabled: false },
  { id: "relocator", label: "Relocator", enabled: false },
  { id: "investor", label: "Investor", enabled: false },
  { id: "curious_owner", label: "Curious Owner", enabled: false },
  { id: "aspirational", label: "Aspirational", enabled: false },
];

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
}

export function emptyMarketConfig(): MarketConfigShape {
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
    configuredAt?: Date;
  } | null,
): MarketConfigShape {
  if (!row) return emptyMarketConfig();
  const fallback = emptyMarketConfig();
  const fallbackSnappedAt = (row.configuredAt ?? new Date(0)).toISOString();
  return {
    marketName: row.marketName ?? "",
    mlsSource: row.mlsSource ?? "",
    priceTiers: (row.priceTiers as PriceTier[] | null) ?? fallback.priceTiers,
    moiThresholds:
      (row.moiThresholds as MoiThresholds | null) ?? fallback.moiThresholds,
    highEndException:
      (row.highEndException as HighEndException | null) ??
      fallback.highEndException,
    neighbourhoodVocab:
      (row.neighbourhoodVocab as string[] | null) ?? fallback.neighbourhoodVocab,
    keywordKit: (row.keywordKit as KeywordKit | null) ?? fallback.keywordKit,
    primaryAvatar: normalizePrimaryAvatar(row.primaryAvatar, fallbackSnappedAt),
    subPersonas:
      (row.subPersonas as SubPersona[] | null) ?? fallback.subPersonas,
    columnMapping:
      (row.columnMapping as ColumnMapping | null) ?? fallback.columnMapping,
  };
}


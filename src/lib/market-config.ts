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

export interface PrimaryAvatar {
  description?: string;
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
    primaryAvatar: {},
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
  } | null,
): MarketConfigShape {
  if (!row) return emptyMarketConfig();
  const fallback = emptyMarketConfig();
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
    primaryAvatar:
      (row.primaryAvatar as PrimaryAvatar | null) ?? fallback.primaryAvatar,
    subPersonas:
      (row.subPersonas as SubPersona[] | null) ?? fallback.subPersonas,
    columnMapping:
      (row.columnMapping as ColumnMapping | null) ?? fallback.columnMapping,
  };
}


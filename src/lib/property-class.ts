// Shared single-family property-CLASS classifier.
//
// The property CLASS column (e.g. "Single Family" / "Condo" / "Townhouse") is
// distinct from the mapped STYLE column (e.g. "2 Storey" / "Bungalow"): a
// "2 Storey" row can belong to either a single-family home OR a condo. Style-
// segmented cuts must only fold single-family rows into their headline, so both
// the deterministic aggregator (csv-aggregate.ts) and the on-demand cut engine
// (computeCut.ts) classify class through this one predicate — keeping them in
// lockstep. Condos remain reachable only via an explicit property-class cut.

/**
 * Substrings that mark a class as NOT single-family. Checked first so
 * "semi-detached" (contains "detached") is correctly excluded.
 */
const NON_SINGLE_FAMILY_MARKERS = [
  "condo",
  "apartment",
  "semi",
  "town",
  "row",
  "duplex",
  "triplex",
  "fourplex",
  "multi",
  "mobile",
  "manufactured",
  "flat",
  "unit",
];

/** Substrings that mark a class as single-family / detached. */
const SINGLE_FAMILY_MARKERS = [
  "single family",
  "single-family",
  "singlefamily",
  "single detached",
  "detached",
];

/**
 * True when a raw property-CLASS cell denotes a single-family / detached home.
 * Conservative: an unrecognized value (e.g. a bare "Residential") returns
 * false, so a restriction that gates on "any single-family row present" simply
 * stays inactive rather than zeroing a member whose class column uses unfamiliar
 * vocabulary.
 */
export function isSingleFamilyClass(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return false;
  if (NON_SINGLE_FAMILY_MARKERS.some((m) => s.includes(m))) return false;
  return SINGLE_FAMILY_MARKERS.some((m) => s.includes(m));
}

/**
 * True when a value reads as a property CLASS term (single-family OR any of the
 * non-single-family classes — condo, townhouse, semi-detached, duplex …) rather
 * than an architectural STYLE (2 Storey, Bungalow). Used by the cut router to
 * keep a class-valued request off the mapped Style column: a member with a
 * distinct raw "Property Type" column holds classes like "Single Family" there,
 * so routing such a value to `style` would make compute_cut honestly refuse it.
 * Genuine style values match no class marker and stay on the style dimension.
 */
export function isPropertyClassValue(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = raw.toString().trim().toLowerCase();
  if (!s) return false;
  return (
    SINGLE_FAMILY_MARKERS.some((m) => s.includes(m)) ||
    NON_SINGLE_FAMILY_MARKERS.some((m) => s.includes(m))
  );
}

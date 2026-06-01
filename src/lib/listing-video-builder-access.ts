/**
 * Temporary testing allowlist for the Listing Video Builder.
 *
 * While the tool is in build/test, only members on this allowlist can
 * see the card on the AI Tools hub or reach the tool route — even
 * though `tool_listing_video_builder` is false in feature flags for
 * everyone else.
 *
 * Admins and editors always see the tool via the existing role check
 * in src/app/member/content-tools/page.tsx — this allowlist is only for
 * members who need to see the tool in the normal member experience.
 *
 * Remove this allowlist (and its call sites) once the tool goes live
 * to all eligible tiers.
 */
const LISTING_VIDEO_BUILDER_TEST_EMAILS = [
  "jared@chamberlaingroup.ca",
];

export function isListingVideoBuilderTester(email?: string | null): boolean {
  if (!email) return false;
  return LISTING_VIDEO_BUILDER_TEST_EMAILS.includes(email.trim().toLowerCase());
}

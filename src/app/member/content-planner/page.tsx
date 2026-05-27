import ContentPlannerWrapper from "./ContentPlannerWrapper";

export default function ContentPlannerPage() {
  // Header, count badge, and AI wizard CTA now live inside
  // ContentPlannerClient so they can read the live plan count + feature
  // flags from the same client cache that drives the rest of the page.
  return <ContentPlannerWrapper />;
}

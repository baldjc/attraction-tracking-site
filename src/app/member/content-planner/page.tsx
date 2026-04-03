import PageHeader from "@/components/PageHeader";
import ContentPlannerWrapper from "./ContentPlannerWrapper";

export default function ContentPlannerPage() {
  return (
    <>
      <PageHeader
        emoji="📅"
        title="Content Planner"
        description="Plan, track, and manage your entire video pipeline in one place."
      />
      <ContentPlannerWrapper />
    </>
  );
}

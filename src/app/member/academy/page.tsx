import AcademyTabs from "@/components/AcademyTabs";
import PageHeader from "@/components/PageHeader";
import { AcademicCapIcon } from "@heroicons/react/24/outline";

export default function AcademyPage() {
  return (
    <>
      <PageHeader
        icon={AcademicCapIcon}
        title="Academy"
        description="Master the system that turns viewers into clients."
        colour="#10B981"
      />
      <AcademyTabs routePath="/member/academy" />
    </>
  );
}

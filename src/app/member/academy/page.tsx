import AcademyHome from "@/components/AcademyHome";
import PageHeader from "@/components/PageHeader";

export default function AcademyPage() {
  return (
    <>
      <PageHeader
        emoji="🎓"
        title="Academy"
        description="Master the system that turns viewers into clients."
      />
      <AcademyHome />
    </>
  );
}

import GenerateLeadsSectionClient from "./GenerateLeadsSectionClient";

export default async function GenerateLeadsSectionPage({
  params,
}: {
  params: Promise<{ sectionSlug: string }>;
}) {
  const { sectionSlug } = await params;
  return <GenerateLeadsSectionClient sectionSlug={sectionSlug} />;
}

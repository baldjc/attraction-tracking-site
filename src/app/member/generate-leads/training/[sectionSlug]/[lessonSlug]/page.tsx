import GenerateLeadsLessonClient from "./GenerateLeadsLessonClient";

export default async function GenerateLeadsLessonPage({
  params,
}: {
  params: Promise<{ sectionSlug: string; lessonSlug: string }>;
}) {
  const { sectionSlug, lessonSlug } = await params;
  return <GenerateLeadsLessonClient sectionSlug={sectionSlug} lessonSlug={lessonSlug} />;
}

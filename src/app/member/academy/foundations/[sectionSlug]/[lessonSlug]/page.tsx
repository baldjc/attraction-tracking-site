import LessonClient from "./LessonClient";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ sectionSlug: string; lessonSlug: string }>;
}) {
  const { sectionSlug, lessonSlug } = await params;
  return <LessonClient sectionSlug={sectionSlug} lessonSlug={lessonSlug} />;
}

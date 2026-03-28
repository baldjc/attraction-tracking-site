import { redirect } from "next/navigation";

export default function LessonRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/academy-manager/lessons/${params.id}`);
}

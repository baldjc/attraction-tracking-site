import { redirect } from "next/navigation";

export default function SectionRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/academy-manager/sections/${params.id}`);
}

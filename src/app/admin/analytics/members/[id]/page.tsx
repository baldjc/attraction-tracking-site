import { redirect } from "next/navigation";

export default async function AnalyticsMemberRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/members/${id}`);
}

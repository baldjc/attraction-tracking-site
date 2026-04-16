import { redirect } from "next/navigation";

export default function PrinciplesPage() {
  redirect("/admin/academy-manager?tab=principles");
}

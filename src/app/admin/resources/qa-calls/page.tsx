import { redirect } from "next/navigation";

export default function QACallsRedirect() {
  redirect("/admin/academy-manager?tab=qa-calls");
}

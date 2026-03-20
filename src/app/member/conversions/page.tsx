import { redirect } from "next/navigation";

export default function ConversionsPage() {
  redirect("/member/analytics?tab=conversions");
}

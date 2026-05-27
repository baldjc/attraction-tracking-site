import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import BetaCohortClient from "./BetaCohortClient";

/**
 * /admin/beta-cohort — manage the v2 beta cohort.
 *
 * Admin-only (editors bypass flags via the staff bypass in getFeatureFlags so
 * they wouldn't get useful results from this tool anyway). Editors that hit
 * this page get bounced to the admin landing page.
 */
export default async function BetaCohortPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) redirect("/login");
  if (role !== "admin") redirect("/admin");

  return <BetaCohortClient />;
}

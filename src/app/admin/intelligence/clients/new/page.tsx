import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import NewClientForm from "@/components/intelligence/NewClientForm";

export const metadata = { title: "Add Client" };

export default async function NewClientPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence/clients" className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Clients</Link>
      </div>
      <h1 className="text-xl font-bold text-[var(--abv-text)] mb-6">Add Client</h1>
      <NewClientForm />
    </div>
  );
}

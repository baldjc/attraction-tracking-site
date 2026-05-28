import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Intelligence Runs" };

export default async function RunsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const runs = await prisma.intelRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { client: { select: { name: true } } },
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/intelligence" className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Intelligence</Link>
          <h1 className="text-xl font-bold text-[var(--abv-text)] mt-1">Intelligence Runs</h1>
        </div>
        <Link href="/admin/intelligence/new-run" className="px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85 transition-colors">
          + New Run
        </Link>
      </div>

      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl">
        {runs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">🔬</p>
            <p className="font-semibold text-[var(--abv-text)]">No runs yet</p>
            <p className="text-sm text-[var(--abv-text)]/50 mt-1">Start your first intelligence run</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--abv-text)]/10 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Channel</th>
                <th className="px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Client</th>
                <th className="px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wide">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--abv-text)]/6">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-[var(--abv-bg)]/60">
                  <td className="px-5 py-3 text-[var(--abv-text)] font-medium truncate max-w-[220px]">{run.inputChannelUrl}</td>
                  <td className="px-5 py-3 text-[var(--abv-text)]/60">{run.client?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-5 py-3 text-[var(--abv-text)]/50 text-xs">{new Date(run.startedAt).toLocaleDateString("en-CA")}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/intelligence/runs/${run.id}`} className="text-xs text-[var(--abv-azure)] hover:underline">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:   { label: "Pending",   cls: "bg-yellow-100 text-yellow-700" },
    RUNNING:   { label: "Running",   cls: "bg-[var(--abv-azure-tint)] text-[#1E8FCC]" },
    COMPLETED: { label: "Done",      cls: "bg-green-100 text-green-700" },
    FAILED:    { label: "Failed",    cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

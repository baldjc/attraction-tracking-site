import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "SEO Intelligence" };

export default async function IntelligencePage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin") redirect("/admin");

  const [clientCount, runCount, recentRuns] = await Promise.all([
    prisma.client.count({ where: { active: true } }),
    prisma.intelRun.count(),
    prisma.intelRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">SEO Intelligence</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">
          YouTube + SEO research, channel intelligence runs, and global pattern library
        </p>
      </div>

      {/* Quick action */}
      <div className="mb-6">
        <Link
          href="/admin/intelligence/new-run"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--abv-dark)] hover:bg-black/85 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <span>+</span> New Intelligence Run
        </Link>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <ModuleCard
          href="/admin/intelligence/clients"
          title="Clients"
          description="DWY client profiles, keyword research, content ideas"
          stat={clientCount}
          statLabel="active clients"
          colour="var(--abv-azure)"
          icon="👥"
        />
        <ModuleCard
          href="/admin/intelligence/runs"
          title="Intelligence Runs"
          description="Full channel intelligence reports"
          stat={runCount}
          statLabel="runs total"
          colour="#5b9e8c"
          icon="🔬"
        />
        <ModuleCard
          href="/admin/intelligence/global/patterns"
          title="Pattern Library"
          description="Hook, title, and thumbnail patterns from outliers"
          stat={null}
          statLabel="global patterns"
          colour="#8b7ec8"
          icon="📚"
        />
        <ModuleCard
          href="/admin/intelligence/global/outliers"
          title="Outlier Feed"
          description="Top-performing videos across the niche"
          stat={null}
          statLabel="outlier videos"
          colour="#c87e5b"
          icon="🚀"
        />
      </div>

      {/* Recent runs */}
      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--abv-text)]">Recent Runs</h2>
          <Link href="/admin/intelligence/runs" className="text-xs text-[var(--abv-azure)] hover:underline">
            View all
          </Link>
        </div>

        {recentRuns.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-3">🔬</p>
            <p className="text-sm font-medium text-[var(--abv-text)]">No runs yet</p>
            <p className="text-xs text-[var(--abv-text)]/50 mt-1">
              Paste a YouTube channel URL to run your first intelligence report
            </p>
            <Link
              href="/admin/intelligence/new-run"
              className="mt-4 inline-block px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-medium rounded-lg hover:bg-black/85 transition-colors"
            >
              Start a run
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--abv-text)]/8">
            {recentRuns.map((run) => (
              <div key={run.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--abv-text)] truncate">
                    {run.inputChannelUrl}
                  </p>
                  <p className="text-xs text-[var(--abv-text)]/50 mt-0.5">
                    {run.client?.name ?? "No client"} &middot;{" "}
                    {new Date(run.startedAt).toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={run.status} />
                  <Link
                    href={`/admin/intelligence/runs/${run.id}`}
                    className="text-xs text-[var(--abv-azure)] hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global sub-sections */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SubCard href="/admin/intelligence/global/trends" icon="📈" label="Topic Trends" />
        <SubCard href="/admin/intelligence/global/swipe-file" icon="🗂️" label="Swipe File" />
        <SubCard href="/admin/intelligence/clients/new" icon="➕" label="Add Client" />
      </div>
    </div>
  );
}

function ModuleCard({
  href,
  title,
  description,
  stat,
  statLabel,
  colour,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  stat: number | null;
  statLabel: string;
  colour: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-5 hover:shadow-md hover:border-[var(--abv-text)]/20 transition-all group"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-3"
        style={{ backgroundColor: colour + "18" }}
      >
        {icon}
      </div>
      <p className="font-semibold text-[var(--abv-text)] group-hover:text-[var(--abv-azure)] transition-colors">
        {title}
      </p>
      <p className="text-xs text-[var(--abv-text)]/50 mt-1 leading-relaxed">{description}</p>
      {stat !== null && (
        <p className="text-xs font-semibold mt-3" style={{ color: colour }}>
          {stat} {statLabel}
        </p>
      )}
    </Link>
  );
}

function SubCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 flex items-center gap-3 hover:shadow-sm hover:border-[var(--abv-text)]/20 transition-all"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium text-[var(--abv-text)]">{label}</span>
      <span className="ml-auto text-[var(--abv-text)]/30 text-sm">→</span>
    </Link>
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
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
  );
}

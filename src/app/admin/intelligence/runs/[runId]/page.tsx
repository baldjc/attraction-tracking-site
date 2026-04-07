import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Run Report" };

export default async function RunReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const { runId } = await params;
  const run = await prisma.intelRun.findUnique({
    where: { id: runId },
    include: { client: { select: { name: true, city: true } } },
  });
  if (!run) notFound();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence/runs" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Runs</Link>
      </div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#2f3437] break-all">{run.inputChannelUrl}</h1>
          {run.client && (
            <p className="text-sm text-[#2f3437]/60 mt-1">{run.client.name} · {run.client.city}</p>
          )}
        </div>
        <StatusBadge status={run.status} />
      </div>

      {run.status === "COMPLETED" && run.reportMarkdown ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-6 prose prose-sm max-w-none">
          <pre className="whitespace-pre-wrap text-sm text-[#2f3437]">{run.reportMarkdown}</pre>
        </div>
      ) : run.status === "FAILED" ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold text-red-700 mb-1">Run failed</p>
          <p className="text-sm text-red-600">{run.failedReason ?? "Unknown error"}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">{run.status === "RUNNING" ? "⏳" : "⏸️"}</p>
          <p className="font-semibold text-[#2f3437]">
            {run.status === "RUNNING" ? "Run in progress…" : "Run queued"}
          </p>
          <p className="text-sm text-[#2f3437]/50 mt-1">
            Report will appear here when complete. Started {new Date(run.startedAt).toLocaleString("en-CA")}.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:   { label: "Pending",   cls: "bg-yellow-100 text-yellow-700" },
    RUNNING:   { label: "Running",   cls: "bg-blue-100 text-blue-700" },
    COMPLETED: { label: "Done",      cls: "bg-green-100 text-green-700" },
    FAILED:    { label: "Failed",    cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

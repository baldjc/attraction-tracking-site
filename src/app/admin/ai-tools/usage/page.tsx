import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export const metadata = { title: "AI Tools Usage – Admin" };

const TOOL_LABELS: Record<string, string> = {
  avatar_architect: "Avatar Architect",
  content_engine: "Content Engine",
  title_thumbnail_analyzer: "Title & Thumbnail Analyser",
  arc_script_builder: "ARC Script Builder",
  script_review: "Script Review",
};

const TOOL_ICONS: Record<string, string> = {
  avatar_architect: "🎯",
  content_engine: "🚀",
  title_thumbnail_analyzer: "🖼️",
  arc_script_builder: "🎬",
  script_review: "📋",
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AIToolsUsagePage() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") redirect("/login");

  const [conversations, memberCounts] = await Promise.all([
    prisma.aIToolConversation.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: { fullName: true, email: true, id: true },
        },
      },
    }),
    prisma.aIToolConversation.groupBy({
      by: ["userId", "toolType"],
      _count: { id: true },
    }),
  ]);

  const totalConversations = conversations.length;
  const uniqueMembers = new Set(conversations.map((c) => c.userId)).size;

  // Tool breakdown
  const byTool: Record<string, { count: number; downloads: number; members: Set<string> }> = {};
  for (const conv of conversations) {
    if (!byTool[conv.toolType]) {
      byTool[conv.toolType] = { count: 0, downloads: 0, members: new Set() };
    }
    byTool[conv.toolType].count++;
    byTool[conv.toolType].downloads += conv.downloadCount;
    byTool[conv.toolType].members.add(conv.userId);
  }

  // Member activity — aggregate by user
  const memberActivity: Record<string, { name: string; email: string; id: string; total: number; byTool: Record<string, number>; lastActive: Date }> = {};
  for (const conv of conversations) {
    const uid = conv.userId;
    if (!memberActivity[uid]) {
      memberActivity[uid] = {
        id: uid,
        name: conv.user.fullName ?? conv.user.email,
        email: conv.user.email,
        total: 0,
        byTool: {},
        lastActive: conv.createdAt,
      };
    }
    memberActivity[uid].total++;
    memberActivity[uid].byTool[conv.toolType] = (memberActivity[uid].byTool[conv.toolType] ?? 0) + 1;
    if (conv.createdAt > memberActivity[uid].lastActive) {
      memberActivity[uid].lastActive = conv.createdAt;
    }
  }

  const memberRows = Object.values(memberActivity).sort((a, b) => b.total - a.total);
  const recentFeed = conversations.slice(0, 30);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      <div>
        <Link
          href="/admin/ai-tools"
          className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#0d9488] transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#2f3437]">AI Tools Usage</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">
          Member engagement across all AI tools — last 30 days.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-black text-[#0d9488]">{totalConversations}</div>
          <div className="text-xs text-[#2f3437]/50 font-medium mt-1">Total Conversations</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-black text-[#2f3437]">{uniqueMembers}</div>
          <div className="text-xs text-[#2f3437]/50 font-medium mt-1">Active Members</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-black text-[#2f3437]">
            {conversations.reduce((sum, c) => sum + c.downloadCount, 0)}
          </div>
          <div className="text-xs text-[#2f3437]/50 font-medium mt-1">Total Downloads</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-black text-[#2f3437]">
            {Object.keys(byTool).length}
          </div>
          <div className="text-xs text-[#2f3437]/50 font-medium mt-1">Tools Used</div>
        </div>
      </div>

      {/* Tool breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#2f3437]">Usage by Tool</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {Object.entries(TOOL_LABELS).map(([toolType, label]) => {
            const data = byTool[toolType];
            return (
              <div key={toolType} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{TOOL_ICONS[toolType]}</span>
                  <div>
                    <p className="text-sm font-medium text-[#2f3437]">{label}</p>
                    <p className="text-xs text-[#2f3437]/40">
                      {data ? `${data.members.size} member${data.members.size !== 1 ? "s" : ""}` : "No usage"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[#2f3437]">
                    {data?.count ?? 0}
                  </div>
                  <div className="text-xs text-[#2f3437]/40">
                    {data?.downloads ? `${data.downloads} downloads` : "conversations"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member activity table */}
      {memberRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-[#2f3437]">Member Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">
                    Member
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">
                    Total
                  </th>
                  {Object.keys(TOOL_LABELS).map((t) => (
                    <th key={t} className="text-center px-3 py-2.5 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">
                      {TOOL_ICONS[t]}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider">
                    Last Active
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {memberRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/members/${row.id}`}
                        className="font-medium text-[#2f3437] hover:text-[#0d9488] transition-colors"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-[#2f3437]/40">{row.email}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-[#0d9488]/10 text-[#0d9488] text-xs font-bold rounded-full">
                        {row.total}
                      </span>
                    </td>
                    {Object.keys(TOOL_LABELS).map((t) => (
                      <td key={t} className="px-3 py-3 text-center text-xs text-[#2f3437]/60">
                        {row.byTool[t] ?? "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-xs text-[#2f3437]/40">
                      {fmtDate(row.lastActive)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent feed */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#2f3437]">Recent Activity</h2>
        </div>
        <ul className="divide-y divide-gray-50">
          {recentFeed.map((conv) => (
            <li key={conv.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg shrink-0">{TOOL_ICONS[conv.toolType]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#2f3437] truncate">{conv.title}</p>
                  <p className="text-xs text-[#2f3437]/40">
                    <Link
                      href={`/admin/members/${conv.userId}`}
                      className="hover:text-[#0d9488] transition-colors"
                    >
                      {conv.user.fullName ?? conv.user.email}
                    </Link>{" "}
                    · {TOOL_LABELS[conv.toolType]}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-xs text-[#2f3437]/40">{fmt(conv.createdAt)}</p>
                {conv.downloadCount > 0 && (
                  <p className="text-xs text-[#0d9488]">{conv.downloadCount} downloads</p>
                )}
              </div>
            </li>
          ))}
          {recentFeed.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[#2f3437]/40">
              No activity yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

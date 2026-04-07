import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Client Overview" };

const AUDIENCE_LABELS: Record<string, string> = {
  FIRST_TIME_BUYER: "First-Time Buyer",
  MOVE_UP_BUYER: "Move-Up Buyer",
  MOVE_DOWN_RIGHT_SIZER: "Move-Down / Right-Sizer",
  SELLER: "Seller",
  INVESTOR: "Investor",
  RELOCATOR: "Relocator",
  LUXURY: "Luxury",
  NEW_CONSTRUCTION: "New Construction",
  RENTER_CONSIDERING_BUYING: "Renter Considering Buying",
};

export default async function ClientOverviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const { clientId } = await params;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      _count: {
        select: {
          intelRuns: true,
          seoSearches: true,
          seoClusters: true,
          contentIdeas: true,
          competitors: true,
        },
      },
    },
  });
  if (!client) notFound();

  const subLinks = [
    { href: `/admin/intelligence/clients/${clientId}/keywords`, label: "Keyword Research", icon: "🔍", count: client._count.seoSearches, unit: "searches" },
    { href: `/admin/intelligence/clients/${clientId}/clusters`, label: "Saved Clusters", icon: "🗂️", count: client._count.seoClusters, unit: "clusters" },
    { href: `/admin/intelligence/clients/${clientId}/competitors`, label: "Competitors", icon: "📡", count: client._count.competitors, unit: "channels" },
    { href: `/admin/intelligence/clients/${clientId}/ideas`, label: "Content Ideas", icon: "💡", count: client._count.contentIdeas, unit: "ideas" },
    { href: `/admin/intelligence/clients/${clientId}/vocabulary`, label: "Vocabulary Profile", icon: "📝", count: null, unit: "" },
    { href: `/admin/intelligence/clients/${clientId}/runs`, label: "Intelligence Runs", icon: "🔬", count: client._count.intelRuns, unit: "runs" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence/clients" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Clients</Link>
      </div>

      <div className="bg-white border border-[#2f3437]/10 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#2f3437]">{client.name}</h1>
            <p className="text-sm text-[#2f3437]/60 mt-1">
              {client.city}{client.province ? `, ${client.province}` : ""} · {AUDIENCE_LABELS[client.audiencePrimary] ?? client.audiencePrimary}
            </p>
            {client.niche && (
              <p className="text-sm text-[#2f3437]/40 mt-0.5">{client.niche}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${client.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {client.active ? "Active" : "Inactive"}
          </span>
        </div>
        {client.audienceSecondary.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {client.audienceSecondary.map((a) => (
              <span key={a} className="px-2 py-0.5 bg-[#6ba3c7]/10 text-[#6ba3c7] text-xs rounded-full">
                {AUDIENCE_LABELS[a] ?? a}
              </span>
            ))}
          </div>
        )}
        {client.ownChannelUrl && (
          <a href={client.ownChannelUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-[#6ba3c7] hover:underline">
            📺 {client.ownChannelUrl}
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {subLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white border border-[#2f3437]/10 rounded-xl p-4 hover:shadow-sm hover:border-[#2f3437]/20 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl">{link.icon}</span>
              {link.count !== null && (
                <span className="text-xs text-[#2f3437]/40">{link.count} {link.unit}</span>
              )}
            </div>
            <p className="text-sm font-medium text-[#2f3437]">{link.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

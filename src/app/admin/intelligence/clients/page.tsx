import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import prisma from "@/lib/prisma";

export const metadata = { title: "Intelligence Clients" };

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

export default async function ClientsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/admin");

  const clients = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { intelRuns: true, contentIdeas: true, seoSearches: true } },
    },
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1">Clients</h1>
        </div>
        <Link href="/admin/intelligence/clients/new" className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5] transition-colors">
          + Add Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">👥</p>
          <p className="font-semibold text-[#2f3437]">No clients yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1 mb-4">Add your first DWY client to start tracking keyword research and content ideas.</p>
          <Link href="/admin/intelligence/clients/new" className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5] transition-colors">
            Add Client
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/admin/intelligence/clients/${client.id}`}
              className="bg-white border border-[#2f3437]/10 rounded-xl p-5 hover:shadow-sm hover:border-[#2f3437]/20 transition-all flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-semibold text-[#2f3437]">{client.name}</p>
                <p className="text-sm text-[#2f3437]/50 mt-0.5">
                  {client.city}{client.province ? `, ${client.province}` : ""} · {AUDIENCE_LABELS[client.audiencePrimary] ?? client.audiencePrimary}
                </p>
              </div>
              <div className="flex items-center gap-6 shrink-0 text-right">
                <div className="text-xs text-[#2f3437]/40">
                  <p className="font-semibold text-[#2f3437]">{client._count.intelRuns}</p>
                  <p>runs</p>
                </div>
                <div className="text-xs text-[#2f3437]/40">
                  <p className="font-semibold text-[#2f3437]">{client._count.seoSearches}</p>
                  <p>searches</p>
                </div>
                <div className="text-xs text-[#2f3437]/40">
                  <p className="font-semibold text-[#2f3437]">{client._count.contentIdeas}</p>
                  <p>ideas</p>
                </div>
                <span className="text-[#2f3437]/30">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

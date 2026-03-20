"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface TrackingLinkData {
  id: string;
  name: string;
  refCode: string;
  trackedUrl: string;
  youtubeVideoUrl: string | null;
  youtubeVideoId: string | null;
  youtubeThumbnailUrl: string | null;
  youtubeViewCount: number;
  createdAt: string;
  clicks: number;
  leads: number;
  conversionRate: number;
}

interface CampaignData {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  createdAt: string;
  member?: { fullName: string | null; email: string };
  links: TrackingLinkData[];
  totalViews: number | null;
  totalClicks: number;
  totalLeads: number;
  hasYoutube: boolean;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  YOUTUBE: { label: "YouTube", color: "bg-red-100 text-red-700" },
  GOOGLE_ADS: { label: "Google Ads", color: "bg-blue-100 text-blue-700" },
  EMAIL: { label: "Email", color: "bg-green-100 text-green-700" },
  OTHER: { label: "Other", color: "bg-gray-100 text-gray-600" },
};

export default function AdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((d) => { setCampaign(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>;
  if (!campaign) return <div className="text-center py-16 text-[#1e2a38]/40">Campaign not found.</div>;

  const src = SOURCE_LABELS[campaign.sourceType] ?? SOURCE_LABELS.OTHER;
  const memberName = campaign.member?.fullName ?? campaign.member?.email ?? "—";

  return (
    <div>
      <div className="mb-2">
        <Link href="/admin/campaigns" className="text-sm text-[#1e2a38]/40 hover:text-[#1e2a38] transition-colors">
          ← Campaigns
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#1e2a38]">{campaign.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.color}`}>{src.label}</span>
          </div>
          <p className="text-sm text-[#1e2a38]/50">
            Member: <span className="text-[#1e2a38]/80">{memberName}</span>
            {campaign.member?.email && campaign.member.fullName && (
              <> · <span className="text-[#1e2a38]/40">{campaign.member.email}</span></>
            )}
          </p>
          <a
            href={campaign.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#3dc3ff] hover:underline"
          >
            {campaign.destinationUrl}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {campaign.hasYoutube && campaign.totalViews !== null && (
          <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalViews.toLocaleString()}</div>
            <div className="text-xs text-[#1e2a38]/40 mt-0.5">Total Views</div>
          </div>
        )}
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalClicks}</div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Clicks</div>
        </div>
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#1e2a38]">{campaign.totalLeads}</div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Leads</div>
        </div>
        <div className="bg-white border border-[#1e2a38]/10 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-[#3dc3ff]">
            {campaign.totalClicks > 0 ? Math.round((campaign.totalLeads / campaign.totalClicks) * 100) : 0}%
          </div>
          <div className="text-xs text-[#1e2a38]/40 mt-0.5">Conversion Rate</div>
        </div>
      </div>

      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e2a38]/10">
          <h2 className="font-semibold text-[#1e2a38]">Tracking Links ({campaign.links.length})</h2>
        </div>
        {campaign.links.length === 0 ? (
          <div className="p-10 text-center text-[#1e2a38]/40 text-sm">No tracking links yet.</div>
        ) : (
          <div className="divide-y divide-[#1e2a38]/5">
            {campaign.links.map((link) => (
              <div key={link.id} className="p-5">
                <div className="flex items-start gap-3">
                  {link.youtubeThumbnailUrl && (
                    <img
                      src={link.youtubeThumbnailUrl}
                      alt={link.name}
                      className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1e2a38] text-sm">{link.name}</p>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#1e2a38]/40 uppercase tracking-wide w-16 flex-shrink-0">Direct</span>
                        <p className="text-xs text-[#1e2a38]/50 truncate flex-1 font-mono">{link.trackedUrl}</p>
                        <button onClick={() => copy(link.trackedUrl, `${link.id}-direct`)} className="text-xs text-[#3dc3ff] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-direct` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[#1e2a38]/40 uppercase tracking-wide w-16 flex-shrink-0">Short</span>
                        <p className="text-xs text-[#1e2a38]/50 truncate flex-1 font-mono">https://members.attractionbyvideo.com/r/{link.refCode}</p>
                        <button onClick={() => copy(`https://members.attractionbyvideo.com/r/${link.refCode}`, `${link.id}-short`)} className="text-xs text-[#3dc3ff] hover:text-[#2bb0ec] flex-shrink-0 font-medium">
                          {copied === `${link.id}-short` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                  {link.youtubeVideoId && (
                    <div>
                      <div className="text-sm font-semibold text-[#1e2a38]">{link.youtubeViewCount.toLocaleString()}</div>
                      <div className="text-xs text-[#1e2a38]/40">Views</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-[#1e2a38]">{link.clicks}</div>
                    <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1e2a38]">{link.leads}</div>
                    <div className="text-xs text-[#1e2a38]/40">Leads</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#3dc3ff]">{link.conversionRate}%</div>
                    <div className="text-xs text-[#1e2a38]/40">Conv. Rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

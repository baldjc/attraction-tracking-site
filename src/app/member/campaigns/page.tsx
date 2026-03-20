"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  destinationUrl: string;
  sourceType: string;
  createdAt: string;
  totalClicks: number;
  totalLeads: number;
  conversionRate: number;
  linkCount: number;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  YOUTUBE: { label: "YouTube", color: "bg-red-100 text-red-700" },
  GOOGLE_ADS: { label: "Google Ads", color: "bg-blue-100 text-blue-700" },
  EMAIL: { label: "Email", color: "bg-green-100 text-green-700" },
  OTHER: { label: "Other", color: "bg-gray-100 text-gray-600" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", destinationUrl: "", sourceType: "YOUTUBE" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadCampaigns(); }, []);

  async function loadCampaigns() {
    setLoading(true);
    const res = await fetch("/api/campaigns");
    if (res.ok) setCampaigns(await res.json());
    setLoading(false);
  }

  async function createCampaign() {
    if (!form.name || !form.destinationUrl) return;
    setCreating(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const campaign = await res.json();
      setShowModal(false);
      setForm({ name: "", destinationUrl: "", sourceType: "YOUTUBE" });
      window.location.href = `/member/campaigns/${campaign.id}`;
    }
    setCreating(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Campaigns</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-0.5">Track clicks and leads from your content</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 transition-colors"
        >
          + New Campaign
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#1e2a38]/40">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h2 className="font-semibold text-[#1e2a38] mb-2">No campaigns yet</h2>
          <p className="text-sm text-[#1e2a38]/50 mb-5">
            Create a campaign for each lead magnet you want to track.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#3dc3ff] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 transition-colors"
          >
            Create your first campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((c) => {
            const src = SOURCE_LABELS[c.sourceType] ?? SOURCE_LABELS.OTHER;
            return (
              <Link
                key={c.id}
                href={`/member/campaigns/${c.id}`}
                className="bg-white border border-[#1e2a38]/10 rounded-2xl p-5 hover:border-[#3dc3ff]/40 hover:shadow-sm transition-all block"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-[#1e2a38]">{c.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${src.color}`}>
                    {src.label}
                  </span>
                </div>
                <p className="text-xs text-[#1e2a38]/40 truncate mb-4">{c.destinationUrl}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-[#1e2a38]">{c.totalClicks}</div>
                    <div className="text-xs text-[#1e2a38]/40">Clicks</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[#1e2a38]">{c.totalLeads}</div>
                    <div className="text-xs text-[#1e2a38]/40">Leads</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[#3dc3ff]">{c.conversionRate}%</div>
                    <div className="text-xs text-[#1e2a38]/40">Conv. Rate</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#1e2a38]/5 text-xs text-[#1e2a38]/40">
                  {c.linkCount} tracking link{c.linkCount !== 1 ? "s" : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1e2a38]">New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Free Home Valuation Guide"
                  className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Destination URL</label>
                <input
                  type="url"
                  value={form.destinationUrl}
                  onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
                  placeholder="https://yoursite.com/free-guide"
                  className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff]"
                />
                <p className="text-xs text-[#1e2a38]/40 mt-1">The lead magnet or landing page URL</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Traffic Source</label>
                <select
                  value={form.sourceType}
                  onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                  className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#3dc3ff] bg-white"
                >
                  <option value="YOUTUBE">YouTube</option>
                  <option value="GOOGLE_ADS">Google Ads</option>
                  <option value="EMAIL">Email</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <button
                onClick={createCampaign}
                disabled={creating || !form.name || !form.destinationUrl}
                className="w-full bg-[#3dc3ff] text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

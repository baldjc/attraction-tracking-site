"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import LinkedPlanBanner from "@/components/ai-tools/LinkedPlanBanner";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";

interface CampaignInfo {
  id: string;
  name: string;
  destinationUrl: string;
  leadMagnetUrl: string | null;
  linkCount: number;
}

interface CampaignLinkInfo {
  id: string;
  name: string;
  trackedUrl: string;
  refCode: string;
  clicks: number;
  leads: number;
}

interface ActiveCampaignLink {
  campaignId: string;
  campaignName: string;
  linkId: string;
  linkName: string;
  trackedUrl: string;
  isNew: boolean;
}

interface ContentPlanOption {
  id: string;
  title: string;
}

function DescriptionGeneratorPageInner() {
  const searchParams = useSearchParams();
  const urlPlanId = searchParams.get("planId");

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [contentPlanId, setContentPlanId] = useState<string | null>(urlPlanId);

  const [generating, setGenerating] = useState(false);
  const aiThinking = useAiThinking({
    mode: "phase",
    fallbackPhases: ["Generating description…", "Polishing copy and tags…"],
  });
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [activeLink, setActiveLink] = useState<ActiveCampaignLink | null>(null);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [pickerCampaignId, setPickerCampaignId] = useState("");
  const [campaignPickerLinks, setCampaignPickerLinks] = useState<CampaignLinkInfo[]>([]);
  const [campaignPickerLinksLoading, setCampaignPickerLinksLoading] = useState(false);
  const [newLinkMode, setNewLinkMode] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [lastPickedCampaignId, setLastPickedCampaignId] = useState("");

  const [boilerplate, setBoilerplate] = useState("");
  const [boilerplateExpanded, setBoilerplateExpanded] = useState(false);
  const [savingBoilerplate, setSavingBoilerplate] = useState(false);
  const [boilerplateSaved, setBoilerplateSaved] = useState(false);

  const [savingToPlan, setSavingToPlan] = useState(false);
  const [savedToPlan, setSavedToPlan] = useState(false);
  const [contentPlans, setContentPlans] = useState<ContentPlanOption[]>([]);
  const [showPlanPicker, setShowPlanPicker] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("description_prefill");
      if (raw) {
        sessionStorage.removeItem("description_prefill");
        const data = JSON.parse(raw);
        if (data.title) setTitle(data.title);
        if (data.transcript) setTranscript(data.transcript);
        if (data.contentPlanId) setContentPlanId(data.contentPlanId);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch("/api/member/profile/boilerplate")
      .then((r) => r.json())
      .then((data) => { if (data.boilerplate) setBoilerplate(data.boilerplate); })
      .catch(() => {});
  }, []);

  // Sprint 3 Part D: when arriving with a planId, look up linkedCampaignId
  // on the plan and preselect a default tracking link for that campaign.
  useEffect(() => {
    if (!contentPlanId || activeLink) return;
    let cancelled = false;
    (async () => {
      try {
        const planRes = await fetch(`/api/member/content-plans/${contentPlanId}`);
        if (!planRes.ok) return;
        const planData = await planRes.json();
        const linkedCampaignId: string | undefined = planData?.plan?.linkedCampaignId ?? undefined;
        if (!linkedCampaignId || cancelled) return;

        const [campaignsRes, linksRes] = await Promise.all([
          fetch("/api/campaigns"),
          fetch(`/api/campaigns/${linkedCampaignId}/links`),
        ]);
        if (cancelled) return;
        const campaignList: CampaignInfo[] = campaignsRes.ok ? await campaignsRes.json() : [];
        const linkList: CampaignLinkInfo[] = linksRes.ok ? await linksRes.json() : [];
        const campaign = campaignList.find((c) => c.id === linkedCampaignId);
        if (!campaign || linkList.length === 0 || cancelled) return;

        const firstLink = linkList[0];
        setActiveLink({
          campaignId: linkedCampaignId,
          campaignName: campaign.name,
          linkId: firstLink.id,
          linkName: firstLink.name,
          trackedUrl: firstLink.trackedUrl,
          isNew: false,
        });
        setLastPickedCampaignId(linkedCampaignId);
      } catch {
        // ignore — picker can still be opened manually
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentPlanId]);

  const openCampaignPicker = useCallback(async () => {
    setShowCampaignPicker(true);
    setNewLinkMode(false);
    setNewLinkName("");
    const preselect = lastPickedCampaignId || "";
    setPickerCampaignId(preselect);
    setCampaignPickerLinks([]);
    if (!campaignsLoaded) {
      setCampaignsLoading(true);
      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) setCampaigns(await res.json());
      } catch { /* ignore */ }
      setCampaignsLoaded(true);
      setCampaignsLoading(false);
    }
    if (preselect) {
      setCampaignPickerLinksLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${preselect}/links`);
        if (res.ok) setCampaignPickerLinks(await res.json());
      } catch { /* ignore */ }
      setCampaignPickerLinksLoading(false);
    }
  }, [campaignsLoaded, lastPickedCampaignId]);

  const handlePickerCampaignChange = useCallback(async (campaignId: string) => {
    setPickerCampaignId(campaignId);
    setNewLinkMode(false);
    setNewLinkName(title ? `${title} — YouTube Description` : "YouTube Description");
    setCampaignPickerLinks([]);
    if (campaignId) {
      setCampaignPickerLinksLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/links`);
        if (res.ok) setCampaignPickerLinks(await res.json());
      } catch { /* ignore */ }
      setCampaignPickerLinksLoading(false);
    }
  }, [title]);

  const pickExistingLink = useCallback((link: CampaignLinkInfo) => {
    const campaign = campaigns.find((c) => c.id === pickerCampaignId);
    setActiveLink({
      campaignId: pickerCampaignId,
      campaignName: campaign?.name || "",
      linkId: link.id,
      linkName: link.name,
      trackedUrl: link.trackedUrl,
      isNew: false,
    });
    setLastPickedCampaignId(pickerCampaignId);
    setShowCampaignPicker(false);
  }, [campaigns, pickerCampaignId]);

  const createNewLink = useCallback(async () => {
    if (!pickerCampaignId || !newLinkName.trim()) return;
    setCreatingLink(true);
    try {
      const res = await fetch(`/api/campaigns/${pickerCampaignId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLinkName.trim(),
          source: "youtube",
          destinationOverride: "landing_page",
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const campaign = campaigns.find((c) => c.id === pickerCampaignId);
        setActiveLink({
          campaignId: pickerCampaignId,
          campaignName: campaign?.name || "",
          linkId: created.id,
          linkName: created.name,
          trackedUrl: created.trackedUrl,
          isNew: true,
        });
        setLastPickedCampaignId(pickerCampaignId);
        setShowCampaignPicker(false);
      }
    } catch { /* ignore */ }
    setCreatingLink(false);
  }, [pickerCampaignId, newLinkName, campaigns]);

  const generate = useCallback(async () => {
    if (!title.trim() || !transcript.trim()) {
      setError("Video title and transcript are required.");
      return;
    }
    setGenerating(true);
    aiThinking.start();
    setError("");
    setDescription("");
    setCopied(false);
    setSavedToPlan(false);
    try {
      const res = await fetch("/api/ai-tools/description-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          transcript: transcript.trim(),
          trackingUrl: activeLink?.trackedUrl || null,
          contentPlanId: contentPlanId || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setDescription(data.description);
      } else {
        setError(data.error || "Generation failed. Please try again.");
      }
    } catch {
      setError("Generation failed. Please try again.");
    } finally {
      aiThinking.stop();
      setGenerating(false);
    }
  }, [title, transcript, activeLink, contentPlanId]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [description]);

  const saveBoilerplate = useCallback(async () => {
    setSavingBoilerplate(true);
    setBoilerplateSaved(false);
    try {
      const res = await fetch("/api/member/profile/boilerplate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boilerplate }),
      });
      if (res.ok) {
        setBoilerplateSaved(true);
        setTimeout(() => setBoilerplateSaved(false), 2000);
      }
    } catch { /* ignore */ }
    setSavingBoilerplate(false);
  }, [boilerplate]);

  const saveToContentPlan = useCallback(async (planId: string) => {
    setSavingToPlan(true);
    try {
      const res = await fetch(`/api/member/content-plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeDescription: description }),
      });
      if (res.ok) {
        setSavedToPlan(true);
        setContentPlanId(planId);
        setShowPlanPicker(false);

        // Mirror the title tool: also write a PlanArtifact of type "description"
        // so the plan's progress track ticks the Description step. Best-effort —
        // swallow errors so the plan-field save still wins.
        try {
          await fetch(`/api/member/content-plans/${planId}/artifacts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "description",
              content: description,
              metadata: { savedAt: new Date().toISOString() },
            }),
          });
        } catch (err) {
          console.error("[description-generator] artifact save failed:", err);
        }
      }
    } catch { /* ignore */ }
    setSavingToPlan(false);
  }, [description]);

  const handleSaveToPlan = useCallback(async () => {
    if (contentPlanId) {
      await saveToContentPlan(contentPlanId);
    } else {
      try {
        const res = await fetch("/api/member/content-plans");
        if (res.ok) {
          const plans = await res.json();
          setContentPlans(plans.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })));
        }
      } catch { /* ignore */ }
      setShowPlanPicker(true);
    }
  }, [contentPlanId, saveToContentPlan]);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        emoji="📝"
        title="Description Generator"
        description="Generate SEO-optimised YouTube descriptions from your video transcript"
      />

      {contentPlanId && <LinkedPlanBanner planId={contentPlanId} />}

      {/* INPUT SECTION */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#2f3437]/10 dark:border-white/10 shadow-sm p-6 space-y-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/60 mb-1">Video Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Calgary Real Estate Market Update — April 2026"
            className="w-full border border-[#2f3437]/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white bg-white dark:bg-[#111] placeholder:text-[#2f3437]/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/60 mb-1">Transcript or Script</label>
          <MarkdownTextarea
            value={transcript}
            onChange={setTranscript}
            rows={8}
            placeholder="Paste your video transcript or script here..."
            ariaLabel="Transcript or Script"
          />
          {transcript.length > 0 && (
            <p className="text-xs text-[#2f3437]/40 dark:text-white/40 mt-1">{transcript.length.toLocaleString()} characters</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/60 mb-1">Landing Page Tracking Link <span className="font-normal text-[#2f3437]/40 dark:text-white/30">(optional)</span></label>
          {activeLink ? (
            <div className="flex items-center gap-2 bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-[#6ba3c7] shrink-0">Campaign</span>
              <span className="text-xs text-[#2f3437]/50 dark:text-white/50">{activeLink.campaignName}</span>
              <span className="text-xs font-medium text-[#2f3437] dark:text-white flex-1 truncate">{activeLink.linkName}</span>
              {activeLink.isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">New</span>}
              <button onClick={() => setActiveLink(null)} className="text-sm text-[#2f3437]/40 hover:text-[#2f3437]/70 shrink-0">✕</button>
            </div>
          ) : (
            <button
              onClick={openCampaignPicker}
              className="w-full border border-dashed border-[#2f3437]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437]/40 dark:text-white/40 hover:border-[#6ba3c7]/40 hover:text-[#6ba3c7] transition-colors text-left"
            >
              + Select or create a tracking link
            </button>
          )}
        </div>

        <button
          onClick={generate}
          disabled={generating || !title.trim() || !transcript.trim()}
          className="w-full bg-[#6ba3c7] text-white font-medium rounded-lg py-2.5 text-sm hover:bg-[#5a8fb3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? "Generating…" : "Generate Description"}
        </button>
        {generating && (
          <div className="mt-3">
            <AiThinking mode="phase" phaseLabel={aiThinking.phaseLabel} />
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* OUTPUT SECTION */}
      {description && (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#2f3437]/10 dark:border-white/10 shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-[#2f3437] dark:text-white">Generated Description</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyToClipboard}
                className="text-xs bg-[#2f3437] dark:bg-white text-white dark:text-[#1a1a1a] px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                onClick={handleSaveToPlan}
                disabled={savingToPlan}
                className="text-xs bg-[#6ba3c7] text-white px-3 py-1.5 rounded-lg hover:bg-[#5a8fb3] disabled:opacity-50 transition-colors"
              >
                {savedToPlan ? "Saved!" : savingToPlan ? "Saving…" : "Save to Content Plan"}
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="text-xs border border-[#2f3437]/10 dark:border-white/10 text-[#2f3437]/60 dark:text-white/60 px-3 py-1.5 rounded-lg hover:bg-[#f8f8f6] dark:hover:bg-white/5 transition-colors"
              >
                Regenerate
              </button>
            </div>
          </div>
          <div className="bg-[#f8f8f6] dark:bg-[#111] rounded-lg p-4 whitespace-pre-wrap font-mono text-sm text-[#2f3437] dark:text-white/80 leading-relaxed">
            {description}
          </div>
        </div>
      )}

      {/* BOILERPLATE SECTION */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#2f3437]/10 dark:border-white/10 shadow-sm overflow-hidden">
        <button
          onClick={() => setBoilerplateExpanded(!boilerplateExpanded)}
          className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium text-[#2f3437]/60 dark:text-white/60 hover:bg-[#f8f8f6] dark:hover:bg-white/5 transition-colors"
        >
          <span>Your Boilerplate (contact info &amp; social links)</span>
          <span className="text-xs">{boilerplateExpanded ? "▲" : "▼"}</span>
        </button>
        {boilerplateExpanded && (
          <div className="px-6 pb-5 space-y-3 border-t border-[#2f3437]/5 dark:border-white/5 pt-4">
            <p className="text-xs text-[#2f3437]/40 dark:text-white/40">This text is automatically appended to every generated description. Save it once, use it everywhere.</p>
            <MarkdownTextarea
              value={boilerplate}
              onChange={(v: string) => { setBoilerplate(v); setBoilerplateSaved(false); }}
              rows={6}
              placeholder={"We'd love to hear from you! 👇\n\n📱 (555) 123-4567\n📧 info@yourbusiness.com\n📷 https://www.instagram.com/you/"}
              ariaLabel="Boilerplate"
            />
            <button
              onClick={saveBoilerplate}
              disabled={savingBoilerplate}
              className="text-xs bg-[#2f3437] dark:bg-white text-white dark:text-[#1a1a1a] px-4 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-50 transition-opacity"
            >
              {boilerplateSaved ? "Saved!" : savingBoilerplate ? "Saving…" : "Save Boilerplate"}
            </button>
          </div>
        )}
      </div>

      {/* CAMPAIGN PICKER MODAL */}
      {showCampaignPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCampaignPicker(false)}>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Select Tracking Link</h3>
              <button onClick={() => setShowCampaignPicker(false)} className="text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white">✕</button>
            </div>
            {campaignsLoading ? (
              <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Loading campaigns…</p>
            ) : (
              <select
                value={pickerCampaignId}
                onChange={(e) => handlePickerCampaignChange(e.target.value)}
                className="w-full border border-[#2f3437]/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white bg-white dark:bg-[#111]"
              >
                <option value="">Select a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.linkCount} links)</option>
                ))}
              </select>
            )}
            {pickerCampaignId && !newLinkMode && (
              <div className="space-y-2">
                {campaignPickerLinksLoading ? (
                  <p className="text-xs text-[#2f3437]/40 dark:text-white/40">Loading links…</p>
                ) : (
                  <>
                    {campaignPickerLinks.map((link) => (
                      <button
                        key={link.id}
                        onClick={() => pickExistingLink(link)}
                        className="w-full text-left border border-[#2f3437]/10 dark:border-white/10 rounded-lg px-3 py-2 hover:border-[#6ba3c7]/40 transition-colors"
                      >
                        <span className="text-sm font-medium text-[#2f3437] dark:text-white">{link.name}</span>
                        <span className="text-xs text-[#2f3437]/40 dark:text-white/40 ml-2">{link.clicks} clicks</span>
                      </button>
                    ))}
                    <button
                      onClick={() => { setNewLinkMode(true); setNewLinkName(title ? `${title} — YouTube Description` : "YouTube Description"); }}
                      className="w-full text-left text-xs text-[#6ba3c7] hover:text-[#5a8fb3] py-1"
                    >
                      + Create new link in this campaign
                    </button>
                  </>
                )}
              </div>
            )}
            {pickerCampaignId && newLinkMode && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  placeholder="Link name"
                  className="w-full border border-[#2f3437]/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white bg-white dark:bg-[#111]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createNewLink}
                    disabled={creatingLink || !newLinkName.trim()}
                    className="text-xs bg-[#6ba3c7] text-white px-4 py-1.5 rounded-lg hover:bg-[#5a8fb3] disabled:opacity-50"
                  >
                    {creatingLink ? "Creating…" : "Create Link"}
                  </button>
                  <button onClick={() => setNewLinkMode(false)} className="text-xs text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white px-3 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENT PLAN PICKER MODAL */}
      {showPlanPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPlanPicker(false)}>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">Save to Content Plan</h3>
              <button onClick={() => setShowPlanPicker(false)} className="text-[#2f3437]/40 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white">✕</button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {contentPlans.length === 0 ? (
                <p className="text-xs text-[#2f3437]/40 dark:text-white/40">No content plans found.</p>
              ) : (
                contentPlans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => saveToContentPlan(plan.id)}
                    disabled={savingToPlan}
                    className="w-full text-left border border-[#2f3437]/10 dark:border-white/10 rounded-lg px-3 py-2 hover:border-[#6ba3c7]/40 transition-colors"
                  >
                    <span className="text-sm text-[#2f3437] dark:text-white">{plan.title || "Untitled Plan"}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DescriptionGeneratorPage() {
  return (
    <Suspense>
      <DescriptionGeneratorPageInner />
    </Suspense>
  );
}

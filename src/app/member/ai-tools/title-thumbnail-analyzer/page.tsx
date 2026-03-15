"use client";

import { useState, useRef } from "react";
import { PhotoIcon } from "@heroicons/react/24/outline";

interface AnalysisResult {
  thumbnail: {
    score: number;
    observations: string[];
    improvements: string[];
  };
  title: {
    score: number;
    framework_used: string;
    alternatives: string[];
    attraction_scores: {
      title_frameworks: number;
      approve_the_click: number;
      avatar_clarity: number;
    };
    observations: string[];
  };
  combined: {
    score: number;
    avatar_would_click: boolean;
    observations: string[];
    improvements: string[];
  };
  follow_up: string;
}

function ScoreGauge({ label, score, max = 20 }: { label: string; score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= (max * 0.75) ? "#22c55e" : score >= (max * 0.5) ? "#f59e0b" : "#ef4444";
  return (
    <div className="text-center">
      <div className="relative w-24 h-24 mx-auto mb-2">
        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[#1e2a38]">{score}</span>
          <span className="text-xs text-[#1e2a38]/40">/{max}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-[#1e2a38]">{label}</p>
    </div>
  );
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color = score >= 8 ? "bg-green-100 text-green-700" : score >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
      {label} <strong>{score}/10</strong>
    </span>
  );
}

export default function TitleThumbnailAnalyzerPage() {
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnail(file);
    const reader = new FileReader();
    reader.onloadend = () => setThumbnailPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function analyse() {
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    let thumbnailBase64: string | null = null;
    let thumbnailMimeType: string | null = null;

    if (thumbnail) {
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const [header, data] = dataUrl.split(",");
          thumbnailBase64 = data;
          thumbnailMimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
          resolve();
        };
        reader.readAsDataURL(thumbnail);
      });
    }

    const res = await fetch("/api/ai-tools/title-thumbnail-analyzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, thumbnailBase64, thumbnailMimeType }),
    });

    const data = await res.json();
    if (data.result) {
      setResult(data.result);
    } else {
      setError("Analysis failed. Please try again.");
    }
    setLoading(false);
  }

  function reset() {
    setTitle("");
    setThumbnail(null);
    setThumbnailPreview(null);
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Title & Thumbnail Analyzer</h1>
        <p className="text-[#1e2a38]/60 mt-1">Score your title and thumbnail against Attraction principles before you publish</p>
      </div>

      {!result ? (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Video Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Paste your video title here..."
                className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                Thumbnail <span className="font-normal text-[#1e2a38]/40">(optional — jpg, png, webp)</span>
              </label>
              {thumbnailPreview ? (
                <div className="relative inline-block">
                  <img src={thumbnailPreview} alt="Thumbnail preview" className="h-32 rounded-xl border border-[#1e2a38]/20 object-cover" />
                  <button
                    onClick={() => { setThumbnail(null); setThumbnailPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 bg-[#ff0033] text-white w-5 h-5 rounded-full text-xs flex items-center justify-center hover:bg-[#ff0033]/80"
                  >×</button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#1e2a38]/20 rounded-xl cursor-pointer hover:border-[#3dc3ff]/50 transition-colors">
                  <PhotoIcon className="w-8 h-8 text-[#1e2a38]/20 mb-2" />
                  <span className="text-sm text-[#1e2a38]/40">Click to upload thumbnail</span>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>

            {error && <p className="text-sm text-[#ff0033]">{error}</p>}

            <button
              onClick={analyse}
              disabled={loading || !title.trim()}
              className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Analysing..." : "Analyse"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Score gauges */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-6 text-center">Cognitive Dissonance Scores</h2>
            <div className="grid grid-cols-3 gap-4">
              <ScoreGauge label="Thumbnail" score={result.thumbnail.score} />
              <ScoreGauge label="Title" score={result.title.score} />
              <ScoreGauge label="Combined" score={result.combined.score} />
            </div>
          </div>

          {/* Attraction principle scores */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-4">Attraction Principle Scores</h2>
            <div className="flex flex-wrap gap-2">
              <ScoreBadge label="Title Frameworks" score={result.title.attraction_scores.title_frameworks} />
              <ScoreBadge label="Approve the Click" score={result.title.attraction_scores.approve_the_click} />
              <ScoreBadge label="Avatar Clarity" score={result.title.attraction_scores.avatar_clarity} />
            </div>
            {result.title.framework_used && (
              <p className="text-sm text-[#1e2a38]/60 mt-3">Framework detected: <strong>{result.title.framework_used}</strong></p>
            )}
          </div>

          {/* Thumbnail analysis */}
          {result.thumbnail.observations.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <h2 className="font-semibold text-[#1e2a38] mb-4">Thumbnail Analysis</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Observations</p>
                  <ul className="space-y-1.5">
                    {result.thumbnail.observations.map((o, i) => <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-[#3dc3ff]">•</span>{o}</li>)}
                  </ul>
                </div>
                {result.thumbnail.improvements.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Improvements</p>
                    <ul className="space-y-1.5">
                      {result.thumbnail.improvements.map((o, i) => <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-amber-500">→</span>{o}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Title analysis */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-4">Title Analysis</h2>
            {result.title.observations.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Observations</p>
                <ul className="space-y-1.5">
                  {result.title.observations.map((o, i) => <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-[#3dc3ff]">•</span>{o}</li>)}
                </ul>
              </div>
            )}
            {result.title.alternatives.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Improved Alternatives</p>
                <ul className="space-y-2">
                  {result.title.alternatives.map((a, i) => (
                    <li key={i} className="bg-[#f1f1ef] rounded-lg px-4 py-2.5 text-sm font-medium text-[#1e2a38]">
                      {i + 1}. {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Combined analysis */}
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <h2 className="font-semibold text-[#1e2a38] mb-4">Combined Analysis</h2>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${result.combined.avatar_would_click ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {result.combined.avatar_would_click ? "✓ Avatar would click" : "✗ Avatar unlikely to click"}
              </span>
            </div>
            {result.combined.observations.length > 0 && (
              <ul className="space-y-1.5 mb-3">
                {result.combined.observations.map((o, i) => <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-[#3dc3ff]">•</span>{o}</li>)}
              </ul>
            )}
            {result.combined.improvements.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#1e2a38]/40 uppercase tracking-wide mb-2">Improvements</p>
                <ul className="space-y-1.5">
                  {result.combined.improvements.map((o, i) => <li key={i} className="text-sm text-[#1e2a38] flex gap-2"><span className="text-amber-500">→</span>{o}</li>)}
                </ul>
              </>
            )}
          </div>

          {result.follow_up && (
            <p className="text-sm text-[#1e2a38]/60 italic text-center">{result.follow_up}</p>
          )}

          <button
            onClick={reset}
            className="w-full border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors"
          >
            Analyse Another
          </button>
        </div>
      )}
    </div>
  );
}

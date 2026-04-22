"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ClipboardDocumentIcon, PrinterIcon } from "@heroicons/react/24/outline";
import AuditReportView from "@/components/audit-report/AuditReportView";

export default function SharedReportPage() {
  const params = useParams();
  const auditId = params.auditId as string;

  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${auditId}`);
    if (!res.ok) {
      setError(res.status === 403 ? "You don't have access to this report." : "Report not found.");
      setLoading(false);
      return;
    }
    const d = await res.json();
    setAudit(d.audit ?? d);
    setLoading(false);
  }, [auditId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f6f3]">
        <p className="text-[#2f3437]/40">Loading report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f6f3]">
        <div className="text-center">
          <p className="text-[#2f3437]/60 mb-2">{error}</p>
          <a href="/login" className="text-sm text-[#6ba3c7] hover:underline">
            Sign in to view this report
          </a>
        </div>
      </div>
    );
  }

  if (!audit) return null;

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    window.print();
  }

  const chrome = (
    <div className="flex items-center justify-between no-print">
      <span className="text-xs font-bold text-[#2f3437] tracking-tight">
        Attraction by Video
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
        >
          <ClipboardDocumentIcon className="w-4 h-4" />
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[#2f3437]/70 transition-colors"
        >
          <PrinterIcon className="w-4 h-4" />
          Print / PDF
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f3] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <AuditReportView audit={audit} chrome={chrome} />
      </div>
    </div>
  );
}

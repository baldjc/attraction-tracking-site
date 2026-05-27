"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import AuditReportView from "@/components/audit-report/AuditReportView";

export default function AuditReportPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.auditId as string;

  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/audits/${auditId}`);
    if (res.ok) {
      const d = await res.json();
      setAudit(d.audit ?? d);
    }
    setLoading(false);
  }, [auditId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!confirm("Delete this audit? This cannot be undone.")) return;
    setDeleting(true);
    await fetch(`/api/audits/${auditId}`, { method: "DELETE" });
    router.push(audit?.user?.id ? `/admin/members/${audit.user.id}` : "/admin/members");
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/reports/${auditId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--abv-text)]/40">
        Loading report…
      </div>
    );
  }
  if (!audit) {
    return <div className="text-center py-20 text-[var(--abv-text)]/50">Report not found.</div>;
  }

  const member = audit.user;
  const isLead = audit.auditType === "lead";
  const backHref = isLead
    ? member?.id
      ? `/admin/members/${member.id}`
      : "/admin/leads"
    : `/admin/members/${member?.id}`;
  const backLabel = isLead
    ? `Back to ${member?.fullName ?? "Lead"}`
    : `Back to ${member?.fullName ?? "Member"}`;

  const chrome = (
    <div className="flex items-center justify-between no-print">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        {backLabel}
      </Link>
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[var(--abv-text)]/70 transition-colors"
        >
          <ClipboardDocumentIcon className="w-4 h-4" />
          {copied ? "Copied!" : "Share Report"}
        </button>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[var(--abv-text)]/70 transition-colors"
        >
          <PrinterIcon className="w-4 h-4" />
          Print / PDF
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-crimson)]/60 hover:text-[var(--abv-crimson)] disabled:opacity-40 transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );

  return <AuditReportView audit={audit} chrome={chrome} />;
}

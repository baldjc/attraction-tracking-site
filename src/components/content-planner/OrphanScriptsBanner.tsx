"use client";

import { useEffect, useState } from "react";
import OrphanScriptsModal from "./OrphanScriptsModal";

const DISMISS_KEY = "abv_orphan_scripts_dismissed";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface OrphanScript {
  id: string;
  videoTitle: string;
  createdAt: string;
  scriptOpening: string;
}

export default function OrphanScriptsBanner() {
  const [scripts, setScripts] = useState<OrphanScript[]>([]);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < THIRTY_DAYS_MS) {
      return;
    }
    fetch("/api/ai-tools/saved-scripts?unlinked=true")
      .then((r) => r.json())
      .then((d) => {
        const list: OrphanScript[] = Array.isArray(d?.scripts) ? d.scripts : [];
        if (list.length > 0) {
          setScripts(list);
          setHidden(false);
        }
      })
      .catch(() => {});
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  function handleClose(linkedAny: boolean) {
    setOpen(false);
    // Once the user has worked through the modal (linked or skipped each one),
    // dismiss the banner for 30 days regardless of outcome — we don't want to
    // nag them every page load if they intentionally skipped.
    if (linkedAny) {
      fetch("/api/ai-tools/saved-scripts?unlinked=true")
        .then((r) => r.json())
        .then((d) => {
          const list: OrphanScript[] = Array.isArray(d?.scripts) ? d.scripts : [];
          setScripts(list);
        })
        .catch(() => {});
    }
    handleDismiss();
  }

  if (hidden || scripts.length === 0) return null;

  return (
    <>
      <div className="bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
        <span className="text-lg shrink-0">📎</span>
        <p className="text-sm text-[#2f3437] flex-1">
          You have <span className="font-semibold">{scripts.length}</span>{" "}
          script{scripts.length === 1 ? "" : "s"} not linked to a plan.{" "}
          <button
            onClick={() => setOpen(true)}
            className="font-semibold text-[#6ba3c7] hover:text-[#5490b5] underline"
          >
            Link them →
          </button>
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-[#2f3437]/40 hover:text-[#2f3437] text-sm shrink-0"
        >
          ✕
        </button>
      </div>

      {open && <OrphanScriptsModal scripts={scripts} onClose={handleClose} />}
    </>
  );
}

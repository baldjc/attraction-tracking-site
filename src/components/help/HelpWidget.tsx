"use client";

import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import HelpChat from "./HelpChat";

export default function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-[380px] h-[500px] max-sm:bottom-0 max-sm:right-0 max-sm:w-full max-sm:h-[80vh] animate-fade-in-up">
          <div className="w-full h-full bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-[#2a2a2a] rounded-2xl max-sm:rounded-b-none shadow-2xl overflow-hidden">
            <HelpChat onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Kit assistant" : "Open Kit assistant"}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all ${
          open
            ? "bg-[#2f3437] dark:bg-white"
            : `bg-[#6ba3c7] hover:bg-[#6ba3c7]/90 ${pulse ? "ring-4 ring-[#6ba3c7]/30 animate-pulse" : ""}`
        }`}
      >
        {open ? (
          <XMarkIcon className="w-5 h-5 text-white dark:text-[#1a1a1a]" />
        ) : (
          <span className="text-lg leading-none">🤖</span>
        )}
      </button>
    </>
  );
}

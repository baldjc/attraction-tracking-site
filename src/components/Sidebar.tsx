"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  HomeIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  StarIcon,
  BookOpenIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";

interface SidebarProps {
  role: string;
  userName: string;
}

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Foundations Members", icon: UsersIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
  { href: "/admin/campaigns", label: "Campaigns", icon: LinkIcon },
  { href: "/admin/analytics", label: "Analytics", icon: ChartBarIcon },
  { href: "/admin/settings", label: "Settings", icon: Cog6ToothIcon },
];

const memberLinks = [
  { href: "/member/scores", label: "My Scores", icon: StarIcon },
  { href: "/member/links", label: "My Links", icon: LinkIcon },
  { href: "/member/resources", label: "Resources", icon: BookOpenIcon },
  { href: "/member/settings", label: "Settings", icon: Cog6ToothIcon },
];

export default function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = role === "admin" ? adminLinks : memberLinks;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href === "/admin" || href === "/member/scores") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const sidebarInner = (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-white/10 flex-shrink-0">
        <Link href={role === "admin" ? "/admin" : "/member/scores"} className="block">
          <span className="text-2xl font-extrabold text-[#3dc3ff] tracking-tight">ABV</span>
          <p className="text-xs text-white/40 mt-0.5">Attraction by Video</p>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-[#3dc3ff]/20 text-[#3dc3ff]"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="leading-tight">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">{userName}</p>
          <p className="text-xs text-white/40 mt-0.5">
            {role === "admin" ? "Admin" : "Foundations Member"}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150 w-full"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#1e2a38] flex items-center px-4 gap-3 shadow-lg">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          aria-label="Open navigation menu"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        <span className="text-[#3dc3ff] font-extrabold text-xl tracking-tight">ABV</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-[#1e2a38] shadow-2xl transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10"
          aria-label="Close menu"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        {sidebarInner}
      </aside>

      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] bg-[#1e2a38] shadow-xl z-30">
        {sidebarInner}
      </aside>
    </>
  );
}

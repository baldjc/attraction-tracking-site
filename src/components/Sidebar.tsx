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
import { useState } from "react";

interface SidebarProps {
  role: string;
  userName: string;
}

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Members", icon: UsersIcon },
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

  function isActive(href: string) {
    if (href === "/admin" || href === "/member/scores") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const nav = (
    <>
      <div className="p-6 border-b border-[#1e2a38]/20">
        <Link href={role === "admin" ? "/admin" : "/member/scores"} className="block">
          <h1 className="text-2xl font-bold text-[#3dc3ff]">ABV</h1>
          <p className="text-sm text-white/60 mt-0.5">Attraction by Video</p>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[#3dc3ff]/20 text-[#3dc3ff]"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#1e2a38]/20">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium text-white">{userName}</p>
          <p className="text-xs text-white/50 capitalize">
            {role === "admin" ? "Admin" : "Foundations Member"}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors w-full"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#1e2a38] text-white rounded-lg"
      >
        <Bars3Icon className="w-6 h-6" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-[#1e2a38] flex flex-col transform transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-white/70 hover:text-white"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#1e2a38]">
        {nav}
      </aside>
    </>
  );
}

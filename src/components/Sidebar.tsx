"use client";

import Link from "next/link";
import MemberPickerModal from "@/components/admin/MemberPickerModal";
import { usePathname, useRouter } from "next/navigation";
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
  PencilSquareIcon,
  SparklesIcon,
  ArrowLeftIcon,
  EyeIcon,
  ChevronDownIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  AcademicCapIcon,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect, useRef } from "react";
import { IMPERSONATE_LS_KEY, IMPERSONATE_COOKIE } from "@/lib/impersonate-constants";
import { useTheme } from "@/components/ThemeProvider";

interface FeatureFlags {
  campaigns?: boolean;
  ai_tools?: boolean;
  resources?: boolean;
  [key: string]: boolean | undefined;
}

interface SidebarProps {
  role: string;
  userName: string;
  featureFlags?: FeatureFlags | null;
}

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Foundations Members", icon: UsersIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
  { href: "/admin/academy", label: "Academy", icon: AcademicCapIcon },
  { href: "/admin/academy-manager", label: "Academy Manager", icon: WrenchScrewdriverIcon, badgeKey: "qaCallsPending" },
  { href: "/admin/ai-tools", label: "AI Tools", icon: SparklesIcon },
  { href: "/admin/hire", label: "Hire a Human", icon: UserGroupIcon, badgeKey: "hireWaitlist" },
  { href: "/admin/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon },
  { href: "/admin/analytics", label: "Member Analytics", icon: ChartBarIcon },
  { href: "/admin/settings", label: "Settings", icon: Cog6ToothIcon },
];

const editorLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Members", icon: UsersIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
];

const memberLinks = [
  { href: "/member/dashboard", label: "Dashboard", icon: HomeIcon, featureKey: null, colour: "#6ba3c7" },
  { href: "/member/scores", label: "My Scores", icon: StarIcon, featureKey: null, colour: "#F59E0B" },
  { href: "/member/academy", label: "Academy", icon: AcademicCapIcon, featureKey: null, colour: "#10B981" },
  { href: "/member/ai-tools", label: "AI Tools", icon: SparklesIcon, featureKey: "ai_tools", colour: "#6ba3c7" },
  { href: "/member/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon, featureKey: "campaigns", colour: "#E63946" },
  { href: "/member/hire", label: "Hire a Human", icon: UserGroupIcon, featureKey: null, colour: "#8B5CF6" },
  { href: "/member/settings", label: "Settings", icon: Cog6ToothIcon, featureKey: null, colour: "#6ba3c7" },
];

interface ImpersonateState {
  memberId: string;
  memberName: string;
}


export default function Sidebar({ role, userName, featureFlags }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonate, setImpersonate] = useState<ImpersonateState | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [qaCallsPending, setQaCallsPending] = useState(0);
  const [hireWaitlist, setHireWaitlist] = useState(0);

  const isStaff = role === "admin" || role === "editor";
  const isImpersonating = !!impersonate;

  useEffect(() => {
    if (role === "admin") {
      fetch("/api/admin/resources/review-queue?status=pending")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setQaCallsPending(d.entries?.length ?? 0))
        .catch(() => {});
      fetch("/api/admin/hire/waitlist/count")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setHireWaitlist(d.count ?? 0))
        .catch(() => {});
    }
  }, [role, pathname]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IMPERSONATE_LS_KEY);
      setImpersonate(raw ? JSON.parse(raw) : null);
    } catch {
      setImpersonate(null);
    }
    setShowSwitch(false);
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isStaffOnMemberView = isStaff && isImpersonating;

  const baseMemberLinks = memberLinks.filter((link) => {
    if (!link.featureKey || !featureFlags) return true;
    return featureFlags[link.featureKey] !== false;
  });

  const links = isStaffOnMemberView
    ? baseMemberLinks
    : role === "admin"
    ? adminLinks
    : role === "editor"
    ? editorLinks
    : baseMemberLinks;

  function isActive(href: string) {
    if (href === "/admin" || href === "/member/scores" || href === "/member/dashboard") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  async function exitImpersonation() {
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
      localStorage.removeItem(IMPERSONATE_LS_KEY);
    } catch { }
    setImpersonate(null);
    router.push("/admin");
  }


  const homeHref = isStaffOnMemberView
    ? "/member/dashboard"
    : role === "admin" || role === "editor"
    ? "/admin"
    : "/member/dashboard";

  const roleLabel = isStaffOnMemberView
    ? "Foundations Member"
    : role === "admin"
    ? "Admin"
    : role === "editor"
    ? "Editor"
    : "Foundations Member";

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Persistent view switcher bar — admin and editor only */}
      {isStaff && (
        <div
          className={`flex-shrink-0 px-3 py-2 flex items-center gap-2 ${
            isImpersonating ? "bg-[#e63946]" : "bg-[#6ba3c7]/20"
          }`}
        >
          {/* Label */}
          <EyeIcon className={`w-3.5 h-3.5 shrink-0 ${isImpersonating ? "text-white/80" : "text-white/50"}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${isImpersonating ? "text-white" : "text-white/60"}`}>
            {isImpersonating ? "Member" : "Admin"}
          </span>

          {/* Name + dropdown */}
          <button
            onClick={() => setShowSwitch((s) => !s)}
            className={`flex items-center gap-1.5 flex-1 min-w-0 text-left rounded-md px-2 py-1 transition-colors ${
              isImpersonating
                ? "bg-black/20 hover:bg-black/30"
                : "bg-white/10 hover:bg-white/15"
            }`}
          >
            <span className={`text-[11px] font-semibold truncate flex-1 ${isImpersonating ? "text-white" : "text-white/80"}`}>
              {isImpersonating ? impersonate!.memberName : userName}
            </span>
            <ChevronDownIcon className={`w-3 h-3 shrink-0 transition-transform ${showSwitch ? "rotate-180" : ""} ${isImpersonating ? "text-white/80" : "text-white/50"}`} />
          </button>

          {/* Exit button — impersonation only */}
          {isImpersonating && (
            <button
              onClick={exitImpersonation}
              className="flex items-center gap-1 text-[11px] font-semibold text-white/80 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeftIcon className="w-3 h-3" /> Exit
            </button>
          )}
        </div>
      )}

      {showSwitch && (
        <MemberPickerModal onClose={() => setShowSwitch(false)} />
      )}

      <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
        <Link href={homeHref} className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
          <img
            src="/logo-transparent.png"
            alt="Attraction by Video"
            className="h-8 w-auto object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {(() => {
          const badges: Record<string, number> = { qaCallsPending, hireWaitlist };
          const renderedSections = new Set<string>();
          return links.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            const sectionLabel = (link as any).section as string | undefined;
            const badgeKey = (link as any).badgeKey as string | undefined;
            const badgeCount = badgeKey ? (badges[badgeKey] ?? 0) : 0;

            const sectionHeader = sectionLabel && !renderedSections.has(sectionLabel) ? (() => {
              renderedSections.add(sectionLabel);
              return (
                <div key={`section-${sectionLabel}`} className="px-3 pt-4 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{sectionLabel}</p>
                </div>
              );
            })() : null;

            return (
              <div key={link.href}>
                {sectionHeader}
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors duration-200 border-l-2 ${
                    active
                      ? "border-[#6ba3c7] bg-white/10 text-white"
                      : "border-transparent text-white/60 hover:text-white hover:bg-white/8"
                  } ${sectionLabel ? "pl-6" : ""}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="leading-tight flex-1">{link.label}</span>
                  {badgeCount > 0 && (
                    <span className="bg-amber-500 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {badgeCount}
                    </span>
                  )}
                </Link>
              </div>
            );
          });
        })()}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">{userName}</p>
          <p className="text-xs text-white/40 mt-0.5">{roleLabel}</p>
        </div>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full"
          aria-label="Toggle dark mode"
        >
          {theme === "dark"
            ? <SunIcon className="w-5 h-5 shrink-0" />
            : <MoonIcon className="w-5 h-5 shrink-0" />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full"
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
      <div className={`lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3 transition-colors ${isImpersonating ? "bg-[#e63946]" : "bg-[#1e2a38]"}`}>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          aria-label="Open navigation menu"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        <img src="/logo-icon.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
        {isImpersonating ? (
          <span className="text-xs font-bold text-white uppercase tracking-widest">
            Member View
          </span>
        ) : (
          <img src="/logo-transparent.png" alt="Attraction by Video" className="h-6 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
        )}
        {isStaff && isImpersonating && (
          <button
            onClick={exitImpersonation}
            className="ml-auto flex items-center gap-1 bg-black/20 hover:bg-black/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-3 h-3" /> Exit
          </button>
        )}
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
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] bg-[#1e2a38] z-30">
        {sidebarInner}
      </aside>
    </>
  );
}

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
  ChevronLeftIcon,
  ChevronRightIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  AcademicCapIcon,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  RocketLaunchIcon,
  LinkIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
  MagnifyingGlassCircleIcon,
  LockClosedIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";
import { useTheme } from "@/components/ThemeProvider";
import { useSidebar } from "@/components/SidebarContext";
import HelpChat from "@/components/help/HelpChat";

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
  { href: "/admin/members", label: "Members", icon: UsersIcon },
  { href: "/admin/content-calendar", label: "Content Calendar", icon: CalendarDaysIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
  { href: "/admin/academy", label: "Academy", icon: AcademicCapIcon },
  { href: "/admin/academy-manager", label: "Academy Manager", icon: WrenchScrewdriverIcon, badgeKey: "qaCallsPending" },
  { href: "/admin/ai-tools", label: "AI Tools", icon: SparklesIcon },
  { href: "/admin/intelligence", label: "Intelligence", icon: MagnifyingGlassCircleIcon },
  { href: "/admin/hire", label: "Hire a Human", icon: UserGroupIcon, badgeKey: "hireWaitlist" },
  { href: "/admin/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon },
  { href: "/admin/settings", label: "Settings", icon: Cog6ToothIcon },
];

const editorLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Members", icon: UsersIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
];

const PRODUCTION_TIERS = ["editing_2", "editing_4", "mastery_2", "mastery_4", "done_with_you"];

const memberLinks = [
  { href: "/member/dashboard",       label: "Dashboard",       icon: HomeIcon,         featureKey: null,        colour: "#6ba3c7", tierRequired: null },
  { href: "/member/academy",         label: "Academy",         icon: AcademicCapIcon,  featureKey: null,        colour: "#10B981", tierRequired: null,           section: "Learn" },
  { href: "/member/scores",          label: "My Scores",       icon: StarIcon,         featureKey: null,        colour: "#F59E0B", tierRequired: null },
  { href: "/member/ai-tools",        label: "AI Tools",        icon: SparklesIcon,     featureKey: "ai_tools",  colour: "#6ba3c7", tierRequired: null,           section: "Create" },
  { href: "/member/my-work",         label: "My Work",         icon: FolderIcon,       featureKey: "ai_tools",  colour: "#6ba3c7", tierRequired: null },
  { href: "/member/content-planner", label: "Content Planner", icon: CalendarDaysIcon, featureKey: null,        colour: "#6ba3c7", tierRequired: PRODUCTION_TIERS },
  { href: "/member/generate-leads",  label: "Generate Leads",  icon: RocketLaunchIcon, featureKey: "campaigns", colour: "#E63946", tierRequired: null,           section: "Grow" },
  { href: "/member/client-hub",      label: "Client Hub",      icon: Squares2X2Icon,   featureKey: null,        colour: "#6ba3c7", tierRequired: PRODUCTION_TIERS },
  { href: "/member/my-calls",        label: "My Calls",        icon: VideoCameraIcon,  featureKey: null,        colour: "#6ba3c7", tierRequired: null,           section: "Support" },
  { href: "/member/hire",            label: "Hire a Human",    icon: UserGroupIcon,    featureKey: null,        colour: "#8B5CF6", tierRequired: null },
  { href: "/member/settings",        label: "Settings",        icon: Cog6ToothIcon,    featureKey: null,        colour: "#6ba3c7", tierRequired: null },
];

interface ImpersonateState {
  memberId: string;
  memberName: string;
}

export default function Sidebar({ role, userName, featureFlags }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const { collapsed, toggle: toggleCollapsed } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [impersonate, setImpersonate] = useState<ImpersonateState | null>(null);
  const [lockedTooltip, setLockedTooltip] = useState<string | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [qaCallsPending, setQaCallsPending] = useState(0);
  const [hireWaitlist, setHireWaitlist] = useState(0);
  const [memberTier, setMemberTier] = useState<string | null>(null);
  const [clientHubEnabled, setClientHubEnabled] = useState(true);

  const isStaff = role === "admin" || role === "editor";
  const isImpersonating = !!impersonate;

  useEffect(() => {
    if (role === "member") {
      fetch("/api/member/tier")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) {
            setMemberTier(d.serviceTier ?? null);
            setClientHubEnabled(d.clientHubEnabled ?? true);
          }
        })
        .catch(() => {});
    }
  }, [role]);

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

  const baseMemberLinks = memberLinks
    .filter((link) => {
      // Feature-flagged items get fully hidden (admin toggle)
      if (link.featureKey && featureFlags && featureFlags[link.featureKey] === false) return false;
      // Client Hub: also respect clientHubEnabled flag (hides completely when off)
      if (link.href === "/member/client-hub") {
        if (featureFlags && featureFlags["client_hub"] === false) return false;
        if (!clientHubEnabled) return false;
      }
      return true;
    })
    .map((link) => ({
      ...link,
      locked: !!(link.tierRequired && memberTier && !link.tierRequired.includes(memberTier)),
    }));

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
      {isStaff && !collapsed && (
        <div
          className={`flex-shrink-0 px-3 py-2 flex items-center gap-2 ${
            isImpersonating ? "bg-[#e63946]" : "bg-[#6ba3c7]/20"
          }`}
        >
          <EyeIcon className={`w-3.5 h-3.5 shrink-0 ${isImpersonating ? "text-white/80" : "text-white/50"}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${isImpersonating ? "text-white" : "text-white/60"}`}>
            {isImpersonating ? "Member" : "Admin"}
          </span>
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

      {/* Collapsed view switcher — icon only */}
      {isStaff && collapsed && (
        <div
          className={`flex-shrink-0 py-2 flex justify-center ${
            isImpersonating ? "bg-[#e63946]" : "bg-[#6ba3c7]/20"
          }`}
        >
          {isImpersonating ? (
            <button
              onClick={exitImpersonation}
              title="Exit member view"
              className="text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
          ) : (
            <EyeIcon className="w-4 h-4 text-white/50" />
          )}
        </div>
      )}

      {showSwitch && (
        <MemberPickerModal onClose={() => setShowSwitch(false)} />
      )}

      {/* Logo */}
      <div className={`border-b border-white/10 flex-shrink-0 flex items-center ${collapsed ? "px-3 py-4 justify-center" : "px-4 py-4"}`}>
        <Link href={homeHref} className="flex items-center gap-3 min-w-0">
          <img src="/logo-icon.png" alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
          {!collapsed && (
            <img
              src="/logo-transparent.png"
              alt="Attraction by Video"
              className="h-8 w-auto object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {(() => {
          const badges: Record<string, number> = { qaCallsPending, hireWaitlist };
          const renderedSections = new Set<string>();
          return links.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            const sectionLabel = (link as any).section as string | undefined;
            const badgeKey = (link as any).badgeKey as string | undefined;
            const badgeCount = badgeKey ? (badges[badgeKey] ?? 0) : 0;

            const sectionHeader = !collapsed && sectionLabel && !renderedSections.has(sectionLabel) ? (() => {
              renderedSections.add(sectionLabel);
              return (
                <div key={`section-${sectionLabel}`} className="px-3 pt-4 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{sectionLabel}</p>
                </div>
              );
            })() : null;

            const isLocked = !!(link as any).locked;

            return (
              <div key={link.href}>
                {sectionHeader}
                {isLocked ? (
                  <button
                    onClick={() => {
                      setLockedTooltip(lockedTooltip === link.label ? null : link.label);
                      setTimeout(() => setLockedTooltip(null), 3000);
                    }}
                    title={collapsed ? `${link.label} (locked)` : undefined}
                    className={`relative flex items-center gap-3 py-2.5 text-sm font-medium transition-colors duration-200 border-l-2 rounded-r-md w-full text-left opacity-40 cursor-not-allowed ${
                      collapsed ? "px-3 justify-center border-l-0" : "px-3"
                    } border-transparent text-white/60`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="leading-tight flex-1">{link.label}</span>
                        <LockClosedIcon className="w-3.5 h-3.5 text-white/30 shrink-0" />
                      </>
                    )}
                    {collapsed && (
                      <LockClosedIcon className="absolute top-1 right-1 w-2.5 h-2.5 text-white/30" />
                    )}
                  </button>
                ) : (
                  <Link
                    href={link.href}
                    title={collapsed ? link.label : undefined}
                    className={`flex items-center gap-3 py-2.5 text-sm font-medium transition-colors duration-200 border-l-2 rounded-r-md ${
                      collapsed ? "px-3 justify-center border-l-0" : "px-3"
                    } ${
                      active
                        ? "border-[#6ba3c7] bg-white/10 text-white"
                        : "border-transparent text-white/60 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="leading-tight flex-1">{link.label}</span>
                        {badgeCount > 0 && (
                          <span className="bg-amber-500 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {badgeCount}
                          </span>
                        )}
                      </>
                    )}
                    {collapsed && badgeCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
                    )}
                  </Link>
                )}
                {!collapsed && lockedTooltip === link.label && isLocked && (
                  <div className="ml-8 mt-1 mb-1 bg-[#1e2a38] border border-white/10 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                    {link.label === "Content Planner" && "Unlocks with Production membership — manage your video pipeline"}
                    {link.label === "Client Hub" && "Unlocks with Production membership — your production assets and status"}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </nav>

      {/* Bottom: user info + actions */}
      <div className={`border-t border-white/10 flex-shrink-0 py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold text-white truncate">{userName}</p>
            <p className="text-xs text-white/40 mt-0.5">{roleLabel}</p>
          </div>
        )}
        <button
          onClick={() => setHelpOpen((v) => !v)}
          title="Kit assistant"
          className={`flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md lg:hidden ${collapsed ? "px-3 justify-center" : "px-3"}`}
        >
          <span className="text-base leading-none shrink-0">🤖</span>
          {!collapsed && <span>Kit assistant</span>}
        </button>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className={`flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md ${collapsed ? "px-3 justify-center" : "px-3"}`}
        >
          {theme === "dark"
            ? <SunIcon className="w-5 h-5 shrink-0" />
            : <MoonIcon className="w-5 h-5 shrink-0" />}
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign out" : undefined}
          className={`flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md ${collapsed ? "px-3 justify-center" : "px-3"}`}
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle — desktop only, bottom of sidebar */}
      <div className={`flex-shrink-0 border-t border-white/5 py-2 ${collapsed ? "flex justify-center" : "px-3"}`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex items-center gap-2 py-2 text-xs text-white/30 hover:text-white/70 transition-colors duration-200 rounded-md hover:bg-white/5 ${collapsed ? "px-3" : "px-3 w-full"}`}
        >
          {collapsed ? (
            <ChevronRightIcon className="w-4 h-4 shrink-0" />
          ) : (
            <>
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Kit assistant panel — mobile only, triggered from sidebar */}
      {helpOpen && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[60] h-[80vh] animate-fade-in-up">
          <div className="w-full h-full bg-white dark:bg-[#1a1a1a] border-t border-[#2f3437]/10 dark:border-[#2a2a2a] shadow-2xl overflow-hidden rounded-t-2xl">
            <HelpChat onClose={() => setHelpOpen(false)} />
          </div>
        </div>
      )}

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
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-[#1e2a38] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex justify-end px-3 pt-3 pb-1 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(false)}
            className="text-white/50 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
            aria-label="Close menu"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {sidebarInner}
        </div>
      </aside>

      {/* Desktop fixed sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 bg-[#1e2a38] z-30 transition-all duration-300 ease-in-out ${
          collapsed ? "lg:w-16" : "lg:w-[260px]"
        }`}
      >
        {sidebarInner}
      </aside>
    </>
  );
}

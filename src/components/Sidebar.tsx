"use client";

import Link from "next/link";
import MemberPickerModal from "@/components/admin/MemberPickerModal";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { tierLabel } from "@/lib/service-tier";
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
  ChevronUpIcon,
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
  ClockIcon,
  ArrowTrendingUpIcon,
  ChartBarSquareIcon,
  QuestionMarkCircleIcon,
  BellIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect, useRef } from "react";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";
import { useTheme } from "@/components/ThemeProvider";
import { useSidebar } from "@/components/SidebarContext";
import HelpChat from "@/components/help/HelpChat";
import TeamAccountSwitcher from "@/components/team/TeamAccountSwitcher";

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
  { href: "/admin", label: "Dashboard", icon: HomeIcon, section: null as string | null },
  { href: "/admin/members", label: "Members", icon: UsersIcon, section: "People" },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon, section: "People" },
  { href: "/admin/leads", label: "Leads", icon: UserGroupIcon, section: "People" },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon, section: "People" },
  { href: "/admin/academy-manager", label: "Academy Manager", icon: WrenchScrewdriverIcon, section: "Content", badgeKey: "qaCallsPending" },
  { href: "/admin/academy", label: "Academy", icon: AcademicCapIcon, section: "Content" },
  { href: "/admin/content-calendar", label: "Content Planner", icon: CalendarDaysIcon, section: "Content" },
  { href: "/admin/team-pipeline", label: "Team Pipeline", icon: VideoCameraIcon, section: "Content", featureKey: "team_pipeline" },
  { href: "/admin/ai-tools", label: "Content Tools", icon: SparklesIcon, section: "Content" },
  { href: "/admin/flow-metrics", label: "Flow Metrics", icon: ArrowTrendingUpIcon, section: "Content", featureKey: "flow_metrics" },
  { href: "/admin/intelligence", label: "Intelligence", icon: MagnifyingGlassCircleIcon, section: "Growth" },
  { href: "/admin/reviewer", label: "Analytics Reviewer", icon: ArrowTrendingUpIcon, section: "Growth", featureKey: "tool_analytics_reviewer" },
  { href: "/admin/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon, section: "Growth" },
  { href: "/admin/hire", label: "Hire a Human", icon: UserGroupIcon, section: "Growth", badgeKey: "hireWaitlist" },
  { href: "/admin/activity-log", label: "Activity Log", icon: ClockIcon, section: "System" },
  { href: "/admin/beta-cohort", label: "Beta Cohort", icon: UserGroupIcon, section: "System" },
  { href: "/admin/settings", label: "Settings", icon: Cog6ToothIcon, section: "System" },
];

const editorLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon, section: null as string | null },
  { href: "/admin/members", label: "Members", icon: UsersIcon, section: "People" },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon, section: "People" },
  { href: "/admin/leads", label: "Leads", icon: UserGroupIcon, section: "People" },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon, section: "People" },
  { href: "/admin/academy-manager", label: "Academy Manager", icon: WrenchScrewdriverIcon, section: "Content", badgeKey: "qaCallsPending" },
  { href: "/admin/academy", label: "Academy", icon: AcademicCapIcon, section: "Content" },
  { href: "/admin/content-calendar", label: "Content Planner", icon: CalendarDaysIcon, section: "Content" },
  { href: "/admin/team-pipeline", label: "Team Pipeline", icon: VideoCameraIcon, section: "Content", featureKey: "team_pipeline" },
  { href: "/admin/ai-tools", label: "Content Tools", icon: SparklesIcon, section: "Content" },
  { href: "/admin/flow-metrics", label: "Flow Metrics", icon: ArrowTrendingUpIcon, section: "Content", featureKey: "flow_metrics" },
  { href: "/admin/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon, section: "Growth" },
  { href: "/admin/activity-log", label: "Activity Log", icon: ClockIcon, section: "System" },
];

const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];

// IA: Dashboard sits above semantic groups (CREATE / IMPROVE / GROW /
// ADVANCED / WORKSPACE). The two primary homes lead CREATE: the Content
// Manager (Jarvis chat — "doing") and the Content Planner (the home base
// where the month's content lives). The standalone tool grid is demoted to
// a secondary "Advanced Tools" entry — most of it is reachable by chatting
// with the Content Manager. Help + Notifications stay in the footer; Live
// Calls remains an Academy sub-tab and is intentionally not in the primary nav.
const memberLinks = [
  // Home
  { href: "/member/dashboard",       label: "Dashboard",       icon: HomeIcon,                 featureKey: null,        colour: "var(--abv-azure)",   tierRequired: null },

  // CREATE — the two homes lead: Content Manager (chat) + Content Planner (home base)
  { href: "/member/jarvis",          label: "Content Manager", icon: ChatBubbleLeftRightIcon,  featureKey: "tool_jarvis", colour: "var(--abv-ai-tools)", tierRequired: null,          section: "CREATE" },
  // Content Planner also carries section: "CREATE" so the header survives when
  // the (flag-gated) Content Manager link above is filtered out for a member.
  { href: "/member/content-planner", label: "Content Planner", icon: CalendarDaysIcon,         featureKey: null,        colour: "var(--abv-azure)",   tierRequired: PRODUCTION_TIERS, section: "CREATE" },
  { href: "/member/market-data",     label: "Market Data",     icon: ChartBarSquareIcon,       featureKey: "tool_market_data",            colour: "var(--abv-azure)",   tierRequired: null },
  { href: "/member/knowledge-base",  label: "Knowledge Base",  icon: BookOpenIcon,             featureKey: "tool_neighbourhood_knowledge", colour: "var(--abv-azure)",   tierRequired: null },

  // IMPROVE
  { href: "/member/scores",          label: "My Scores",       icon: StarIcon,                 featureKey: null,        colour: "var(--abv-scores)",  tierRequired: null,           section: "IMPROVE",   featureColour: "var(--abv-scores)" },
  { href: "/member/academy",         label: "Academy",         icon: AcademicCapIcon,          featureKey: null,        colour: "var(--abv-academy)", tierRequired: null,                                 featureColour: "var(--abv-academy)" },
  { href: "/member/my-calls",        label: "My Calls",        icon: VideoCameraIcon,          featureKey: null,        colour: "var(--abv-azure)",   tierRequired: null,                                 badgeKey: "unwatched_calls" },

  // GROW
  { href: "/member/generate-leads",  label: "Generate Leads",  icon: RocketLaunchIcon,         featureKey: "campaigns", colour: "var(--abv-leads)",   tierRequired: null,           section: "GROW",      featureColour: "var(--abv-leads)" },
  { href: "/member/hire",            label: "Hire a Human",    icon: UserGroupIcon,            featureKey: null,        colour: "var(--abv-hire)",    tierRequired: null,                                 featureColour: "var(--abv-hire)" },

  // ADVANCED — power-user tool grid; most of this is reachable via the Content Manager chat
  { href: "/member/content-tools",   label: "Advanced Tools",  icon: WrenchScrewdriverIcon,    featureKey: "ai_tools",  colour: "var(--abv-ai-tools)", tierRequired: null,           section: "ADVANCED",  badgeKey: "unread_tools" },

  // WORKSPACE
  { href: "/member/my-work",         label: "My Work",         icon: FolderIcon,               featureKey: "ai_tools",  colour: "var(--abv-ai-tools)", tierRequired: null,           section: "WORKSPACE" },
  { href: "/member/client-hub",      label: "Client Hub",      icon: Squares2X2Icon,           featureKey: null,        colour: "var(--abv-azure)",   tierRequired: PRODUCTION_TIERS },
  { href: "/member/settings",        label: "Settings",        icon: Cog6ToothIcon,            featureKey: null,        colour: "var(--abv-azure)",   tierRequired: null },
];

interface ImpersonateState {
  memberId: string;
  memberName: string;
  /** Role of the impersonated user. When "editor", treat as Staff Admin view. */
  targetRole?: string;
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
  // Sprint 9: placeholders — badge counts wire up in a later sprint
  const [unreadTools] = useState(0);
  const [unwatchedCalls] = useState(0);
  const [memberTier, setMemberTier] = useState<string | null>(null);
  const [clientHubEnabled, setClientHubEnabled] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const isStaff = role === "admin" || role === "editor";
  const isImpersonating = !!impersonate;

  useEffect(() => {
    const imp = !!impersonate;
    const impStaff = imp && impersonate?.targetRole === "editor";
    const staffOnMember =
      (role === "admin" || role === "editor") && imp && !impStaff;
    // Fetch the member's REAL tier for the sidebar label + link gating. Runs for
    // a member viewing their own sidebar AND for staff impersonating a member —
    // the impersonation cookie makes /api/member/tier resolve to that member, so
    // the label reflects who you're working as, not a hardcoded tier.
    if (role === "member" || staffOnMember) {
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
  }, [role, impersonate]);

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
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isImpersonatingStaff = isImpersonating && impersonate?.targetRole === "editor";
  const isStaffOnMemberView = isStaff && isImpersonating && !isImpersonatingStaff;

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

  const links = isImpersonatingStaff
    ? editorLinks
    : isStaffOnMemberView
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

  const homeHref = isImpersonatingStaff
    ? "/admin"
    : isStaffOnMemberView
    ? "/member/dashboard"
    : role === "admin" || role === "editor"
    ? "/admin"
    : "/member/dashboard";

  // Member-view label reflects the member's REAL service tier (e.g. "Done With
  // You Member"), never a hardcoded tier. Falls back to a neutral "Member" while
  // the tier fetch is in flight rather than flashing a wrong tier.
  const memberTierLabel = memberTier ? `${tierLabel(memberTier)} Member` : "Member";
  const roleLabel = isImpersonatingStaff
    ? "Staff Admin"
    : isStaffOnMemberView
    ? memberTierLabel
    : role === "admin"
    ? "Admin"
    : role === "editor"
    ? "Staff Admin"
    : memberTierLabel;

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Persistent view switcher bar — admin and editor only */}
      {isStaff && !collapsed && (
        <div
          className={`flex-shrink-0 px-3 py-2 flex items-center gap-2 ${
            isImpersonatingStaff
              ? "bg-amber-500"
              : isImpersonating
              ? "bg-[#e63946]"
              : "bg-[var(--abv-dark)]/20"
          }`}
        >
          <EyeIcon className={`w-3.5 h-3.5 shrink-0 ${isImpersonating ? "text-white/80" : "text-white/50"}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${isImpersonating ? "text-white" : "text-white/60"}`}>
            {isImpersonatingStaff ? "Staff Admin" : isImpersonating ? "Member" : "Admin"}
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
            isImpersonatingStaff
              ? "bg-amber-500"
              : isImpersonating
              ? "bg-[#e63946]"
              : "bg-[var(--abv-dark)]/20"
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
        <Link href={homeHref} className="flex items-center gap-3 min-w-0" aria-label="Attraction by Video">
          <img
            src="/logo-icon.png"
            alt=""
            className="h-10 w-10 object-contain shrink-0"
          />
          {!collapsed && (
            <span
              className="text-white text-[17px] leading-none whitespace-nowrap"
              style={{
                fontFamily: '"Cabinet Grotesk", system-ui, sans-serif',
                fontWeight: 900,
                letterSpacing: "-0.02em",
              }}
            >
              Attraction{" "}
              <span
                style={{
                  fontWeight: 900,
                  color: "var(--abv-azure)",
                }}
              >
                by
              </span>{" "}
              video
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {(() => {
          const badges: Record<string, number> = {
            qaCallsPending,
            hireWaitlist,
            unread_tools: unreadTools,
            unwatched_calls: unwatchedCalls,
          };
          const renderedSections = new Set<string>();
          return links.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            const sectionLabel = (link as any).section as string | undefined;
            const badgeKey = (link as any).badgeKey as string | undefined;
            const badgeCount = badgeKey ? (badges[badgeKey] ?? 0) : 0;
            const featureColour = (link as any).featureColour as string | undefined;

            // Sprint 9: mono-uppercase group label with extra vertical breathing room
            const sectionHeader = !collapsed && sectionLabel && !renderedSections.has(sectionLabel) ? (() => {
              renderedSections.add(sectionLabel);
              return (
                <div key={`section-${sectionLabel}`} className="px-3 pt-5 pb-1">
                  <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold tracking-[0.10em] uppercase text-white/30">{sectionLabel}</p>
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
                        ? "border-[var(--abv-azure)] bg-white/10 text-white"
                        : "border-transparent text-white/60 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="leading-tight flex-1">{link.label}</span>
                        {/* Sprint 9: feature dot — only when item has featureColour and no badge */}
                        {featureColour && badgeCount === 0 && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: featureColour }}
                            aria-hidden
                          />
                        )}
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
                  <div className="ml-8 mt-1 mb-1 bg-[var(--abv-dark)] border border-white/10 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                    {link.label === "Content Planner" && "Unlocks with Production membership — manage your video pipeline"}
                    {link.label === "Client Hub" && "Unlocks with Production membership — your production assets and status"}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </nav>

      {/* Bottom: user info + actions (collapsible dropdown when expanded) */}
      <div
        ref={userMenuRef}
        className={`border-t border-white/10 flex-shrink-0 py-2 ${collapsed ? "px-2" : "px-3"}`}
      >
        {collapsed ? (
          <>
            <button
              onClick={() => setHelpOpen((v) => !v)}
              title="Help"
              className="flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md px-3 justify-center"
            >
              <QuestionMarkCircleIcon className="w-5 h-5 shrink-0" />
            </button>
            {/* Sprint 9: NotificationBell placeholder — wires up in Sprint 1.6 */}
            <button
              type="button"
              title="Notifications"
              className="flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md px-3 justify-center"
            >
              <BellIcon className="w-5 h-5 shrink-0" />
            </button>
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md px-3 justify-center"
            >
              {theme === "dark"
                ? <SunIcon className="w-5 h-5 shrink-0" />
                : <MoonIcon className="w-5 h-5 shrink-0" />}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex items-center gap-3 py-2.5 text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md px-3 justify-center"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5 shrink-0" />
            </button>
          </>
        ) : (
          <>
            {/* Expanded actions — render above the trigger so the up-arrow opens upward */}
            {userMenuOpen && (
              <div className="mb-1 space-y-0.5">
                <button
                  onClick={() => { setHelpOpen((v) => !v); setUserMenuOpen(false); }}
                  className="flex items-center gap-3 py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md"
                >
                  <QuestionMarkCircleIcon className="w-5 h-5 shrink-0" />
                  <span>Help</span>
                </button>
                {/* Sprint 9: NotificationBell placeholder */}
                <button
                  type="button"
                  className="flex items-center gap-3 py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md"
                >
                  <BellIcon className="w-5 h-5 shrink-0" />
                  <span>Notifications</span>
                </button>
                <TeamAccountSwitcher />
                <button
                  onClick={() => { toggleTheme(); }}
                  className="flex items-center gap-3 py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md"
                >
                  {theme === "dark"
                    ? <SunIcon className="w-5 h-5 shrink-0" />
                    : <MoonIcon className="w-5 h-5 shrink-0" />}
                  <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center gap-3 py-2.5 px-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors duration-200 w-full rounded-md"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5 shrink-0" />
                  <span>Sign out</span>
                </button>
                <div className="border-t border-white/10 my-1" />
              </div>
            )}

            {/* Trigger — always visible when expanded */}
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-white/5 transition-colors duration-200 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{userName}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{roleLabel}</p>
              </div>
              {userMenuOpen
                ? <ChevronDownIcon className="w-4 h-4 shrink-0 text-white/40" />
                : <ChevronUpIcon className="w-4 h-4 shrink-0 text-white/40" />}
            </button>
          </>
        )}
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
      {/* Kit assistant panel — mobile: bottom drawer, desktop: popup near sidebar */}
      {helpOpen && (
        <div
          className={`fixed z-[60] animate-fade-in-up
            max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:h-[80vh]
            lg:bottom-6 lg:w-[380px] lg:h-[500px] ${collapsed ? "lg:left-20" : "lg:left-[272px]"}`}
        >
          <div className="w-full h-full bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-[#2a2a2a] shadow-2xl overflow-hidden rounded-t-2xl lg:rounded-2xl">
            <HelpChat onClose={() => setHelpOpen(false)} />
          </div>
        </div>
      )}

      {/* Mobile top bar */}
      <div className={`lg:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3 transition-colors ${isImpersonating ? "bg-[#e63946]" : "bg-[var(--abv-dark)]"}`}>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          aria-label="Open navigation menu"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        <img
          src="/logo-icon.png"
          alt=""
          className="h-8 w-8 object-contain shrink-0"
        />
        {isImpersonating ? (
          <span className="text-xs font-bold text-white uppercase tracking-widest">
            Member View
          </span>
        ) : (
          <span
            className="text-white text-[15px] leading-none whitespace-nowrap"
            style={{
              fontFamily: '"Cabinet Grotesk", system-ui, sans-serif',
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            Attraction{" "}
            <span
              style={{
                fontWeight: 900,
                color: "var(--abv-azure)",
              }}
            >
              by
            </span>{" "}
            video
          </span>
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
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-[var(--abv-dark)] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
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
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 bg-[var(--abv-dark)] z-30 transition-all duration-300 ease-in-out ${
          collapsed ? "lg:w-16" : "lg:w-[260px]"
        }`}
      >
        {sidebarInner}
      </aside>
    </>
  );
}

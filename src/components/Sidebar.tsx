"use client";

import Link from "next/link";
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
  MagnifyingGlassIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  AcademicCapIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect, useRef } from "react";
import { IMPERSONATE_LS_KEY } from "@/lib/impersonate-constants";
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
  { href: "/admin/ai-tools", label: "AI Tools", icon: SparklesIcon },
  { href: "/member/campaigns", label: "Campaigns", icon: LinkIcon },
  { href: "/member/analytics", label: "Lead Analytics", icon: ChartBarIcon },
  { href: "/admin/analytics", label: "Member Analytics", icon: ChartBarIcon },
  { href: "/member/link-tracking", label: "Link Tracking Settings", icon: LinkIcon },
  { href: "/member/resources", label: "Member Resources", icon: BookOpenIcon, section: "Resources" },
  { href: "/admin/resources/lessons", label: "Course Lessons", icon: AcademicCapIcon, section: "Resources" },
  { href: "/admin/resources/qa-calls", label: "Q&A Calls", icon: VideoCameraIcon, section: "Resources", badgeKey: "qaCallsPending" },
  { href: "/admin/settings", label: "Settings", icon: Cog6ToothIcon },
];

const editorLinks = [
  { href: "/member/dashboard", label: "Dashboard", icon: HomeIcon, featureKey: null },
  { href: "/member/ai-tools", label: "AI Tools", icon: SparklesIcon, featureKey: "ai_tools" },
  { href: "/member/campaigns", label: "Campaigns", icon: LinkIcon, featureKey: "campaigns" },
  { href: "/member/analytics", label: "Lead Analytics", icon: ChartBarIcon, featureKey: "campaigns" },
  { href: "/member/settings", label: "Settings", icon: Cog6ToothIcon, featureKey: null },
];

const memberLinks = [
  { href: "/member/dashboard", label: "Dashboard", icon: HomeIcon, featureKey: null },
  { href: "/member/scores", label: "My Scores", icon: StarIcon, featureKey: null },
  { href: "/member/ai-tools", label: "AI Tools", icon: SparklesIcon, featureKey: "ai_tools" },
  { href: "/member/campaigns", label: "Campaigns", icon: LinkIcon, featureKey: "campaigns" },
  { href: "/member/analytics", label: "Lead Analytics", icon: ChartBarIcon, featureKey: "campaigns" },
  { href: "/member/link-tracking", label: "Link Tracking Settings", icon: LinkIcon, featureKey: "campaigns" },
  { href: "/member/resources", label: "Resources", icon: BookOpenIcon, featureKey: "resources" },
  { href: "/member/settings", label: "Settings", icon: Cog6ToothIcon, featureKey: null },
];

interface ImpersonateState {
  memberId: string;
  memberName: string;
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
}

function SwitchMemberDropdown({
  current,
  onClose,
}: {
  current: ImpersonateState;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.fullName ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-[#3dc3ff]"
          />
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-gray-50">
        {loading ? (
          <li className="px-3 py-4 text-xs text-center text-gray-400">Loading…</li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-4 text-xs text-center text-gray-400">No members found</li>
        ) : filtered.map((m) => {
          const name = m.fullName ?? m.email;
          const isCurrent = m.id === current.memberId;
          return (
            <li key={m.id}>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/admin/impersonate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ memberId: m.id }),
                    });
                    if (!res.ok) return;
                    try {
                      localStorage.setItem(IMPERSONATE_LS_KEY, JSON.stringify({ memberId: m.id, memberName: name }));
                    } catch { }
                  } catch {
                    return;
                  }
                  window.location.reload();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[#3dc3ff]/5 transition-colors ${isCurrent ? "bg-amber-50" : ""}`}
              >
                <UserCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1e2a38] truncate">{name}</p>
                  {m.fullName && <p className="text-[10px] text-gray-400 truncate">{m.email}</p>}
                </div>
                {isCurrent && <span className="text-[10px] text-amber-600 font-semibold shrink-0">Current</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Sidebar({ role, userName, featureFlags }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonate, setImpersonate] = useState<ImpersonateState | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [qaCallsPending, setQaCallsPending] = useState(0);

  useEffect(() => {
    if (role === "admin") {
      fetch("/api/admin/resources/review-queue?status=pending")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setQaCallsPending(d.entries?.length ?? 0))
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

  const isAdminOnMemberView =
    role === "admin" && !!impersonate && !pathname.startsWith("/admin");
  const isEditorOnMemberView =
    role === "editor" && !!impersonate;
  const isStaffOnMemberView = isAdminOnMemberView || isEditorOnMemberView;

  const baseMemberLinks = memberLinks.filter((link) => {
    if (!link.featureKey || !featureFlags) return true;
    return featureFlags[link.featureKey] !== false;
  });

  const links = isStaffOnMemberView
    ? baseMemberLinks
    : role === "admin"
    ? adminLinks
    : role === "editor"
    ? editorLinks.filter((l) => !l.featureKey || featureFlags?.[l.featureKey] !== false)
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
    if (role === "editor") {
      window.location.href = "/member/dashboard";
    } else {
      router.push("/admin");
    }
  }


  const homeHref = isStaffOnMemberView
    ? "/member/scores"
    : role === "admin"
    ? "/admin"
    : role === "editor"
    ? "/member/dashboard"
    : "/member/scores";

  const roleLabel = isStaffOnMemberView
    ? "Foundations Member"
    : role === "admin"
    ? "Admin"
    : role === "editor"
    ? "Editor"
    : "Foundations Member";

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Impersonation banner — admin or editor viewing a member */}
      {(isAdminOnMemberView || isEditorOnMemberView) && impersonate && (
        <div className="bg-amber-500 px-3 pt-2.5 pb-2 flex-shrink-0 relative">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <EyeIcon className="w-3.5 h-3.5 text-amber-900 shrink-0" />
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">Member View</span>
            </div>
            <button
              onClick={exitImpersonation}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:text-white transition-colors whitespace-nowrap"
            >
              <ArrowLeftIcon className="w-3 h-3" /> Exit
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSwitch((s) => !s)}
              className="flex items-center gap-1.5 w-full text-left bg-amber-600/30 hover:bg-amber-600/50 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <UserCircleIcon className="w-3.5 h-3.5 text-amber-900 shrink-0" />
              <span className="text-xs font-semibold text-amber-900 flex-1 truncate">{impersonate.memberName}</span>
              <ChevronDownIcon className={`w-3 h-3 text-amber-900 shrink-0 transition-transform ${showSwitch ? "rotate-180" : ""}`} />
            </button>
            {showSwitch && (
              <SwitchMemberDropdown
                current={impersonate}
                onClose={() => setShowSwitch(false)}
              />
            )}
          </div>
        </div>
      )}

      <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
        <Link href={homeHref} className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="" className="h-10 w-10 rounded-xl object-cover shrink-0" />
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
          const badges: Record<string, number> = { qaCallsPending };
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
                <div key={`section-${sectionLabel}`} className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{sectionLabel}</p>
                </div>
              );
            })() : null;

            return (
              <div key={link.href}>
                {sectionHeader}
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    active
                      ? "bg-[#3dc3ff]/20 text-[#3dc3ff]"
                      : "text-white/60 hover:text-white hover:bg-white/10"
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150 w-full"
          aria-label="Toggle dark mode"
        >
          {theme === "dark"
            ? <SunIcon className="w-5 h-5 shrink-0" />
            : <MoonIcon className="w-5 h-5 shrink-0" />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#1e2a38] dark:bg-[#0f1419] flex items-center px-4 gap-3 shadow-lg">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          aria-label="Open navigation menu"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
        <img src="/logo-icon.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
        <img src="/logo-transparent.png" alt="Attraction by Video" className="h-6 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
        {(isAdminOnMemberView || isEditorOnMemberView) && impersonate && (
          <button
            onClick={exitImpersonation}
            className="ml-auto flex items-center gap-1 bg-amber-500 text-amber-900 text-xs font-semibold px-3 py-1.5 rounded-lg"
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
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-[#1e2a38] dark:bg-[#0f1419] shadow-2xl transform transition-transform duration-300 ease-in-out ${
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
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] bg-[#1e2a38] dark:bg-[#0f1419] shadow-xl z-30">
        {sidebarInner}
      </aside>
    </>
  );
}

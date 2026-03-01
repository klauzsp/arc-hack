"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthSession } from "@/components/AuthProvider";
import type { Role } from "@/lib/role";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const adminNav = [
  { href: "/",           label: "Dashboard",  icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  { href: "/pay-runs",   label: "Pay Runs",   icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  { href: "/recipients", label: "Recipients", icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  { href: "/schedules",  label: "Schedules",  icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
  { href: "/holidays",   label: "Holidays",   icon: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" },
  { href: "/treasury",   label: "Treasury",   icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" },
  { href: "/policies",   label: "Policies",   icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
];

const baseEmployeeNav = [
  { href: "/my-earnings", label: "My Earnings", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
  { href: "/my-time",     label: "My Time",     icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const publicNav = [
  { href: "/",         label: "Dashboard", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  { href: "/sign-in",  label: "Sign In",   icon: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" },
  { href: "/treasury", label: "Treasury",  icon: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" },
  { href: "/policies", label: "Policies",  icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { employee } = useAuthSession();

  useEffect(() => {
    try {
      const s = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (s !== null) setCollapsed(s === "true");
    } catch { /* ignore */ }
  }, []);

  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
    return next;
  });

  const employeeNav = role === "employee" && employee?.onboardingMethod === "circle"
    ? [...baseEmployeeNav, { href: "/manage-wallet", label: "Manage Wallet", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" }]
    : baseEmployeeNav;

  const active = (href: string) => pathname === href || (href !== "/" && pathname?.startsWith(href));

  const item = (nav: { href: string; label: string; icon: string }) => {
    const on = active(nav.href);
    return (
      <Link
        key={nav.href}
        href={nav.href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? nav.label : undefined}
        className={[
          "relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150",
          collapsed ? "lg:justify-center lg:px-2" : "",
          on
            ? "bg-white/[0.08] text-white"
            : "text-white/40 hover:bg-white/[0.05] hover:text-white/80",
        ].join(" ")}
      >
        {on && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[#fc72ff]" />}
        <Icon d={nav.icon} />
        {!collapsed && <span className="truncate">{nav.label}</span>}
      </Link>
    );
  };

  const section = (title: string, items: typeof adminNav) => (
    <div key={title}>
      {!collapsed && (
        <p className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/20 first:mt-1">
          {title}
        </p>
      )}
      {collapsed && <div className="mt-4 first:mt-1" />}
      <div className="space-y-px">{items.map(item)}</div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Toggle menu"
        className="fixed left-3 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#1a1b1f] lg:hidden"
      >
        <svg className="h-4 w-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Sidebar */}
      <aside className={[
        "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col bg-[#0d0e0f] border-r border-white/[0.06]",
        "transition-[width,transform] duration-200 lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "w-[220px]",
        collapsed ? "lg:w-[56px]" : "lg:w-[220px]",
      ].join(" ")}>

        {/* Logo */}
        <div className={["flex h-[56px] shrink-0 items-center gap-3 border-b border-white/[0.06]", collapsed ? "lg:justify-center" : "px-4"].join(" ")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#fc72ff] to-[#7b61ff] text-[12px] font-black text-white shadow-lg shadow-[#fc72ff]/20">
            P
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold leading-none text-white">Payroll</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">by Arc</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-4 pt-2">
          {role === "admin" && <>{section("Admin", adminNav)}{section("Employee", employeeNav)}</>}
          {role === "employee" && section("Menu", employeeNav)}
          {role === null && (
            <>
              {section("Navigate", publicNav)}
              {!collapsed && (
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-[11px] font-semibold text-white/60">Connect a wallet</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                    CEO wallet unlocks admin tools. Employees use an access code.
                  </p>
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/[0.06] p-2.5">
          <div className={["flex items-center gap-2.5 rounded-xl px-2.5 py-2", collapsed ? "lg:justify-center" : ""].join(" ")}>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#fc72ff]/10">
              <svg className="h-3.5 w-3.5 text-[#fc72ff]" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
              </svg>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white/40">Arc Network</p>
                <p className="truncate text-[10px] text-white/20">Multi-chain USDC</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mt-1 hidden w-full items-center justify-center rounded-xl p-2 text-white/20 transition-colors hover:bg-white/[0.05] hover:text-white/50 lg:flex"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
              }
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

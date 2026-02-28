"use client";

import { usePathname } from "next/navigation";
import { useAuthSession } from "@/components/AuthProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/pay-runs": "Pay Runs",
  "/recipients": "Recipients",
  "/treasury": "Treasury",
  "/policies": "Policies",
  "/my-earnings": "My Earnings",
  "/my-time": "My Time",
};

function getTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/pay-runs/")) return "Pay Run Details";
  return routeTitles[pathname] ?? "Payroll";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { role } = useAuthSession();
  const title = getTitle(pathname ?? "/");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50/80">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

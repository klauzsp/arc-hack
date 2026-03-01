"use client";

import { usePathname } from "next/navigation";
import { useAuthSession } from "@/components/AuthProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/pay-runs": "Pay Runs",
  "/recipients": "Recipients",
  "/schedules": "Schedules",
  "/holidays": "Holidays",
  "/treasury": "Treasury",
  "/policies": "Policies",
  "/my-earnings": "My Earnings",
  "/my-time": "My Time",
  "/manage-wallet": "Manage Wallet",
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
    <div className="flex h-screen overflow-hidden bg-[#0d0e0f]">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-6xl px-5 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16 lg:px-10 lg:pt-12 lg:pb-20">{children}</div>
        </main>
      </div>
    </div>
  );
}

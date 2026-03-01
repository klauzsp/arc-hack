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
    <div className="flex min-h-screen bg-transparent">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <TopBar title={title} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-[1260px] px-2 pb-10 pt-6 sm:px-4 sm:pb-14 sm:pt-8 lg:px-6 lg:pb-16 lg:pt-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

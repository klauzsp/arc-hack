"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { useState } from "react";
import { MockPayrollProvider } from "@/components/MockPayrollProvider";
import { AuthProvider } from "@/components/AuthProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MockPayrollProvider>{children}</MockPayrollProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

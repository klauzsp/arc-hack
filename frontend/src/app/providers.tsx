"use client";

import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { useState } from "react";
import { PayrollProvider } from "@/components/PayrollProvider";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/contracts";
import { AuthProvider } from "@/components/AuthProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={ARC_TESTNET_CHAIN_ID}
          theme={lightTheme({
            accentColor: "#0f766e",
            accentColorForeground: "#ffffff",
            borderRadius: "medium",
          })}
        >
          <AuthProvider>
            <PayrollProvider>{children}</PayrollProvider>
          </AuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

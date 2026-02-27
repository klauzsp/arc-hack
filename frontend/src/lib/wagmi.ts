import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, foundry } from "viem/chains";

export const config = getDefaultConfig({
  appName: "ARC Hack",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [sepolia, foundry],
  ssr: true,
});

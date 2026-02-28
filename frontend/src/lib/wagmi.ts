import { createConfig, createStorage, http, noopStorage } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { foundry } from "viem/chains";
import { arcTestnet } from "./contracts";
import { publicConfig } from "./publicConfig";

const connectors =
  typeof window === "undefined"
    ? [metaMask(), injected()]
    : [
        ...connectorsForWallets(
          [
            {
              groupName: "Recommended",
              wallets: [
                metaMaskWallet,
                ...(publicConfig.walletConnectProjectId ? [walletConnectWallet] : []),
                injectedWallet,
              ],
            },
          ],
          {
            projectId: publicConfig.walletConnectProjectId ?? "missing-walletconnect-project-id",
            appName: "Arc Payroll",
            appDescription: "Arc payroll dashboard",
            appUrl: publicConfig.appUrl,
          },
        ),
      ];

export const config = createConfig({
  chains: [arcTestnet, foundry],
  connectors,
  ssr: true,
  storage: createStorage({
    storage:
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : noopStorage,
  }),
  transports: {
    [arcTestnet.id]: http(publicConfig.arcRpcUrl),
    [foundry.id]: http(),
  },
});

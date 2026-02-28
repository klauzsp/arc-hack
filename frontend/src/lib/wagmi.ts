import { createConfig, createStorage, http, injected, noopStorage } from "wagmi";
import { foundry } from "viem/chains";
import { arcTestnet } from "./contracts";

const connectors = [
  injected(),
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
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
    [foundry.id]: http(),
  },
});

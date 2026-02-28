import { createConfig, createStorage, http, injected, noopStorage } from "wagmi";
import { sepolia, foundry } from "viem/chains";

const connectors = [
  injected(),
];

export const config = createConfig({
  chains: [sepolia, foundry],
  connectors,
  ssr: true,
  storage: createStorage({
    storage:
      typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : noopStorage,
  }),
  transports: {
    [sepolia.id]: http(),
    [foundry.id]: http(),
  },
});

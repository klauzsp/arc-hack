import type { ChainBalance } from "./mockTypes";

export const mockChainBalances: ChainBalance[] = [
  { chainId: 1, chainName: "Arc (Hub)", usdcBalance: 245000 },
  { chainId: 11155111, chainName: "Ethereum", usdcBalance: 82000 },
  { chainId: 8453, chainName: "Base", usdcBalance: 54000 },
  { chainId: 42161, chainName: "Arbitrum", usdcBalance: 31000 },
];

export const mockTotalTreasuryUsdc = 412000;
export const mockTotalTreasuryUsyc = 185000;

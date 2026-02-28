import { defineChain, type Address } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5042002;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan Testnet",
      url: "https://testnet-explorer.arcscan.io",
    },
  },
  testnet: true,
});

export const CEO_ADDRESS: Address = "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0";

export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USYC_ADDRESS = (
  process.env.NEXT_PUBLIC_ARC_USYC_ADDRESS ?? "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C"
) as Address;
export const USYC_TELLER_ADDRESS = (
  process.env.NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS ?? "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A"
) as Address;
export const USYC_ENTITLEMENTS_ADDRESS: Address = "0xcc205224862c7641930c87679e98999d23c26113";

export const USYC_TELLER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_assets", type: "uint256" },
      { internalType: "address", name: "_receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_amount", type: "uint256" },
      { internalType: "address", name: "_receiver", type: "address" },
      { internalType: "address", name: "_account", type: "address" },
    ],
    name: "redeem",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

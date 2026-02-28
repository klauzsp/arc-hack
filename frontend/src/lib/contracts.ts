import { defineChain, type Address } from "viem";
import { publicConfig } from "./publicConfig";

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
      http: [publicConfig.arcRpcUrl],
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

export const CEO_ADDRESS = publicConfig.arcCeoAddress as Address;
export const CORE_ADDRESS = publicConfig.arcCoreAddress as Address;
export const PAYRUN_ADDRESS = publicConfig.arcPayRunAddress as Address;
export const REBALANCE_ADDRESS = publicConfig.arcRebalanceAddress as Address;
export const VESTING_ADDRESS = publicConfig.arcVestingAddress as Address;

export const USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const USYC_ADDRESS = publicConfig.arcUsycAddress as Address;
export const USYC_TELLER_ADDRESS = publicConfig.arcUsycTellerAddress as Address;
export const USYC_ENTITLEMENTS_ADDRESS: Address = "0xcc205224862c7641930c87679e98999d23c26113";
export const ARC_EXPLORER_BASE_URL = "https://testnet-explorer.arcscan.io";

export const CORE_ABI = [
  {
    name: "treasuryBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

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

export function explorerTxUrl(hash: string) {
  return `${ARC_EXPLORER_BASE_URL}/tx/${hash}`;
}

export function explorerAddressUrl(address: string) {
  return `${ARC_EXPLORER_BASE_URL}/address/${address}`;
}

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

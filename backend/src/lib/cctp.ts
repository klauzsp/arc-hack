export const IRIS_API_BASE_URL = "https://iris-api.circle.com";
export const IRIS_API_SANDBOX_BASE_URL = "https://iris-api-sandbox.circle.com";

export const CCTP_FAST_FINALITY_THRESHOLD = 1000;
export const CCTP_SLOW_FINALITY_THRESHOLD = 2000;
export const CCTP_FORWARDING_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;
export const ARC_TESTNET_CCTP_DOMAIN = 26;

export interface CctpRoute {
  preference: string;
  displayName: string;
  domain: number;
  evmChainId: number;
  rpcUrl: string;
  explorerTxBaseUrl: string;
  usdcAddress: `0x${string}`;
  tokenMessengerV2: `0x${string}`;
  messageTransmitterV2: `0x${string}`;
  forwarderSupported: boolean;
  fastSourceSupported: boolean;
  isTestnet: boolean;
}

// Values sourced from Circle's official @circle-fin/provider-cctp-v2 package v1.4.0.
export const CCTP_TESTNET_ROUTES: Record<string, CctpRoute> = {
  Arc: {
    preference: "Arc",
    displayName: "Arc Testnet",
    domain: 26,
    evmChainId: 5_042_002,
    rpcUrl: "https://rpc.testnet.arc.network/",
    explorerTxBaseUrl: "https://testnet.arcscan.app/tx/",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    tokenMessengerV2: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitterV2: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    forwarderSupported: true,
    fastSourceSupported: false,
    isTestnet: true,
  },
  Ethereum: {
    preference: "Ethereum",
    displayName: "Ethereum Sepolia",
    domain: 0,
    evmChainId: 11_155_111,
    rpcUrl: "https://sepolia.drpc.org",
    explorerTxBaseUrl: "https://sepolia.etherscan.io/tx/",
    usdcAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    tokenMessengerV2: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitterV2: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    forwarderSupported: true,
    fastSourceSupported: true,
    isTestnet: true,
  },
  Base: {
    preference: "Base",
    displayName: "Base Sepolia",
    domain: 6,
    evmChainId: 84_532,
    rpcUrl: "https://sepolia.base.org",
    explorerTxBaseUrl: "https://sepolia.basescan.org/tx/",
    usdcAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    tokenMessengerV2: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitterV2: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    forwarderSupported: true,
    fastSourceSupported: true,
    isTestnet: true,
  },
  Arbitrum: {
    preference: "Arbitrum",
    displayName: "Arbitrum Sepolia",
    domain: 3,
    evmChainId: 421_614,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerTxBaseUrl: "https://sepolia.arbiscan.io/tx/",
    usdcAddress: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
    tokenMessengerV2: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitterV2: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    forwarderSupported: true,
    fastSourceSupported: true,
    isTestnet: true,
  },
  Avalanche: {
    preference: "Avalanche",
    displayName: "Avalanche Fuji",
    domain: 1,
    evmChainId: 43_113,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerTxBaseUrl: "https://subnets-test.avax.network/c-chain/tx/",
    usdcAddress: "0x5425890298aed601595a70ab815c96711a31bc65",
    tokenMessengerV2: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
    messageTransmitterV2: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
    forwarderSupported: true,
    fastSourceSupported: true,
    isTestnet: true,
  },
};

const LEGACY_CHAIN_ID_TO_DOMAIN: Record<number, number> = {
  0: 0,
  1: 1,
  3: 3,
  6: 6,
  26: 26,
  43_113: 1,
  4_217: 1,
  84_532: 6,
  8_453: 6,
  421_614: 3,
  42_161: 3,
  11_155_111: 0,
  5_042_002: 26,
};

export interface CctpFeeTier {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee?: {
    low: number;
    med: number;
    high: number;
  };
}

export interface CctpAttestationMessage {
  eventNonce: string;
  status: string;
  attestation?: string;
  message?: string;
  forwardTxHash?: string;
  forwardState?: string;
  decodedMessage?: Record<string, unknown>;
}

export interface CctpAttestationResponse {
  messages: CctpAttestationMessage[];
}

function normalizePreference(preference: string | null | undefined) {
  const normalized = (preference ?? "Arc").trim().toLowerCase();
  if (normalized.includes("ethereum")) return "Ethereum";
  if (normalized.includes("base")) return "Base";
  if (normalized.includes("arbitrum")) return "Arbitrum";
  if (normalized.includes("avalanche")) return "Avalanche";
  return "Arc";
}

export function getCctpRouteByPreference(preference: string | null | undefined) {
  return CCTP_TESTNET_ROUTES[normalizePreference(preference)] ?? CCTP_TESTNET_ROUTES.Arc;
}

export function getCctpRouteByDomain(domain: number) {
  return Object.values(CCTP_TESTNET_ROUTES).find((route) => route.domain === domain) ?? null;
}

export function domainFromPreference(preference: string | null | undefined) {
  return getCctpRouteByPreference(preference).domain;
}

export function normalizeLegacyDestination(value: number | null | undefined) {
  if (value == null) return null;
  return LEGACY_CHAIN_ID_TO_DOMAIN[value] ?? value;
}

export function isArcDomain(domain: number) {
  return domain === ARC_TESTNET_CCTP_DOMAIN;
}

function irisBaseUrl(isTestnet: boolean) {
  return isTestnet ? IRIS_API_SANDBOX_BASE_URL : IRIS_API_BASE_URL;
}

export function buildAttestationUrl(sourceDomain: number, transactionHash: string, isTestnet: boolean) {
  return `${irisBaseUrl(isTestnet)}/v2/messages/${sourceDomain}?transactionHash=${transactionHash}`;
}

export function buildFastBurnFeeUrl(sourceDomain: number, destinationDomain: number, isTestnet: boolean) {
  return `${irisBaseUrl(isTestnet)}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`;
}

export function buildForwardingFeeUrl(sourceDomain: number, destinationDomain: number, isTestnet: boolean) {
  return `${buildFastBurnFeeUrl(sourceDomain, destinationDomain, isTestnet)}?forward=true`;
}

async function getJson<T>(url: string, validator: (value: unknown) => value is T): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Circle API request failed (${response.status} ${response.statusText}) for ${url}`);
  }
  const json = (await response.json()) as unknown;
  if (!validator(json)) {
    throw new Error(`Unexpected Circle API response for ${url}`);
  }
  return json;
}

function isFeeTierArray(value: unknown): value is CctpFeeTier[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { finalityThreshold?: unknown }).finalityThreshold === "number" &&
        typeof (entry as { minimumFee?: unknown }).minimumFee === "number",
    )
  );
}

function isAttestationResponse(value: unknown): value is CctpAttestationResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}

export async function fetchForwardingFee(
  sourceDomain: number,
  destinationDomain: number,
  isTestnet: boolean,
  finalityThreshold: number,
) {
  const tiers = await getJson(buildForwardingFeeUrl(sourceDomain, destinationDomain, isTestnet), isFeeTierArray);
  const tier = tiers.find((entry) => entry.finalityThreshold === finalityThreshold);
  if (!tier?.forwardFee) {
    throw new Error(`No forwarding fee tier available for ${sourceDomain} -> ${destinationDomain} @ ${finalityThreshold}.`);
  }
  return BigInt(Math.round(Number(tier.forwardFee.high)));
}

export async function fetchAttestationMessages(
  sourceDomain: number,
  transactionHash: string,
  isTestnet: boolean,
) {
  const url = buildAttestationUrl(sourceDomain, transactionHash, isTestnet);
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return { messages: [] } satisfies CctpAttestationResponse;
  }
  if (!response.ok) {
    throw new Error(`Circle API request failed (${response.status} ${response.statusText}) for ${url}`);
  }

  const json = (await response.json()) as unknown;
  if (!isAttestationResponse(json)) {
    throw new Error(`Unexpected Circle API response for ${url}`);
  }

  return json;
}

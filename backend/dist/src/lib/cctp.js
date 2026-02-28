"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CCTP_TESTNET_ROUTES = exports.ARC_TESTNET_CCTP_DOMAIN = exports.CCTP_FORWARDING_HOOK_DATA = exports.CCTP_SLOW_FINALITY_THRESHOLD = exports.CCTP_FAST_FINALITY_THRESHOLD = exports.IRIS_API_SANDBOX_BASE_URL = exports.IRIS_API_BASE_URL = void 0;
exports.getCctpRouteByPreference = getCctpRouteByPreference;
exports.getCctpRouteByDomain = getCctpRouteByDomain;
exports.domainFromPreference = domainFromPreference;
exports.normalizeLegacyDestination = normalizeLegacyDestination;
exports.isArcDomain = isArcDomain;
exports.buildAttestationUrl = buildAttestationUrl;
exports.buildFastBurnFeeUrl = buildFastBurnFeeUrl;
exports.buildForwardingFeeUrl = buildForwardingFeeUrl;
exports.fetchForwardingFee = fetchForwardingFee;
exports.fetchAttestationMessages = fetchAttestationMessages;
exports.IRIS_API_BASE_URL = "https://iris-api.circle.com";
exports.IRIS_API_SANDBOX_BASE_URL = "https://iris-api-sandbox.circle.com";
exports.CCTP_FAST_FINALITY_THRESHOLD = 1000;
exports.CCTP_SLOW_FINALITY_THRESHOLD = 2000;
exports.CCTP_FORWARDING_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000";
exports.ARC_TESTNET_CCTP_DOMAIN = 26;
// Values sourced from Circle's official @circle-fin/provider-cctp-v2 package v1.4.0.
exports.CCTP_TESTNET_ROUTES = {
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
const LEGACY_CHAIN_ID_TO_DOMAIN = {
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
function normalizePreference(preference) {
    const normalized = (preference ?? "Arc").trim().toLowerCase();
    if (normalized.includes("ethereum"))
        return "Ethereum";
    if (normalized.includes("base"))
        return "Base";
    if (normalized.includes("arbitrum"))
        return "Arbitrum";
    if (normalized.includes("avalanche"))
        return "Avalanche";
    return "Arc";
}
function getCctpRouteByPreference(preference) {
    return exports.CCTP_TESTNET_ROUTES[normalizePreference(preference)] ?? exports.CCTP_TESTNET_ROUTES.Arc;
}
function getCctpRouteByDomain(domain) {
    return Object.values(exports.CCTP_TESTNET_ROUTES).find((route) => route.domain === domain) ?? null;
}
function domainFromPreference(preference) {
    return getCctpRouteByPreference(preference).domain;
}
function normalizeLegacyDestination(value) {
    if (value == null)
        return null;
    return LEGACY_CHAIN_ID_TO_DOMAIN[value] ?? value;
}
function isArcDomain(domain) {
    return domain === exports.ARC_TESTNET_CCTP_DOMAIN;
}
function irisBaseUrl(isTestnet) {
    return isTestnet ? exports.IRIS_API_SANDBOX_BASE_URL : exports.IRIS_API_BASE_URL;
}
function buildAttestationUrl(sourceDomain, transactionHash, isTestnet) {
    return `${irisBaseUrl(isTestnet)}/v2/messages/${sourceDomain}?transactionHash=${transactionHash}`;
}
function buildFastBurnFeeUrl(sourceDomain, destinationDomain, isTestnet) {
    return `${irisBaseUrl(isTestnet)}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`;
}
function buildForwardingFeeUrl(sourceDomain, destinationDomain, isTestnet) {
    return `${buildFastBurnFeeUrl(sourceDomain, destinationDomain, isTestnet)}?forward=true`;
}
async function getJson(url, validator) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Circle API request failed (${response.status} ${response.statusText}) for ${url}`);
    }
    const json = (await response.json());
    if (!validator(json)) {
        throw new Error(`Unexpected Circle API response for ${url}`);
    }
    return json;
}
function isFeeTierArray(value) {
    return (Array.isArray(value) &&
        value.every((entry) => typeof entry === "object" &&
            entry !== null &&
            typeof entry.finalityThreshold === "number" &&
            typeof entry.minimumFee === "number"));
}
function isAttestationResponse(value) {
    return (typeof value === "object" &&
        value !== null &&
        Array.isArray(value.messages));
}
async function fetchForwardingFee(sourceDomain, destinationDomain, isTestnet, finalityThreshold) {
    const tiers = await getJson(buildForwardingFeeUrl(sourceDomain, destinationDomain, isTestnet), isFeeTierArray);
    const tier = tiers.find((entry) => entry.finalityThreshold === finalityThreshold);
    if (!tier?.forwardFee) {
        throw new Error(`No forwarding fee tier available for ${sourceDomain} -> ${destinationDomain} @ ${finalityThreshold}.`);
    }
    return BigInt(Math.round(Number(tier.forwardFee.high)));
}
async function fetchAttestationMessages(sourceDomain, transactionHash, isTestnet) {
    const url = buildAttestationUrl(sourceDomain, transactionHash, isTestnet);
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (response.status === 404) {
        return { messages: [] };
    }
    if (!response.ok) {
        throw new Error(`Circle API request failed (${response.status} ${response.statusText}) for ${url}`);
    }
    const json = (await response.json());
    if (!isAttestationResponse(json)) {
        throw new Error(`Unexpected Circle API response for ${url}`);
    }
    return json;
}

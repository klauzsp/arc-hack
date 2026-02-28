const DEFAULT_API_URL = "http://127.0.0.1:3001";
const DEFAULT_ARC_RPC_URL = "https://rpc.testnet.arc.network";
const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_CEO_ADDRESS = "0x13e00D9810d3C8Dc19A8C9A172fd9A8aC56e94e0";
const DEFAULT_CORE_ADDRESS = "0xa8ce1f3b7c71a9c577686c93c4e8b4924bb5c5ca";
const DEFAULT_PAYRUN_ADDRESS = "0xa5a046e6dc6a10bfd54d88be7744680392feed79";
const DEFAULT_REBALANCE_ADDRESS = "0x3504c84a71902d1af3a74ec50826db8b3a9f67d6";
const DEFAULT_VESTING_ADDRESS = "0x8688a03e4ec16b26dbaffa67a76fd2c3cebe7c68";
const DEFAULT_USYC_ADDRESS = "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const DEFAULT_USYC_TELLER_ADDRESS = "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A";

function readEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const apiUrl = readEnv(process.env.NEXT_PUBLIC_API_URL);
const arcRpcUrl = readEnv(process.env.NEXT_PUBLIC_ARC_RPC_URL);
const walletConnectProjectId = readEnv(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
const appUrl = readEnv(process.env.NEXT_PUBLIC_APP_URL);
const arcCeoAddress = readEnv(process.env.NEXT_PUBLIC_ARC_CEO_ADDRESS);
const arcCoreAddress = readEnv(process.env.NEXT_PUBLIC_ARC_CORE_ADDRESS);
const arcPayRunAddress = readEnv(process.env.NEXT_PUBLIC_ARC_PAYRUN_ADDRESS);
const arcRebalanceAddress = readEnv(process.env.NEXT_PUBLIC_ARC_REBALANCE_ADDRESS);
const arcVestingAddress = readEnv(process.env.NEXT_PUBLIC_ARC_VESTING_ADDRESS);
const arcUsycAddress = readEnv(process.env.NEXT_PUBLIC_ARC_USYC_ADDRESS);
const arcUsycTellerAddress = readEnv(process.env.NEXT_PUBLIC_ARC_USYC_TELLER_ADDRESS);
const circleAppId = readEnv(process.env.NEXT_PUBLIC_CIRCLE_APP_ID);

export const publicConfig = {
  apiUrl: apiUrl ?? DEFAULT_API_URL,
  apiUrlSource: apiUrl ? "env" : "default",
  arcRpcUrl: arcRpcUrl ?? DEFAULT_ARC_RPC_URL,
  arcRpcUrlSource: arcRpcUrl ? "env" : "default",
  walletConnectProjectId: walletConnectProjectId ?? null,
  walletConnectProjectIdSource: walletConnectProjectId ? "env" : "missing",
  appUrl: appUrl ?? DEFAULT_APP_URL,
  appUrlSource: appUrl ? "env" : "default",
  arcCeoAddress: arcCeoAddress ?? DEFAULT_CEO_ADDRESS,
  arcCeoAddressSource: arcCeoAddress ? "env" : "default",
  arcCoreAddress: arcCoreAddress ?? DEFAULT_CORE_ADDRESS,
  arcCoreAddressSource: arcCoreAddress ? "env" : "default",
  arcPayRunAddress: arcPayRunAddress ?? DEFAULT_PAYRUN_ADDRESS,
  arcPayRunAddressSource: arcPayRunAddress ? "env" : "default",
  arcRebalanceAddress: arcRebalanceAddress ?? DEFAULT_REBALANCE_ADDRESS,
  arcRebalanceAddressSource: arcRebalanceAddress ? "env" : "default",
  arcVestingAddress: arcVestingAddress ?? DEFAULT_VESTING_ADDRESS,
  arcVestingAddressSource: arcVestingAddress ? "env" : "default",
  arcUsycAddress: arcUsycAddress ?? DEFAULT_USYC_ADDRESS,
  arcUsycAddressSource: arcUsycAddress ? "env" : "default",
  arcUsycTellerAddress: arcUsycTellerAddress ?? DEFAULT_USYC_TELLER_ADDRESS,
  arcUsycTellerAddressSource: arcUsycTellerAddress ? "env" : "default",
  circleAppId: circleAppId ?? null,
  circleAppIdSource: circleAppId ? "env" : "missing",
} as const;

export function maskValue(value: string | null, visible = 6) {
  if (!value) return null;
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}...${value.slice(-4)}`;
}

import { NextResponse } from "next/server";
import { maskValue, publicConfig } from "@/lib/publicConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    apiUrl: publicConfig.apiUrl,
    apiUrlSource: publicConfig.apiUrlSource,
    arcRpcUrl: publicConfig.arcRpcUrl,
    arcRpcUrlSource: publicConfig.arcRpcUrlSource,
    appUrl: publicConfig.appUrl,
    appUrlSource: publicConfig.appUrlSource,
    walletConnectConfigured: Boolean(publicConfig.walletConnectProjectId),
    walletConnectProjectIdMasked: maskValue(publicConfig.walletConnectProjectId),
    walletConnectProjectIdSource: publicConfig.walletConnectProjectIdSource,
    arcCeoAddress: publicConfig.arcCeoAddress,
    arcCeoAddressSource: publicConfig.arcCeoAddressSource,
    arcCoreAddress: publicConfig.arcCoreAddress,
    arcCoreAddressSource: publicConfig.arcCoreAddressSource,
    arcPayRunAddress: publicConfig.arcPayRunAddress,
    arcPayRunAddressSource: publicConfig.arcPayRunAddressSource,
    arcRebalanceAddress: publicConfig.arcRebalanceAddress,
    arcRebalanceAddressSource: publicConfig.arcRebalanceAddressSource,
    arcVestingAddress: publicConfig.arcVestingAddress,
    arcVestingAddressSource: publicConfig.arcVestingAddressSource,
    arcUsycAddress: publicConfig.arcUsycAddress,
    arcUsycAddressSource: publicConfig.arcUsycAddressSource,
    arcUsycTellerAddress: publicConfig.arcUsycTellerAddress,
    arcUsycTellerAddressSource: publicConfig.arcUsycTellerAddressSource,
    circleAppIdConfigured: Boolean(publicConfig.circleAppId),
    circleAppIdSource: publicConfig.circleAppIdSource,
    circleGoogleClientIdConfigured: Boolean(publicConfig.circleGoogleClientId),
    circleGoogleClientIdSource: publicConfig.circleGoogleClientIdSource,
    note: "Restart the Next.js dev server after editing frontend/.env.local so public env values are rebuilt into the client bundle.",
  });
}

"use client";

export async function getCircleSdkDeviceId(appId: string) {
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  const sdk = new W3SSdk({
    appSettings: { appId },
  });
  return sdk.getDeviceId();
}

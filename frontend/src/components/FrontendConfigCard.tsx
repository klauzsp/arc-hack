"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";

type FrontendConfigResponse = {
  apiUrl: string;
  apiUrlSource: "env" | "default";
  arcRpcUrl: string;
  arcRpcUrlSource: "env" | "default";
  appUrl: string;
  appUrlSource: "env" | "default";
  walletConnectConfigured: boolean;
  walletConnectProjectIdMasked: string | null;
  walletConnectProjectIdSource: "env" | "missing";
  arcCeoAddress: string;
  arcCeoAddressSource: "env" | "default";
  arcCoreAddress: string;
  arcCoreAddressSource: "env" | "default";
  arcPayRunAddress: string;
  arcPayRunAddressSource: "env" | "default";
  arcRebalanceAddress: string;
  arcRebalanceAddressSource: "env" | "default";
  arcVestingAddress: string;
  arcVestingAddressSource: "env" | "default";
  arcUsycAddress: string;
  arcUsycAddressSource: "env" | "default";
  arcUsycTellerAddress: string;
  arcUsycTellerAddressSource: "env" | "default";
  circleAppIdConfigured: boolean;
  circleAppIdSource: "env" | "missing";
  circleGoogleClientIdConfigured: boolean;
  circleGoogleClientIdSource: "env" | "missing";
  note: string;
};

type BackendHealth = {
  ok: boolean;
  mode: string;
  stableFxConfigured?: boolean;
};

function sourceBadge(source: "env" | "default" | "missing") {
  if (source === "env") return <Badge variant="success">env</Badge>;
  if (source === "missing") return <Badge variant="warning">missing</Badge>;
  return <Badge>default</Badge>;
}

export function FrontendConfigCard() {
  const [config, setConfig] = useState<FrontendConfigResponse | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const configResponse = await fetch("/api/frontend-config", { cache: "no-store" });
        if (!configResponse.ok) {
          throw new Error("Failed to load frontend config.");
        }

        const nextConfig = (await configResponse.json()) as FrontendConfigResponse;
        if (cancelled) return;
        setConfig(nextConfig);

        try {
          const healthResponse = await fetch(`${nextConfig.apiUrl}/health`, { cache: "no-store" });
          if (!healthResponse.ok) {
            throw new Error(`Backend responded with ${healthResponse.status}.`);
          }
          const health = (await healthResponse.json()) as BackendHealth;
          if (!cancelled) setBackendHealth(health);
        } catch (healthError) {
          if (!cancelled) {
            setError(healthError instanceof Error ? healthError.message : "Backend health check failed.");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Config verification failed.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Frontend Verification</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Confirms the public env values the frontend is using and whether the backend is reachable.
          </p>
        </div>
        <Badge variant={error ? "warning" : backendHealth?.ok ? "success" : "default"}>
          {error ? "Needs attention" : backendHealth?.ok ? `Backend ${backendHealth.mode}` : "Checking"}
        </Badge>
      </div>

      {error && <p className="mt-4 text-sm text-amber-700">{error}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">API URL</p>
            {config && sourceBadge(config.apiUrlSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.apiUrl ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Arc RPC URL</p>
            {config && sourceBadge(config.arcRpcUrlSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcRpcUrl ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">WalletConnect</p>
            {config && sourceBadge(config.walletConnectProjectIdSource)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {config?.walletConnectConfigured
              ? `Enabled (${config.walletConnectProjectIdMasked})`
              : "Not configured"}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">App URL</p>
            {config && sourceBadge(config.appUrlSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.appUrl ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">USYC</p>
            {config && sourceBadge(config.arcUsycAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcUsycAddress ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">USYC Teller</p>
            {config && sourceBadge(config.arcUsycTellerAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">
            {config?.arcUsycTellerAddress ?? "Loading..."}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Circle App ID</p>
            {config && sourceBadge(config.circleAppIdSource)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {config?.circleAppIdConfigured ? "Configured" : "Not configured"}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Circle Google OAuth</p>
            {config && sourceBadge(config.circleGoogleClientIdSource)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {config?.circleGoogleClientIdConfigured ? "Configured" : "Not configured"}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">CEO Address</p>
            {config && sourceBadge(config.arcCeoAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcCeoAddress ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Core Treasury</p>
            {config && sourceBadge(config.arcCoreAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcCoreAddress ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">PayRun Contract</p>
            {config && sourceBadge(config.arcPayRunAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcPayRunAddress ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Rebalance Contract</p>
            {config && sourceBadge(config.arcRebalanceAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">
            {config?.arcRebalanceAddress ?? "Loading..."}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vesting Contract</p>
            {config && sourceBadge(config.arcVestingAddressSource)}
          </div>
          <p className="mt-2 break-all text-sm font-medium text-slate-900">{config?.arcVestingAddress ?? "Loading..."}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">StableFX Backend</p>
            <Badge variant={backendHealth?.stableFxConfigured ? "success" : "default"}>
              {backendHealth?.stableFxConfigured ? "Configured" : "Not set"}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {backendHealth?.stableFxConfigured ? "Server has a StableFX API key configured." : "Server key not configured."}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">{config?.note ?? "Loading config guidance..."}</p>
    </Card>
  );
}

"use client";

export type CircleGoogleFlowMode = "auth" | "onboarding";

export type CircleGoogleFlowState = {
  mode: CircleGoogleFlowMode;
  code?: string;
  returnTo?: string;
  appId: string;
  deviceToken: string;
  deviceEncryptionKey: string;
  createdAt: number;
};

const STORAGE_KEY = "arc-payroll-circle-google";
const MAX_AGE_MS = 30 * 60 * 1000;
const SDK_STORAGE_KEYS = ["socialLoginProvider", "state", "nonce"] as const;
const GOOGLE_SCOPE = "openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readCircleGoogleState(mode?: CircleGoogleFlowMode) {
  if (!storageAvailable()) return null;

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CircleGoogleFlowState;
    const expired = Date.now() - parsed.createdAt > MAX_AGE_MS;
    if (expired || (mode && parsed.mode !== mode)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeCircleGoogleState(state: CircleGoogleFlowState) {
  if (!storageAvailable()) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearCircleGoogleState() {
  if (!storageAvailable()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function hasCircleGoogleCallbackHash() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  return params.has("state") || params.has("id_token") || params.has("access_token") || params.has("error");
}

export function resetCircleGoogleFlow() {
  clearCircleGoogleState();
  if (typeof window === "undefined") return;

  for (const key of SDK_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  if (window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

export function redirectToCircleGoogleOauth(input: {
  clientId: string;
  redirectUri: string;
  selectAccountPrompt?: boolean;
}) {
  if (typeof window === "undefined") return;

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  window.localStorage.setItem("socialLoginProvider", "Google");
  window.localStorage.setItem("state", state);
  window.localStorage.setItem("nonce", nonce);

  const responseType = encodeURIComponent("id_token token");
  const prompt = input.selectAccountPrompt ? "select_account" : "none";
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(input.clientId)}` +
    `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
    `&scope=${encodeURIComponent(GOOGLE_SCOPE)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=${responseType}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&prompt=${prompt}`;

  window.location.assign(url);
}

export function formatCircleSdkError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeCode = "code" in error ? error.code : undefined;
    const maybeMessage = "message" in error ? error.message : undefined;
    if (typeof maybeCode === "number" && typeof maybeMessage === "string" && maybeMessage.trim()) {
      return `[${maybeCode}] ${maybeMessage}`;
    }
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  return fallback;
}

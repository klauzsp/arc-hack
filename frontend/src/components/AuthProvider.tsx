"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, ApiError, type AuthVerifyResponse } from "@/lib/api";
import type { Recipient } from "@/lib/types";
import type { Role } from "@/lib/role";

const STORAGE_KEY = "arc-payroll-session";
const CIRCLE_STORAGE_KEY = "arc-payroll-circle-session";

export type SessionKind = "wallet" | "employee";
export type CircleAuthSession = {
  userToken: string;
  encryptionKey: string;
};

type StoredSession = {
  token: string;
  address: string | null;
  kind: SessionKind;
};

type AuthContextValue = {
  token: string | null;
  role: Role;
  employee: Recipient | null;
  sessionKind: SessionKind | null;
  circleAuth: CircleAuthSession | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  completeSession: (
    session: AuthVerifyResponse,
    kind: SessionKind,
    address?: string | null,
    circleAuth?: CircleAuthSession | null,
  ) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function storeSession(value: StoredSession | null) {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function readCircleAuth(): CircleAuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(CIRCLE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CircleAuthSession;
  } catch {
    window.sessionStorage.removeItem(CIRCLE_STORAGE_KEY);
    return null;
  }
}

function storeCircleAuth(value: CircleAuthSession | null) {
  if (typeof window === "undefined") return;
  if (!value) {
    window.sessionStorage.removeItem(CIRCLE_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(CIRCLE_STORAGE_KEY, JSON.stringify(value));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [employee, setEmployee] = useState<Recipient | null>(null);
  const [sessionKind, setSessionKind] = useState<SessionKind | null>(null);
  const [circleAuth, setCircleAuth] = useState<CircleAuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastValidatedAddressRef = useRef<string | null>(null);

  const clearSession = () => {
    setToken(null);
    setRole(null);
    setEmployee(null);
    setSessionKind(null);
    setCircleAuth(null);
    storeSession(null);
    storeCircleAuth(null);
  };

  const acceptSession = (
    nextToken: string,
    nextRole: Role,
    nextEmployee: Recipient | null,
    kind: SessionKind,
    nextAddress?: string | null,
    nextCircleAuth?: CircleAuthSession | null,
  ) => {
    setToken(nextToken);
    setRole(nextRole);
    setEmployee(nextEmployee);
    setSessionKind(kind);
    const shouldKeepCircleAuth =
      kind === "employee" && nextEmployee?.onboardingMethod === "circle";
    const resolvedCircleAuth = shouldKeepCircleAuth
      ? (nextCircleAuth ?? readCircleAuth())
      : null;
    setCircleAuth(resolvedCircleAuth);
    storeCircleAuth(resolvedCircleAuth);
    storeSession({
      token: nextToken,
      address: nextAddress?.toLowerCase() ?? null,
      kind,
    });
    if (kind === "wallet") {
      lastValidatedAddressRef.current = nextAddress?.toLowerCase() ?? null;
    }
  };

  const completeSession = (
    session: AuthVerifyResponse,
    kind: SessionKind,
    nextAddress?: string | null,
    nextCircleAuth?: CircleAuthSession | null,
  ) => {
    if (!session.token || !session.role) {
      clearSession();
      throw new Error("This session is not authorized for payroll access.");
    }
    acceptSession(
      session.token,
      session.role,
      session.employee,
      kind,
      nextAddress ?? session.employee?.walletAddress ?? null,
      nextCircleAuth,
    );
    setError(null);
    setIsLoading(false);
  };

  const refresh = async () => {
    if (!token) return;
    try {
      const me = await api.getMe(token);
      setRole(me.role);
      setEmployee(me.employee);
      if (me.role !== "employee" || me.employee?.onboardingMethod !== "circle") {
        setCircleAuth(null);
        storeCircleAuth(null);
      }
      setError(null);
    } catch (fetchError) {
      clearSession();
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      }
    }
  };

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      if (!token) {
        setRole(null);
        setEmployee(null);
        setSessionKind(null);
      }
      setIsLoading(false);
      lastValidatedAddressRef.current = null;
      return;
    }

    if (stored.kind === "employee") {
      if (token === stored.token && sessionKind === "employee") {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      void api
        .getMe(stored.token)
        .then((me) => {
          acceptSession(stored.token, me.role, me.employee, "employee", me.employee?.walletAddress ?? null);
          setError(null);
        })
        .catch((fetchError) => {
          clearSession();
          if (fetchError instanceof ApiError) {
            setError(fetchError.message);
          }
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    if (!isConnected || !address) {
      clearSession();
      setIsLoading(false);
      lastValidatedAddressRef.current = null;
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (stored.address !== normalizedAddress) {
      clearSession();
      setIsLoading(false);
      lastValidatedAddressRef.current = normalizedAddress;
      return;
    }

    if (lastValidatedAddressRef.current === normalizedAddress && token && sessionKind === "wallet") {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void api
      .getMe(stored.token)
        .then((me) => {
          acceptSession(stored.token, me.role, me.employee, "wallet", normalizedAddress);
          setError(null);
        })
      .catch((fetchError) => {
        clearSession();
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [address, isConnected, sessionKind, token]);

  const signIn = async () => {
    if (!address) {
      setError("Connect a wallet before signing in.");
      return;
    }

    setIsAuthenticating(true);
    setError(null);
    const normalizedAddress = address.toLowerCase();

    try {
      const challenge = await api.createChallenge(normalizedAddress);
      const signature = await signMessageAsync({ message: challenge.message });
      const session = await api.verifyChallenge({
        address: normalizedAddress,
        message: challenge.message,
        signature,
      });

      if (!session.token || !session.role) {
        clearSession();
        setError("This wallet does not have an assigned payroll role.");
        return;
      }

      acceptSession(session.token, session.role, session.employee, "wallet", normalizedAddress);
    } catch (signInError) {
      if (signInError instanceof Error) {
        setError(signInError.message);
      } else {
        setError("Sign-in failed.");
      }
    } finally {
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  const signOut = () => {
    clearSession();
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        role,
        employee,
        sessionKind,
        circleAuth,
        isLoading,
        isAuthenticating,
        error,
        signIn,
        completeSession,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthProvider");
  }
  return context;
}

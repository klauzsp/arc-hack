"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, ApiError } from "@/lib/api";
import type { Recipient } from "@/lib/types";
import type { Role } from "@/lib/role";

const STORAGE_KEY = "arc-payroll-session";

type StoredSession = {
  token: string;
  address: string;
};

type AuthContextValue = {
  token: string | null;
  role: Role;
  employee: Recipient | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  signIn: () => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [employee, setEmployee] = useState<Recipient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastValidatedAddressRef = useRef<string | null>(null);

  const clearSession = () => {
    setToken(null);
    setRole(null);
    setEmployee(null);
    storeSession(null);
  };

  const refresh = async () => {
    if (!token) return;
    try {
      const me = await api.getMe(token);
      setRole(me.role);
      setEmployee(me.employee);
      setError(null);
    } catch (fetchError) {
      clearSession();
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      }
    }
  };

  useEffect(() => {
    if (!isConnected || !address) {
      clearSession();
      setIsLoading(false);
      lastValidatedAddressRef.current = null;
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (lastValidatedAddressRef.current === normalizedAddress && token) {
      setIsLoading(false);
      return;
    }

    const stored = readStoredSession();
    if (!stored || stored.address !== normalizedAddress) {
      clearSession();
      setIsLoading(false);
      lastValidatedAddressRef.current = normalizedAddress;
      return;
    }

    setIsLoading(true);
    void api
      .getMe(stored.token)
      .then((me) => {
        setToken(stored.token);
        setRole(me.role);
        setEmployee(me.employee);
        setError(null);
        lastValidatedAddressRef.current = normalizedAddress;
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
  }, [address, isConnected, token]);

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

      setToken(session.token);
      setRole(session.role);
      setEmployee(session.employee);
      storeSession({ token: session.token, address: normalizedAddress });
      lastValidatedAddressRef.current = normalizedAddress;
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
        isLoading,
        isAuthenticating,
        error,
        signIn,
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

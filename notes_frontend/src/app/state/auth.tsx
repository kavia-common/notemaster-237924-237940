"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, TokenResponse, UserMeResponse } from "../lib/api";

type AuthState = {
  token: string | null;
  me: UserMeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const TOKEN_KEY = "notemaster_token";

// PUBLIC_INTERFACE
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /** Provides authentication state (JWT token) to the app. */
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
    setToken(t);
    setLoading(false);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setMe(null);
      return;
    }
    const m = await apiFetch<UserMeResponse>("/auth/me", { token });
    setMe(m);
  }, [token]);

  useEffect(() => {
    if (!loading) refreshMe().catch(() => setMe(null));
  }, [loading, refreshMe]);

  const setAndPersistToken = useCallback((t: string | null) => {
    setToken(t);
    if (typeof window === "undefined") return;
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const resp = await apiFetch<TokenResponse>("/auth/login", { method: "POST", body: { email, password } });
      setAndPersistToken(resp.access_token);
    },
    [setAndPersistToken]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const resp = await apiFetch<TokenResponse>("/auth/register", { method: "POST", body: { email, password } });
      setAndPersistToken(resp.access_token);
    },
    [setAndPersistToken]
  );

  const logout = useCallback(() => {
    setAndPersistToken(null);
    setMe(null);
  }, [setAndPersistToken]);

  const value = useMemo<AuthState>(
    () => ({ token, me, loading, login, register, logout, refreshMe }),
    [token, me, loading, login, register, logout, refreshMe]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// PUBLIC_INTERFACE
export function useAuth(): AuthState {
  /** Hook to access AuthProvider state. */
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

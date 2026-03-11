"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth-client";

const SESSION_STORAGE_KEY = "teek_jwt";
/** Refresh the JWT this many ms before it expires. */
const REFRESH_BUFFER_MS = 60_000;

interface JwtContextValue {
  jwt: string | null;
  /** True once the first token-exchange attempt has completed (success or failure). */
  isReady: boolean;
  /** Drop-in replacement for fetch() that adds Authorization: Bearer <jwt>. */
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const JwtContext = createContext<JwtContextValue>({
  jwt: null,
  isReady: false,
  apiFetch: (url, init) => fetch(url, init),
});

export function JwtProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [jwt, setJwt] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    return null;
  });
  const [isReady, setIsReady] = useState(false);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionTokenRef = useRef<string | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (expiresInSeconds: number) => {
      clearRefreshTimer();
      const delayMs = Math.max(0, expiresInSeconds * 1000 - REFRESH_BUFFER_MS);
      refreshTimerRef.current = setTimeout(() => {
        // Force re-exchange on next session effect run
        lastSessionTokenRef.current = null;
        setJwt(null);
      }, delayMs);
    },
    [clearRefreshTimer]
  );

  const exchangeToken = useCallback(
    async (sessionToken: string) => {
      try {
        const resp = await fetch(`${apiUrl}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: sessionToken }),
        });
        if (!resp.ok) {
          console.error("JWT exchange failed:", resp.status);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          setJwt(null);
          return;
        }
        const data = await resp.json();
        const accessToken: string = data.access_token;
        const expiresIn: number = data.expires_in;
        sessionStorage.setItem(SESSION_STORAGE_KEY, accessToken);
        setJwt(accessToken);
        scheduleRefresh(expiresIn);
      } catch (err) {
        console.error("JWT exchange error:", err);
      } finally {
        setIsReady(true);
      }
    },
    [apiUrl, scheduleRefresh]
  );

  useEffect(() => {
    const sessionToken = session?.session?.token;

    if (!sessionToken) {
      // Still loading — don't clear the JWT; wait for session to resolve
      if (sessionPending) return;
      // Logged out — clear everything
      clearRefreshTimer();
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setJwt(null);
      setIsReady(true);
      lastSessionTokenRef.current = null;
      return;
    }

    // Same session token and JWT still valid — skip exchange
    if (sessionToken === lastSessionTokenRef.current && jwt) {
      setIsReady(true);
      return;
    }

    lastSessionTokenRef.current = sessionToken;
    exchangeToken(sessionToken);
  }, [session?.session?.token, exchangeToken, clearRefreshTimer, jwt]);

  // Cleanup timer on unmount
  useEffect(() => () => clearRefreshTimer(), [clearRefreshTimer]);

  const apiFetch = useCallback(
    (url: string, init: RequestInit = {}): Promise<Response> => {
      if (!jwt) return fetch(url, init);
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${jwt}`);
      return fetch(url, { ...init, headers });
    },
    [jwt]
  );

  return (
    <JwtContext.Provider value={{ jwt, isReady, apiFetch }}>
      {children}
    </JwtContext.Provider>
  );
}

export function useJwt() {
  return useContext(JwtContext);
}

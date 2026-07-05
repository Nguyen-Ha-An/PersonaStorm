"use client";

/**
 * Auth context: wraps the app, tracks the Supabase session, and loads the
 * signed-in user's profile + wallet from the backend (/api/me). Everything
 * downstream reads `useAuth()` for `me`, `role`, and the auth actions.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getMe } from "./api";
import {
  SUPABASE_CONFIGURED,
  SUPABASE_MISCONFIGURED,
  SUPABASE_URL_MISCONFIG_MESSAGE,
  friendlySupabaseError,
  getSupabaseClient,
} from "./supabase/client";
import type { Me } from "./types";

/** The message shown when auth can't be used because env is missing/misconfigured. */
const AUTH_UNAVAILABLE_MESSAGE = SUPABASE_MISCONFIGURED
  ? SUPABASE_URL_MISCONFIG_MESSAGE
  : "Authentication is not configured.";

interface SignUpResult {
  error?: string;
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  loading: boolean; // initial session resolution
  configured: boolean; // Supabase env present
  session: Session | null;
  me: Me | null;
  isAdmin: boolean;
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(email: string, password: string, fullName?: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  refreshMe(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const meLoadedFor = useRef<string | null>(null);

  const refreshMe = useCallback(async () => {
    if (!session) {
      setMe(null);
      return;
    }
    try {
      setMe(await getMe());
    } catch {
      // Leave `me` as-is; API/CORS errors are surfaced by the screens that call it.
    }
  }, [session]);

  // Resolve the initial session and subscribe to auth changes.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setMe(null);
        meLoadedFor.current = null;
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Load /api/me once per signed-in user.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (uid && meLoadedFor.current !== uid) {
      meLoadedFor.current = uid;
      refreshMe();
    }
  }, [session, refreshMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: AUTH_UNAVAILABLE_MESSAGE };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      // Map a path-included Supabase URL (…/rest/v1 → 404 "Invalid path
      // specified in request URL") to a clear, actionable message.
      return error ? { error: friendlySupabaseError(error.message) } : {};
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string): Promise<SignUpResult> => {
      if (!supabase) return { error: AUTH_UNAVAILABLE_MESSAGE };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: fullName ? { full_name: fullName } : undefined },
      });
      if (error) return { error: friendlySupabaseError(error.message) };
      // If email confirmation is required, there's no active session yet.
      return { needsConfirmation: !data.session };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setMe(null);
    meLoadedFor.current = null;
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      configured: SUPABASE_CONFIGURED,
      session,
      me,
      isAdmin: me?.role === "admin",
      signIn,
      signUp,
      signOut,
      refreshMe,
    }),
    [loading, session, me, signIn, signUp, signOut, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

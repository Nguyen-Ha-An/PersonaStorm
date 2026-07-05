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
import { ApiError, getMe } from "./api";
import { getAuthCallbackUrl, getResetPasswordUrl } from "./site-url";
import { SUPABASE_CONFIGURED, getSupabaseClient } from "./supabase/client";
import type { Me } from "./types";

interface SignUpResult {
  error?: string;
  needsConfirmation?: boolean;
}

/**
 * Server-verified session status, derived from the /api/me result:
 *   idle    — no client session yet
 *   loading — fetching /api/me
 *   ok       — the server accepted the token (truly connected)
 *   expired  — the server rejected the token (401); the client session is dead
 *   error    — a non-auth failure (network / 5xx)
 * The dashboard + status badge read this so we never show "connected" while the
 * server is actually rejecting the session.
 */
export type MeStatus = "idle" | "loading" | "ok" | "expired" | "error";

const AUTH_REDIRECT_LOCALHOST_MSG =
  "Auth redirect is misconfigured. Production must use " +
  "https://personastorm.nguyenhaan.id.vn, not localhost.";

/** Build a redirect URL, mapping the localhost-in-production guard to a message. */
function resolveRedirect(build: () => string): { url: string } | { error: string } {
  try {
    return { url: build() };
  } catch {
    return { error: AUTH_REDIRECT_LOCALHOST_MSG };
  }
}

interface AuthContextValue {
  loading: boolean; // initial session resolution
  configured: boolean; // Supabase env present
  session: Session | null;
  me: Me | null;
  isAdmin: boolean;
  /** Whether the SERVER currently accepts this session (see MeStatus). */
  meStatus: MeStatus;
  signIn(email: string, password: string): Promise<{ error?: string }>;
  signUp(email: string, password: string, fullName?: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  refreshMe(): Promise<void>;
  /** Email a password-recovery link that returns to /auth/reset-password. */
  sendPasswordReset(email: string): Promise<{ error?: string }>;
  /** Set a new password for the user in the current (recovery) session. */
  updatePassword(password: string): Promise<{ error?: string }>;
  /** Resend the signup confirmation email with an explicit production redirect. */
  resendConfirmation(email: string): Promise<{ error?: string; sent?: boolean }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>("idle");
  const meLoadedFor = useRef<string | null>(null);

  const refreshMe = useCallback(async () => {
    if (!session) {
      setMe(null);
      setMeStatus("idle");
      return;
    }
    setMeStatus((prev) => (prev === "ok" ? prev : "loading"));
    try {
      setMe(await getMe());
      setMeStatus("ok");
    } catch (err) {
      // Distinguish a real auth rejection (server says the token is invalid —
      // force re-login) from a transient network/5xx error (keep the session).
      if (err instanceof ApiError && err.kind === "auth") {
        setMe(null);
        setMeStatus("expired");
      } else {
        setMeStatus("error");
      }
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
        setMeStatus("idle");
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
      if (!supabase) return { error: "Authentication is not configured." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string): Promise<SignUpResult> => {
      if (!supabase) return { error: "Authentication is not configured." };
      // ALWAYS pass an explicit redirect. Without this, Supabase falls back to
      // the project Site URL (which was localhost), so confirmation emails sent
      // people to http://localhost:3000. This forces the link back to the
      // current site (production domain via NEXT_PUBLIC_SITE_URL).
      const redirect = resolveRedirect(getAuthCallbackUrl);
      if ("error" in redirect) return { error: redirect.error };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : undefined,
          emailRedirectTo: redirect.url,
        },
      });
      if (error) return { error: error.message };
      // If email confirmation is required, there's no active session yet.
      return { needsConfirmation: !data.session };
    },
    [supabase],
  );

  const sendPasswordReset = useCallback(
    async (email: string): Promise<{ error?: string }> => {
      if (!supabase) return { error: "Authentication is not configured." };
      const redirect = resolveRedirect(getResetPasswordUrl);
      if ("error" in redirect) return { error: redirect.error };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect.url,
      });
      return error ? { error: error.message } : {};
    },
    [supabase],
  );

  const resendConfirmation = useCallback(
    async (email: string): Promise<{ error?: string; sent?: boolean }> => {
      if (!supabase) return { error: "Authentication is not configured." };
      const redirect = resolveRedirect(getAuthCallbackUrl);
      if ("error" in redirect) return { error: redirect.error };
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirect.url },
      });
      return error ? { error: error.message } : { sent: true };
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<{ error?: string }> => {
      if (!supabase) return { error: "Authentication is not configured." };
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { error: error.message } : {};
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setMe(null);
    setMeStatus("idle");
    meLoadedFor.current = null;
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      configured: SUPABASE_CONFIGURED,
      session,
      me,
      isAdmin: me?.role === "admin",
      meStatus,
      signIn,
      signUp,
      signOut,
      refreshMe,
      sendPasswordReset,
      updatePassword,
      resendConfirmation,
    }),
    [
      loading,
      session,
      me,
      meStatus,
      signIn,
      signUp,
      signOut,
      refreshMe,
      sendPasswordReset,
      updatePassword,
      resendConfirmation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

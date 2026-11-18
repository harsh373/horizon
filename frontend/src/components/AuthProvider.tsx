import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { setTokenGetter } from "../api/api";

type AuthStatus = "loading" | "locked" | "unlocked";

interface AuthContextValue {
  status: AuthStatus;
  lock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { signOut } = useClerk();

  // Runs before children's effects, so their first API call already has a token source.
  useLayoutEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  const lock = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const status: AuthStatus = !isLoaded ? "loading" : isSignedIn ? "unlocked" : "locked";
  const value = useMemo(() => ({ status, lock }), [status, lock]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
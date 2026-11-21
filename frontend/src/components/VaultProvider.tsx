import { useAuth as useClerkAuth } from "@clerk/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fetchVaultKey } from "../api/vault.api";
import { importServerKey } from "../crypto/serverKey";
import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { clearVaultSession, decryptRecord, encryptRecord, setVaultSession } from "../crypto/vaultSession";

type VaultState = { phase: "loading" } | { phase: "ready" } | { phase: "error" };

interface VaultContextValue {
  encryptRecord: (kind: string, recordId: string, value: unknown) => Promise<EncryptedPayload>;
  decryptRecord: <T>(kind: string, recordId: string, payload: EncryptedPayload) => Promise<T>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { userId } = useClerkAuth();
  const [state, setState] = useState<VaultState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ phase: "loading" });

    fetchVaultKey()
      .then((response) => importServerKey(response.key))
      .then((key) => {
        if (cancelled) return;
        // The session is set BEFORE the children render, so their first request can already decrypt.
        setVaultSession(key, userId);
        setState({ phase: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });

    return () => {
      cancelled = true;
      clearVaultSession();
    };
  }, [attempt, userId]);

  const value = useMemo(() => ({ encryptRecord, decryptRecord }), []);

  if (state.phase === "loading") return null;

  if (state.phase === "error") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
        <p className="text-[17px] text-secondary">Couldn&apos;t open your journal. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-full bg-text px-5 py-2 text-[15px] text-bg"
        >
          Try again
        </button>
      </div>
    );
  }

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used inside VaultProvider");
  return context;
}
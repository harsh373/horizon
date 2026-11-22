import { useAuth as useClerkAuth } from "@clerk/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fetchVault } from "../api/vault.api";
import { forgetDeviceKeys, loadDeviceKey, rememberDeviceKey } from "../crypto/deviceKey";
import type { EncryptedPayload, VaultRecord } from "../crypto/vaultCrypto";
import { clearVaultSession, decryptRecord, encryptRecord, setVaultSession } from "../crypto/vaultSession";
import VaultSetup from "./VaultSetup";
import VaultUnlock from "./VaultUnlock";

type VaultState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "setup" }
  | { phase: "locked"; record: VaultRecord; revision: number }
  | { phase: "ready"; record: VaultRecord; revision: number };

interface VaultContextValue {
  encryptRecord: (kind: string, recordId: string, value: unknown) => Promise<EncryptedPayload>;
  decryptRecord: <T>(kind: string, recordId: string, payload: EncryptedPayload) => Promise<T>;
  record: VaultRecord | null;
  revision: number;
  // Called after setup or an unlock, to switch the session over.
  completePrivate: (key: CryptoKey, record: VaultRecord, revision: number, remember: boolean) => Promise<void>;
  forgetDevice: () => Promise<void>;
  // Called after a password change or a new recovery key, so the screen holds the newest record.
  updateRecord: (record: VaultRecord, revision: number) => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { userId } = useClerkAuth();
  const [state, setState] = useState<VaultState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const keyVersionRef = useRef(1);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ phase: "loading" });

    async function open(uid: string): Promise<void> {
      const info = await fetchVault();
      if (cancelled) return;
      keyVersionRef.current = info.keyVersion;

      // Every vault must be private. A vault still holding a server key goes through setup first,
      // and nothing in the app renders (or can decrypt) until that is finished.
      if (info.mode === "server") {
        setState({ phase: "setup" });
        return;
      }

      const remembered = await loadDeviceKey(uid, info.keyVersion);
      if (cancelled) return;
      if (remembered) {
        setVaultSession(remembered, uid);
        setState({ phase: "ready", record: info.record, revision: info.revision });
      } else {
        setState({ phase: "locked", record: info.record, revision: info.revision });
      }
    }

    open(userId).catch(() => {
      if (!cancelled) setState({ phase: "error" });
    });

    return () => {
      cancelled = true;
      clearVaultSession();
    };
  }, [attempt, userId]);

  const completePrivate = useCallback(
    async (key: CryptoKey, record: VaultRecord, revision: number, remember: boolean) => {
      if (!userId) return;
      setVaultSession(key, userId);
      if (remember) await rememberDeviceKey(userId, keyVersionRef.current, key);
      setState({ phase: "ready", record, revision });
    },
    [userId],
  );

  const forgetDevice = useCallback(() => forgetDeviceKeys(), []);

  const updateRecord = useCallback((record: VaultRecord, revision: number) => {
    setState((prev) => (prev.phase === "ready" ? { ...prev, record, revision } : prev));
  }, []);

  const record = state.phase === "ready" ? state.record : null;
  const revision = state.phase === "ready" ? state.revision : 0;

  const value = useMemo<VaultContextValue>(
    () => ({ encryptRecord, decryptRecord, record, revision, completePrivate, forgetDevice, updateRecord }),
    [record, revision, completePrivate, forgetDevice, updateRecord],
  );

  if (state.phase === "loading") return null;

  if (state.phase === "setup") {
    return <VaultSetup onComplete={completePrivate} />;
  }

  if (state.phase === "locked") {
    return <VaultUnlock record={state.record} revision={state.revision} onUnlocked={completePrivate} />;
  }

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
import { useUser } from "@clerk/react";
import axios from "axios";
import { Lock } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { updateVaultRecord } from "../api/vault.api";
import { VaultError } from "../crypto/errors";
import { resetPassphraseWithRecoveryCode, unlockWithPassphrase, unlockWithRecoveryCode } from "../crypto/vaultCrypto";
import type { VaultRecord } from "../crypto/vaultCrypto";
import { useAuth } from "./AuthProvider";
import PasswordFields from "./PasswordFields";

type Mode = "password" | "recovery" | "reset";

interface VaultUnlockProps {
  record: VaultRecord;
  revision: number;
  onUnlocked: (key: CryptoKey, record: VaultRecord, revision: number, remember: boolean) => Promise<void>;
}

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-[16px] text-text placeholder:text-tertiary focus:border-secondary";
const primaryButton =
  "h-11 w-full rounded-control bg-text text-[14px] font-medium text-bg transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40";

function describe(error: unknown, mode: Mode): string {
  if (error instanceof VaultError) {
    if (error.code === "WRONG_SECRET") {
      return mode === "recovery" ? "That recovery key isn't right." : "That password isn't right.";
    }
    return error.message;
  }
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    return "Your vault changed somewhere else. Reload the page and try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}

export default function VaultUnlock({ record, revision, onUnlocked }: VaultUnlockProps) {
  const { lock } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Horizon";
  const emailName = user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "";
  const avoid = [emailName, user?.firstName ?? "", user?.lastName ?? ""].filter((token) => token.length >= 4);

  const [mode, setMode] = useState<Mode>("password");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [verifiedCode, setVerifiedCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const key = await unlockWithPassphrase(record, password);
      await onUnlocked(key, record, revision, remember);
    } catch (err) {
      setError(describe(err, "password"));
      setBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent) {
    event.preventDefault();
    if (busy || recoveryInput.trim().length === 0) return;
    setBusy(true);
    setError("");
    try {
      await unlockWithRecoveryCode(record, recoveryInput);
      setVerifiedCode(recoveryInput);
      setMode("reset");
    } catch (err) {
      setError(describe(err, "recovery"));
    }
    setBusy(false);
  }

  async function submitReset(newPassword: string) {
    setBusy(true);
    setError("");
    try {
      const { record: next, masterKey } = await resetPassphraseWithRecoveryCode(record, verifiedCode, newPassword);
      const newRevision = await updateVaultRecord(next, revision);
      await onUnlocked(masterKey, next, newRevision, remember);
    } catch (err) {
      setError(describe(err, "reset"));
      setBusy(false);
    }
  }

  const rememberBox = (
    <label className="flex items-start gap-2.5 text-[13px] text-secondary">
      <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>Remember this device, so I don&apos;t have to type my password again here. Don&apos;t tick this on a shared computer.</span>
    </label>
  );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 py-10 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Lock size={18} strokeWidth={1.75} className="text-secondary" />
          <h1 className="font-serif text-[1.6rem] leading-tight tracking-tight">
            {mode === "reset" ? "Choose a new password" : "Your journal is locked"}
          </h1>
        </div>

        {mode === "password" && (
          <form onSubmit={submitPassword} className="space-y-4">
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              data-allow-autofill="true"
              className="sr-only"
            />
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="vault-password" className="text-[13px] font-medium text-secondary">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-[13px] text-secondary hover:text-text"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="vault-password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                data-allow-autofill="true"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass + " mt-1.5"}
              />
            </div>
            {rememberBox}
            {error && (
              <p className="text-[13px] text-alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || password.length === 0} className={primaryButton}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode("recovery");
              }}
              className="w-full text-[13px] text-secondary hover:text-text"
            >
              Forgot your password? Use your recovery key
            </button>
          </form>
        )}

        {mode === "recovery" && (
          <form onSubmit={submitRecovery} className="space-y-4">
            <div>
              <label htmlFor="vault-recovery" className="text-[13px] font-medium text-secondary">
                Recovery key
              </label>
              <input
                id="vault-recovery"
                type="text"
                autoFocus
                value={recoveryInput}
                onChange={(event) => setRecoveryInput(event.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                className={inputClass + " mt-1.5 font-mono uppercase"}
              />
            </div>
            {error && (
              <p className="text-[13px] text-alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || recoveryInput.trim().length === 0} className={primaryButton}>
              {busy ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode("password");
              }}
              className="w-full text-[13px] text-secondary hover:text-text"
            >
              Back to password
            </button>
          </form>
        )}

        {mode === "reset" && (
          <PasswordFields username={email} avoid={avoid} submitLabel="Save and unlock" busy={busy} error={error} onSubmit={submitReset}>
            {rememberBox}
          </PasswordFields>
        )}

        <button type="button" onClick={() => void lock()} className="mt-8 w-full text-[13px] text-tertiary hover:text-secondary">
          Sign out
        </button>
      </div>
    </div>
  );
}
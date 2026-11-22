import { useUser } from "@clerk/react";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { cancelStagedVault, fetchVault, finalizeVault, stageVault } from "../api/vault.api";
import { VaultError } from "../crypto/errors";
import { unlockWithPassphrase, unlockWithRecoveryCode } from "../crypto/vaultCrypto";
import type { VaultRecord } from "../crypto/vaultCrypto";
import { createVaultFromKey, importExtractableKey, sameKey } from "../crypto/vaultWrap";
import { useAuth } from "./AuthProvider";
import PasswordFields from "./PasswordFields";
import RecoveryKeyScreen from "./RecoveryKeyScreen";

type Step = "intro" | "password" | "recovery" | "working";

interface Prepared {
  record: VaultRecord;
  recoveryCode: string;
  master: CryptoKey;
  keyVersion: number;
  password: string;
}

interface VaultSetupProps {
  onComplete: (key: CryptoKey, record: VaultRecord, revision: number, remember: boolean) => Promise<void>;
}

const GENERIC_ERROR = "Something went wrong. Nothing was changed. Check your connection and try again.";

export default function VaultSetup({ onComplete }: VaultSetupProps) {
  const { lock } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Horizon";
  const emailName = user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "";
  const avoid = useMemo(
    () => [emailName, user?.firstName ?? "", user?.lastName ?? ""].filter((token) => token.length >= 4),
    [emailName, user?.firstName, user?.lastName],
  );

  const [step, setStep] = useState<Step>("intro");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Build the locked record in the browser and check it opens, before anything is sent.
  async function prepare(password: string) {
    setBusy(true);
    setError("");
    try {
      const info = await fetchVault();
      if (info.mode !== "server") throw new Error("Already private");

      const master = await importExtractableKey(info.key);
      const { record, recoveryCode } = await createVaultFromKey(master, password);

      const viaPassword = await unlockWithPassphrase(record, password);
      const viaRecovery = await unlockWithRecoveryCode(record, recoveryCode);
      if (!(await sameKey(master, viaPassword)) || !(await sameKey(master, viaRecovery))) {
        throw new Error("Self-check failed");
      }

      setPrepared({ record, recoveryCode, master, keyVersion: info.keyVersion, password });
      setStep("recovery");
    } catch (err) {
      setError(err instanceof VaultError ? err.message : GENERIC_ERROR);
    }
    setBusy(false);
  }

  // Stage, read back and re-check, and only then delete the server's copy.
  async function activate() {
    if (!prepared) return;
    setStep("working");
    setError("");

    const progress = { staged: false, unlocked: null as CryptoKey | null };
    try {
      await stageVault(prepared.record);
      progress.staged = true;

      const info = await fetchVault();
      if (info.mode !== "server" || !info.pending) throw new Error("The server did not keep the record");

      const viaPassword = await unlockWithPassphrase(info.pending, prepared.password);
      const viaRecovery = await unlockWithRecoveryCode(info.pending, prepared.recoveryCode);
      if (!(await sameKey(prepared.master, viaPassword)) || !(await sameKey(prepared.master, viaRecovery))) {
        throw new Error("Round-trip check failed");
      }
      progress.unlocked = viaPassword;

      const { revision } = await finalizeVault(prepared.keyVersion);
      await onComplete(viaPassword, info.pending, revision, remember);
    } catch {
      // The final call may have succeeded even though its answer never arrived. Ask the server.
      let recovered = false;
      if (progress.unlocked) {
        try {
          const check = await fetchVault();
          if (check.mode === "private") {
            await onComplete(progress.unlocked, check.record, check.revision, remember);
            recovered = true;
          }
        } catch {
          // fall through to the failure path
        }
      }

      if (!recovered) {
        if (progress.staged) await cancelStagedVault().catch(() => undefined);
        setError(GENERIC_ERROR);
        setPrepared(null);
        setStep("password");
      }
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 py-10 text-text">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Lock size={18} strokeWidth={1.75} className="text-secondary" />
          <h1 className="font-serif text-[1.6rem] leading-tight tracking-tight">Lock your journal</h1>
        </div>

        {step === "intro" && (
          <div className="space-y-5">
            <div>
              <p className="font-serif text-[1.25rem] leading-snug tracking-tight">We are giving you a security key.</p>
              <p className="mt-2 text-[15px] leading-relaxed text-secondary">
                Because we are end-to-end encrypted, nobody will read your data, not even us.
              </p>
            </div>

            <div className="rounded-control border border-alert/40 bg-alert/10 p-4 text-[14px] leading-relaxed text-text">
              <p className="font-medium">You must save two things yourself:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>
                  <span className="font-medium">Your password.</span> You choose it next. Keep it in a password manager or somewhere
                  safe.
                </li>
                <li>
                  <span className="font-medium">Your recovery key.</span> It is shown once, at the end. Download it, copy it or print
                  it, and keep it somewhere different from your password if you can.
                </li>
              </ul>

              <p className="mt-3 font-medium">What happens if you lose them:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>Forget your password but have your recovery key: you get back in and choose a new password.</li>
                <li>Lose your recovery key but know your password: you can make a new recovery key in Settings.</li>
                <li>
                  Lose both: your journal is gone for good. Nobody can recover it, and signing in with Google will not help. There is
                  no reset email and no support option.
                </li>
                <li>On a new device or browser you will be asked for your password. Without it, that device stays locked.</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setStep("password")}
              className="h-11 w-full rounded-control bg-text text-[14px] font-medium text-bg transition-opacity duration-150 hover:opacity-85"
            >
              I understand, continue
            </button>
          </div>
        )}

        {step === "password" && (
          <div>
            <p className="mb-5 text-[14px] leading-relaxed text-secondary">
              Choose a password for your journal. You will need it on every new device.
            </p>
            <PasswordFields username={email} avoid={avoid} submitLabel="Continue" busy={busy} error={error} onSubmit={prepare}>
              <label className="flex items-start gap-2.5 text-[13px] text-secondary">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>Remember this device, so I don&apos;t have to type my password again here. Don&apos;t tick this on a shared computer.</span>
              </label>
            </PasswordFields>
          </div>
        )}

        {(step === "recovery" || step === "working") && prepared && (
          <RecoveryKeyScreen
            recoveryCode={prepared.recoveryCode}
            busy={step === "working"}
            error={error}
            onContinue={() => void activate()}
            onCancel={() => {
              setPrepared(null);
              setError("");
              setStep("password");
            }}
            continueLabel="Lock my journal"
            busyLabel="Locking…"
          />
        )}

        <button
          type="button"
          onClick={() => void lock()}
          disabled={step === "working"}
          className="mt-8 w-full text-[13px] text-tertiary hover:text-secondary disabled:opacity-40"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
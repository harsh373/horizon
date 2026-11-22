import { useUser } from "@clerk/react";
import axios from "axios";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { updateVaultRecord } from "../api/vault.api";
import { VaultError } from "../crypto/errors";
import {
  changePassphrase,
  regenerateRecoveryCode,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
} from "../crypto/vaultCrypto";
import type { VaultRecord } from "../crypto/vaultCrypto";
import { sameKey } from "../crypto/vaultWrap";
import PasswordFields from "./PasswordFields";
import RecoveryKeyScreen from "./RecoveryKeyScreen";
import { useVault } from "./VaultProvider";

type View = "menu" | "change" | "keyAsk" | "keyShow";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-[16px] text-text placeholder:text-tertiary focus:border-secondary";
const smallButton =
  "h-9 rounded-control border border-border px-3 text-[13px] font-medium text-text transition-colors duration-150 hover:bg-hover";

function describe(error: unknown): string {
  if (error instanceof VaultError) {
    return error.code === "WRONG_SECRET" ? "Your current password isn't right." : error.message;
  }
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    return "Your vault changed somewhere else. Reload the page and try again.";
  }
  return "Something went wrong. Nothing was changed. Check your connection and try again.";
}

export default function PrivateVaultActions() {
  const { record, revision, updateRecord } = useVault();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Horizon";
  const emailName = user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "";
  const avoid = useMemo(
    () => [emailName, user?.firstName ?? "", user?.lastName ?? ""].filter((token) => token.length >= 4),
    [emailName, user?.firstName, user?.lastName],
  );

  const [view, setView] = useState<View>("menu");
  const [current, setCurrent] = useState("");
  const [pending, setPending] = useState<{ record: VaultRecord; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!record) return null;

  function back() {
    setView("menu");
    setCurrent("");
    setPending(null);
    setError("");
    setBusy(false);
  }

  async function submitChange(newPassword: string) {
    if (!record) return;
    if (current.length === 0) {
      setError("Type your current password first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { record: next } = await changePassphrase(record, current, newPassword);
      const oldKey = await unlockWithPassphrase(record, current);
      const newKey = await unlockWithPassphrase(next, newPassword);
      if (!(await sameKey(oldKey, newKey))) throw new Error("Self-check failed");

      const newRevision = await updateVaultRecord(next, revision);
      updateRecord(next, newRevision);
      back();
      setNotice("Password changed. Use the new one on your other devices.");
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  async function submitKeyAsk(event: FormEvent) {
    event.preventDefault();
    if (!record || busy || current.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const { record: next, recoveryCode } = await regenerateRecoveryCode(record, current);
      const viaPassword = await unlockWithPassphrase(next, current);
      const viaRecovery = await unlockWithRecoveryCode(next, recoveryCode);
      if (!(await sameKey(viaPassword, viaRecovery))) throw new Error("Self-check failed");

      setPending({ record: next, code: recoveryCode });
      setView("keyShow");
    } catch (err) {
      setError(describe(err));
    }
    setBusy(false);
  }

  async function saveNewKey() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const newRevision = await updateVaultRecord(pending.record, revision);
      updateRecord(pending.record, newRevision);
      back();
      setNotice("New recovery key saved. The old one no longer works.");
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  const currentField = (
    <div>
      <label htmlFor="vault-current-password" className="text-[13px] font-medium text-secondary">
        Current password
      </label>
      <input
        id="vault-current-password"
        type="password"
        name="current-password"
        autoComplete="current-password"
        data-allow-autofill="true"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        className={inputClass + " mt-1.5"}
      />
    </div>
  );

  return (
    <div className="mt-6 border-t border-border pt-5">
      {notice && view === "menu" && <p className="mb-3 text-[14px] font-medium text-text">{notice}</p>}

      {view === "menu" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButton} onClick={() => { setNotice(""); setView("change"); }}>
            Change password
          </button>
          <button type="button" className={smallButton} onClick={() => { setNotice(""); setView("keyAsk"); }}>
            New recovery key
          </button>
        </div>
      )}

      {view === "change" && (
        <div>
          <PasswordFields username={email} avoid={avoid} submitLabel="Change password" busy={busy} error={error} onSubmit={submitChange}>
            {currentField}
          </PasswordFields>
          <button type="button" onClick={back} disabled={busy} className="mt-4 text-[13px] text-secondary hover:text-text">
            Cancel
          </button>
        </div>
      )}

      {view === "keyAsk" && (
        <form onSubmit={submitKeyAsk} className="space-y-4">
          <p className="text-[14px] leading-relaxed text-secondary">
            This makes a new recovery key. Your old one stops working only after you save the new one.
          </p>
          {currentField}
          {error && (
            <p className="text-[13px] text-alert" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || current.length === 0}
              className="h-11 flex-1 rounded-control bg-text text-[14px] font-medium text-bg transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Working…" : "Make a new key"}
            </button>
            <button type="button" onClick={back} disabled={busy} className="h-11 px-3 text-[14px] text-secondary hover:text-text">
              Cancel
            </button>
          </div>
        </form>
      )}

      {view === "keyShow" && pending && (
        <RecoveryKeyScreen
          recoveryCode={pending.code}
          busy={busy}
          error={error}
          onContinue={() => void saveNewKey()}
          onCancel={back}
          continueLabel="Save new recovery key"
          busyLabel="Saving…"
        />
      )}
    </div>
  );
}
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { checkPassword } from "../utility/passwordStrength";
import type { Strength } from "../utility/passwordStrength";

// 31 characters with no look-alikes (no i, l, o, 0, 1). 248 = 31 * 8, so b % 31 is unbiased below it.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function suggestPassword(): string {
  const chars: string[] = [];
  while (chars.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < 248 && chars.length < 16) chars.push(ALPHABET.charAt(byte % 31));
    }
  }
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

const SEGMENTS: Record<Strength, number> = { weak: 1, okay: 2, strong: 3 };
const SEGMENT_COLOR: Record<Strength, string> = { weak: "bg-alert", okay: "bg-tough", strong: "bg-good" };

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-[16px] text-text placeholder:text-tertiary focus:border-secondary";

interface PasswordFieldsProps {
  username: string; // lets a password manager file the saved password under the right account
  avoid?: string[];
  submitLabel: string;
  busy?: boolean;
  error?: string;
  onSubmit: (password: string) => void;
  children?: ReactNode; // extra controls shown above the button
}

export default function PasswordFields({
  username,
  avoid = [],
  submitLabel,
  busy = false,
  error = "",
  onSubmit,
  children,
}: PasswordFieldsProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const result = checkPassword(password, avoid);
  const matches = password === confirm;
  const canSubmit = result.ok && matches && !busy;

  function suggest() {
    let next = suggestPassword();
    for (let i = 0; i < 20 && !checkPassword(next, avoid).ok; i++) next = suggestPassword();
    setPassword(next);
    setConfirm(next);
    setShow(true);
  }

  function copy() {
    navigator.clipboard
      ?.writeText(password)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit(password);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Gives password managers a username to save this password under. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={username}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        data-allow-autofill="true"
        className="sr-only"
      />

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="vault-new-password" className="text-[13px] font-medium text-secondary">
            Password
          </label>
          <div className="flex items-center gap-3 text-[13px]">
            <button type="button" onClick={suggest} className="text-secondary hover:text-text">
              Suggest one
            </button>
            <button type="button" onClick={() => setShow((value) => !value)} className="text-secondary hover:text-text">
              {show ? "Hide" : "Show"}
            </button>
            {show && password.length > 0 && (
              <button type="button" onClick={copy} className="text-secondary hover:text-text">
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>
        <input
          id="vault-new-password"
          type={show ? "text" : "password"}
          name="new-password"
          autoComplete="new-password"
          data-allow-autofill="true"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass + " mt-1.5"}
        />

        {password.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((segment) => (
                <span
                  key={segment}
                  className={
                    "h-1 flex-1 rounded-full " + (segment <= SEGMENTS[result.level] ? SEGMENT_COLOR[result.level] : "bg-border")
                  }
                />
              ))}
            </div>
            <p className="mt-1.5 text-[13px] text-secondary" role="status">
              {result.hint}
            </p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="vault-confirm-password" className="text-[13px] font-medium text-secondary">
          Type it again
        </label>
        <input
          id="vault-confirm-password"
          type={show ? "text" : "password"}
          name="new-password-confirm"
          autoComplete="new-password"
          data-allow-autofill="true"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={inputClass + " mt-1.5"}
        />
        {confirm.length > 0 && !matches && (
          <p className="mt-1.5 text-[13px] text-alert">The two passwords don&apos;t match.</p>
        )}
      </div>

      {children}

      {error && (
        <p className="text-[13px] text-alert" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="h-11 w-full rounded-control bg-text text-[14px] font-medium text-bg transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
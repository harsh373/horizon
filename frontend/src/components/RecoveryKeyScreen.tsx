import { useState } from "react";

function normalize(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "").replace(/0/g, "O").replace(/1/g, "I");
}

function downloadKey(code: string): void {
  const text =
    "Horizon recovery key\n\n" +
    code +
    "\n\nKeep this file private. Anyone with this key and access to your account could open your journal.\n" +
    "If you lose both your password and this key, your journal cannot be recovered by anyone.\n";
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "horizon-recovery-key.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The code only ever contains A-Z, 2-7 and dashes, so it is safe to place inside this HTML.
function printKey(code: string): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(
    '<!doctype html><html><head><title>Horizon recovery key</title></head><body style="font-family:sans-serif;padding:40px">' +
      "<h1>Horizon recovery key</h1>" +
      "<p>Keep this page somewhere safe. If you lose both your password and this key, your journal cannot be recovered by anyone.</p>" +
      '<p style="font:600 28px monospace;letter-spacing:2px;margin-top:32px">' +
      code +
      "</p></body></html>",
  );
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 60_000);
}

interface RecoveryKeyScreenProps {
  recoveryCode: string;
  busy: boolean;
  error: string;
  onContinue: () => void;
  onCancel: () => void;
  continueLabel?: string;
  busyLabel?: string;
}

export default function RecoveryKeyScreen({
  recoveryCode,
  busy,
  error,
  onContinue,
  onCancel,
  continueLabel = "Turn on Maximum privacy",
  busyLabel = "Turning on…",
}: RecoveryKeyScreenProps) {
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [copied, setCopied] = useState(false);

  const tail = normalize(recoveryCode).slice(-8);
  const typedOk = normalize(typed) === tail;
  const canContinue = typedOk && understood && !busy;

  function copy() {
    navigator.clipboard
      ?.writeText(recoveryCode)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  const buttonClass =
    "h-9 rounded-control border border-border px-3 text-[13px] font-medium text-text transition-colors duration-150 hover:bg-hover";

  return (
    <div className="space-y-5">
      <h3 className="font-serif text-[1.25rem] leading-snug tracking-tight">Save your recovery key</h3>

      <div className="rounded-control border border-alert/40 bg-alert/10 p-4 text-[14px] leading-relaxed text-text">
        This key is the only way back into your journal if you forget your password. If you lose both, your journal cannot be
        recovered by anyone, including me. Save it now, somewhere you will not lose it.
      </div>

      <p className="select-all break-all rounded-control border border-border bg-surface p-4 text-center font-mono text-[18px] font-semibold tracking-wider text-text">
        {recoveryCode}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => downloadKey(recoveryCode)} className={buttonClass}>
          Download as file
        </button>
        <button type="button" onClick={copy} className={buttonClass}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={() => printKey(recoveryCode)} className={buttonClass}>
          Print
        </button>
      </div>
      <p className="text-[13px] text-secondary">A password manager is the best place for it.</p>

      <div>
        <label htmlFor="recovery-typeback" className="text-[13px] font-medium text-secondary">
          To check you saved it, type the last two groups of the key (the last 8 characters)
        </label>
        <input
          id="recovery-typeback"
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="XXXX-XXXX"
          className="mt-1.5 h-11 w-full rounded-control border border-border bg-surface px-3 font-mono text-[16px] uppercase text-text placeholder:text-tertiary focus:border-secondary"
        />
        {typed.length > 0 && !typedOk && <p className="mt-1.5 text-[13px] text-secondary">That doesn&apos;t match yet.</p>}
      </div>

      <label className="flex items-start gap-2.5 text-[14px] text-text">
        <input
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>I have saved my recovery key and I understand that without it and my password, nobody can recover my journal.</span>
      </label>

      {error && (
        <p className="text-[13px] text-alert" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="h-11 flex-1 rounded-control bg-text text-[14px] font-medium text-bg transition-opacity duration-150 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? busyLabel : continueLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-11 px-3 text-[14px] text-secondary hover:text-text disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
import { Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import PrivateVaultActions from "../components/PrivateVaultActions";
import { useVault } from "../components/VaultProvider";

export default function Settings() {
  const { forgetDevice } = useVault();
  const [forgotten, setForgotten] = useState(false);

  async function handleForget() {
    await forgetDevice();
    setForgotten(true);
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-10 sm:px-8 lg:py-16">
      <h1 className="type-display">Settings</h1>

      <section className="mt-10 rounded-card border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Lock size={16} strokeWidth={1.75} className="text-secondary" />
          <h2 className="font-serif text-[1.35rem] leading-snug tracking-tight">Your journal is private</h2>
        </div>

        <div className="mt-4 space-y-3 text-[14px] leading-relaxed text-secondary">
          <p>
            Your journal is locked with your password and recovery key. We don&apos;t keep a copy of your key, so we can&apos;t open your
            journal and we can&apos;t recover it for you.
          </p>
          <p className="font-medium text-text">
            If you lose both your password and your recovery key, your journal is gone for good.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => void handleForget()}
              className="h-9 rounded-control border border-border px-3 text-[13px] font-medium text-text transition-colors duration-150 hover:bg-hover"
            >
              Forget this device
            </button>
            {forgotten && (
              <p className="mt-2 text-[13px] text-secondary">
                Done. This device will ask for your password the next time you open Horizon.
              </p>
            )}
          </div>

          <PrivateVaultActions />
        </div>
      </section>

      <p className="mt-6 text-[13px] text-tertiary">
        <Link to="/privacy" className="underline underline-offset-2 hover:text-secondary">
          How Horizon handles your data
        </Link>
      </p>
    </div>
  );
}
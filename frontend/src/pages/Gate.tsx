import { SignInButton } from "@clerk/react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./gate.css";

export default function Gate() {
  return (
    <main className="gate relative flex min-h-full items-center justify-center overflow-hidden bg-bg px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="gate-sky" aria-hidden="true">
        <span className="gate-haze" />
        <span className="gate-band" />
        <span className="gate-neb gate-neb-a" />
        <span className="gate-neb gate-neb-b" />
        <span className="gate-neb gate-neb-c" />
        <span className="gate-dust" />
        <span className="gate-near" />
        <span className="gate-nova" />
        <span className="gate-shoot" />
      </div>

      <div className="fade-up relative z-10 flex w-full max-w-sm flex-col items-center py-10 text-center">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="mx-auto h-16 w-16 select-none rounded-[16px] object-contain ring-1 ring-border"
        />
        <h1 className="mt-6 font-serif text-[2.25rem] font-medium leading-tight tracking-tight sm:text-[2.75rem]">
          Horizon
        </h1>
        <p className="mt-3 text-[17px] text-secondary">A private archive of my life.</p>

        {/* One small button. Clerk's sign-in opens as a popup only when it's clicked. */}
        <SignInButton mode="modal">
          <button
            type="button"
            className="mt-10 inline-flex h-11 items-center gap-2 rounded-full bg-text px-6 text-[15px] font-semibold text-bg transition-opacity duration-200 hover:opacity-85 active:scale-[0.98]"
          >
            Continue
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </SignInButton>

        <Link
          to="/privacy"
          className="mt-8 text-[13px] text-secondary transition-colors duration-150 hover:text-text"
        >
          Privacy
        </Link>
      </div>
    </main>
  );
}
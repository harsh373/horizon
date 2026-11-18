import { SignIn } from "@clerk/react";
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
        <p className="mb-8 mt-3 text-[17px] text-secondary">A private archive of my life.</p>

        <SignIn routing="hash" />
      </div>
    </main>
  );
}
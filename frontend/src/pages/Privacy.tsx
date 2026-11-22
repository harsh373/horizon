import { Link } from "react-router-dom";

const APP_NAME = "Horizon";
const CONTACT_EMAIL = "harshsrivastava726@gmail.com";
const CONTACT_PHONE = "+91 7007400557";
const LAST_UPDATED = "22 November 2026";

interface Section {
  title: string;
  body: string[];
  list?: string[];
  warning?: boolean;
}

const SECTIONS: Section[] = [
  {
    title: "We believe in end-to-end encryption",
    body: [
      "Your journal is end-to-end encrypted. Everything you write and every photo you add is locked in your browser before it leaves your device. Nobody can read it. Not hackers, not other users, and not Horizon.",
      "We believe your memories belong only to you. That is why we built Horizon so that nobody can read your journal, not even us. We cannot reset your password or recover your journal if you lose your recovery key.",
      "We never sell your data, and we don't use it for ads.",
    ],
  },
  {
    title: "Your secret key",
    body: [
      "To make this possible, we give you a secret key, called your recovery key, and you choose a password. Together they are the only things that can open your journal.",
      "Your password and your recovery key never reach us. We don't see them and we don't store them anywhere we can read. Please save both yourself, in a password manager or somewhere safe.",
      "Save your recovery key somewhere safe. If you ever forget your password, it is the only way back in.",
    ],
  },
  {
    title: "If you forget your password, this is important",
    body: [
      "Because nobody but you can open your journal, nobody can reset it for you. There is no reset email, no support override, and signing in with Google will not unlock it. This is the price of real privacy, so please read this carefully.",
    ],
    list: [
      "You forget your password but still have your recovery key: you get back in and choose a new password.",
      "You lose your recovery key but still know your password: you can make a new recovery key in Settings.",
      "You lose both your password and your recovery key: your journal is gone for good. Nobody can recover it, including us.",
      "You sign in on a new device or browser: you will need your password there. Without it, that device stays locked.",
    ],
    warning: true,
  },
  {
    title: "How it works",
    body: [
      "Your browser encrypts each entry, thought, plan, quote and photo with AES-256-GCM, a standard that is widely trusted. Every record is locked to your account, so it can't be copied into someone else's.",
      "Your password is turned into a lock using PBKDF2 with 600,000 rounds, which makes guessing it slow and expensive. Your recovery key is a long random code that is impossible to guess.",
      "Photos have their location and camera details removed before they are encrypted and uploaded.",
      "When you first sign in, you lock your journal before you can use Horizon. Until that is finished, the server holds a temporary key for your account. When you finish, we delete our copy, so from then on we cannot open your journal.",
    ],
  },
  {
    title: "What stays visible to the app",
    body: ["Some details have to stay readable for the app to work. The content of your writing and photos is not among them."],
    list: [
      "Your account ID and the sign-in details held by Clerk",
      "The dates your entries and plans belong to",
      "How many records you have, and when they were created or changed",
      "How many photos a day has, when they were uploaded, and the rough size of the encrypted files",
    ],
  },
  {
    title: "What this does not protect against",
    body: [
      "Encryption protects your journal where it is stored. It cannot protect you if someone else has your password or recovery key, or if your own device is infected or shared. Don't tick \"Remember this device\" on a computer that other people use.",
    ],
  },
  {
    title: "Who helps us run it",
    body: ["These services handle your data, and only in encrypted form where it matters:"],
    list: [
      "Clerk, for sign-in",
      "A cloud database, for your encrypted records",
      "Cloudinary, for your encrypted photo files",
      "Our hosting provider, which keeps standard technical logs such as IP addresses",
    ],
  },
  {
    title: "Deleting your data",
    body: [
      `Email ${CONTACT_EMAIL} and we will delete your account, your encrypted records and your encrypted photos. Backups kept by our providers may take a little while to expire.`,
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "If we change how your data is handled, we'll update this page and the date above, and tell you in the app if the change matters.",
      `Questions: email ${CONTACT_EMAIL} or call ${CONTACT_PHONE}.`,
    ],
  },
];

interface PrivacyProps {
  // True only when shown to a signed-out visitor, outside the app shell.
  standalone?: boolean;
}

export default function Privacy({ standalone = false }: PrivacyProps) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pb-24 pt-8 sm:pt-12">
      {standalone && (
        <Link
          to="/"
          className="mb-6 inline-block text-[14px] font-medium text-secondary transition-colors duration-150 hover:text-text"
        >
          ← Back to {APP_NAME}
        </Link>
      )}

      <header className="pb-10 pt-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-tertiary">Privacy</p>
        <h1 className="mt-3 font-sans text-[2.25rem] font-semibold leading-[1.05] tracking-tight text-text sm:text-[3rem]">
          Your journal stays yours
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-secondary">
          End-to-end encrypted. Nobody can read your journal, not even {APP_NAME}.
        </p>
        <p className="mt-4 text-[13px] text-tertiary">Last updated {LAST_UPDATED}</p>
      </header>

      <div>
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className={
              section.warning
                ? "my-10 rounded-2xl border-2 border-text p-6 sm:p-7"
                : "border-t border-border py-9"
            }
          >
            {section.warning && (
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-text">Important</p>
            )}
            <h2 className="font-sans text-[1.3rem] font-semibold leading-snug tracking-tight text-text">
              {section.title}
            </h2>
            <div className="mt-4 space-y-4 text-[16px] leading-[1.7] text-secondary">
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.list && (
                <ul className="list-disc space-y-2.5 pl-5 marker:text-tertiary">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
        <div className="border-t border-border" />
      </div>
    </div>
  );
}
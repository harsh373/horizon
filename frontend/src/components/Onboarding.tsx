import { useAuth } from "@clerk/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./onboarding.css";

// "private": only the user holds the key (true now that Private Vault is live).
// "managed": Horizon holds the keys. Keep this only as a fallback if you ever roll back.
type PrivacyMode = "managed" | "private";
const PRIVACY_MODE: PrivacyMode = "private";

// Other parts of the app (for example a "Replay intro" button) can call:
// window.dispatchEvent(new Event("horizon:show-intro"))
const REPLAY_EVENT = "horizon:show-intro";

const seenKey = (userId: string) => `horizon-intro-seen:${userId}`;

function hasSeen(userId: string): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markSeen(userId: string): void {
  try {
    localStorage.setItem(seenKey(userId), "1");
  } catch {
    // storage blocked: the intro may show again next visit, which is harmless
  }
}

// ---------- Stars (deterministic, so they don't jump around on re-render) ----------

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(count: number): Star[] {
  const random = seeded(2026);
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 100,
    size: 1 + random() * 1.8,
    opacity: 0.35 + random() * 0.6,
    duration: 2.5 + random() * 4,
    delay: random() * 5,
  }));
}

// ---------- Little illustrations ----------

function WelcomeVisual() {
  return (
    <div className="ob-logo-wrap">
      <span className="ob-logo-halo" />
      <img src="/logo.png" alt="" draggable={false} className="ob-logo" />
    </div>
  );
}

function JournalVisual() {
  return (
    <svg viewBox="0 0 140 130" className="ob-svg" aria-hidden="true">
      <rect x="28" y="10" width="84" height="110" rx="10" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" />
      <circle cx="46" cy="30" r="5" fill="none" stroke="rgba(255,255,255,0.7)" />
      <rect x="58" y="27" width="40" height="6" rx="3" fill="rgba(255,255,255,0.6)" />
      <rect x="40" y="48" width="60" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
      <rect x="40" y="60" width="52" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
      <rect x="40" y="72" width="58" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
      <rect x="40" y="90" width="26" height="20" rx="4" fill="rgba(255,255,255,0.12)" />
      <rect x="72" y="90" width="26" height="20" rx="4" fill="rgba(255,255,255,0.12)" />
      <circle cx="116" cy="22" r="2" fill="#fff" className="ob-pulse" />
      <circle cx="20" cy="70" r="1.6" fill="#fff" className="ob-pulse ob-pulse-b" />
    </svg>
  );
}

function PrivacyVisual() {
  return (
    <svg viewBox="0 0 140 130" className="ob-svg" aria-hidden="true">
      <circle cx="70" cy="66" r="52" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="2 7" className="ob-spin" />
      <circle cx="70" cy="66" r="38" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" />
      <path d="M56 62v-8a14 14 0 0 1 28 0v8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <rect x="50" y="62" width="40" height="30" rx="7" fill="rgba(255,255,255,0.14)" stroke="#fff" strokeWidth="2" />
      <circle cx="70" cy="76" r="3.5" fill="#fff" />
      <rect x="68.5" y="78" width="3" height="8" rx="1.5" fill="#fff" />
      <circle cx="122" cy="40" r="2" fill="#fff" className="ob-pulse" />
      <circle cx="18" cy="96" r="1.6" fill="#fff" className="ob-pulse ob-pulse-b" />
    </svg>
  );
}

function ThoughtsVisual() {
  const stars = [
    { x: 40, y: 38, r: 5 },
    { x: 92, y: 30, r: 7 },
    { x: 70, y: 74, r: 9 },
    { x: 112, y: 88, r: 4.5 },
    { x: 28, y: 92, r: 4 },
  ];
  return (
    <svg viewBox="0 0 140 130" className="ob-svg" aria-hidden="true">
      <defs>
        <radialGradient id="ob-star-glow">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {stars.map((s, i) => (
        <g key={i} className={i % 2 ? "ob-pulse ob-pulse-b" : "ob-pulse"}>
          <circle cx={s.x} cy={s.y} r={s.r * 3.2} fill="url(#ob-star-glow)" opacity="0.55" />
          <circle cx={s.x} cy={s.y} r={s.r / 2.2} fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

function MapVisual() {
  return (
    <svg viewBox="0 0 220 130" className="ob-svg ob-svg-wide" aria-hidden="true">
      <rect x="2" y="2" width="216" height="126" rx="14" fill="#050506" stroke="rgba(255,255,255,0.18)" />
      <g fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1">
        <path d="M10 30 L90 24 L150 40 L210 34" />
        <path d="M14 70 L70 64 L130 80 L208 70" />
        <path d="M20 108 L100 98 L160 112 L206 104" />
        <path d="M44 8 L52 62 L40 122" />
        <path d="M120 6 L126 56 L112 124" />
        <path d="M176 10 L170 64 L184 122" />
      </g>
      <path d="M6 96 C60 70 110 80 150 52 S200 30 214 22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.4" strokeLinecap="round" />
      <g fill="#ff9a2e">
        <circle cx="62" cy="76" r="3.6" className="ob-pulse" />
        <circle cx="132" cy="62" r="3.6" className="ob-pulse ob-pulse-b" />
        <circle cx="176" cy="40" r="3.6" className="ob-pulse" />
        <circle cx="96" cy="104" r="3" className="ob-pulse ob-pulse-b" />
      </g>
      <circle cx="36" cy="40" r="3.4" fill="#3b82f6" />
    </svg>
  );
}

function TracksVisual() {
  const filled = new Set([0, 1, 2, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19]);
  return (
    <svg viewBox="0 0 160 110" className="ob-svg" aria-hidden="true">
      {Array.from({ length: 21 }, (_, i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        const cx = 22 + col * 19;
        const cy = 24 + row * 28;
        const isToday = i === 20;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="7.5"
            fill={filled.has(i) ? "#fff" : "none"}
            stroke={isToday ? "#ff6b5e" : "rgba(255,255,255,0.35)"}
            strokeWidth={isToday ? 2 : 1}
            opacity={filled.has(i) ? 0.92 : 1}
          />
        );
      })}
    </svg>
  );
}

function ReadyVisual() {
  return (
    <svg viewBox="0 0 140 130" className="ob-svg" aria-hidden="true">
      <path
        d="M70 12 L108 26 V62 C108 88 92 104 70 116 C48 104 32 88 32 62 V26 Z"
        fill="rgba(255,255,255,0.08)"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M52 64 L65 77 L90 50" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="120" cy="24" r="2" fill="#fff" className="ob-pulse" />
      <circle cx="18" cy="48" r="1.8" fill="#fff" className="ob-pulse ob-pulse-b" />
      <circle cx="124" cy="96" r="1.6" fill="#fff" className="ob-pulse" />
    </svg>
  );
}

// ---------- The cards ----------

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  visual: ReactNode;
}

function getSlides(mode: PrivacyMode): Slide[] {
  const privacy: Slide =
    mode === "private"
      ? {
          id: "privacy",
          eyebrow: "Privacy",
          title: "Only you hold the key",
          body: "Everything you write and every photo you add is encrypted on your device before it leaves. Nobody, not even us, can read your journal. That also means we can't recover it for you, so keep your recovery key somewhere safe.",
          visual: <PrivacyVisual />,
        }
      : {
          id: "privacy",
          eyebrow: "Privacy",
          title: "Encrypted before it's stored",
          body: "Everything you write and every photo you add is encrypted in your browser before it reaches our servers. If our database were ever stolen, it would be unreadable. We keep the keys safe for you, so you never lose your memories.",
          visual: <PrivacyVisual />,
        };

  const ready: Slide =
    mode === "private"
      ? {
          id: "ready",
          eyebrow: "You're all set",
          title: "Write freely",
          body: "This place is yours alone. Your journal is private, so you can be carefree and write whatever is true. Just keep your recovery key safe, because it's the only way back in if you forget your passphrase.",
          visual: <ReadyVisual />,
        }
      : {
          id: "ready",
          eyebrow: "You're all set",
          title: "Write freely",
          body: "Your journal is encrypted, never sold and never used for ads. Take a breath, and write whatever is true.",
          visual: <ReadyVisual />,
        };

  return [
    {
      id: "welcome",
      eyebrow: "Welcome",
      title: "Welcome to Horizon",
      body: "A safe place to write. Your private corner of the sky for the days, thoughts and places that make up your life.",
      visual: <WelcomeVisual />,
    },
    {
      id: "journal",
      eyebrow: "Journal",
      title: "One page for every day",
      body: "Write what you did, what drained you and what you'd do differently tomorrow. Add photos, set the mood, and let each day settle into your sky.",
      visual: <JournalVisual />,
    },
    privacy,
    {
      id: "thoughts",
      eyebrow: "Thoughts",
      title: "Every thought is a star",
      body: "Capture a thought the moment it appears. Each one becomes a star in your sky, ready to revisit, rearrange or let go.",
      visual: <ThoughtsVisual />,
    },
    {
      id: "map",
      eyebrow: "ElseWhere",
      title: "Words worth keeping",
      body: "Save the quotes and lines that stay with you. Each one becomes a glowing dot on a dark street map of its own, a place you can wander back to whenever you need those words.",
      visual: <MapVisual />,
    },
    {
      id: "tracks",
      eyebrow: "Tracks",
      title: "Things you keep doing",
      body: "Meditation, workouts, practice. Create a track, check it off each day and watch your calendar fill in. No pressure, just proof that you showed up.",
      visual: <TracksVisual />,
    },
    ready,
  ];
}

// ---------- The screen ----------

export default function Onboarding() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const slides = useMemo(() => getSlides(PRIVACY_MODE), []);
  const stars = useMemo(() => makeStars(90), []);
  const startX = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  // Show once per signed-in user.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (!hasSeen(userId)) setOpen(true);
  }, [isLoaded, isSignedIn, userId]);

  // Lets a "Replay intro" button reopen it.
  useEffect(() => {
    const show = () => {
      setIndex(0);
      setDirection(1);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, show);
    return () => window.removeEventListener(REPLAY_EVENT, show);
  }, []);

  function finish() {
    if (userId) markSeen(userId);
    setOpen(false);
  }

  function go(delta: 1 | -1) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= slides.length) {
      finish();
      return;
    }
    setDirection(delta);
    setIndex(next);
  }

  // Keyboard, scroll lock and focus while open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      // Never hijack keys while someone is typing in a field behind the cards.
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (typing) return;
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  });

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, index]);

  if (!open) return null;

  const slide = slides[index] as Slide;
  const isLast = index === slides.length - 1;

  return (
    <div className="ob-root" role="dialog" aria-modal="true" aria-label="Welcome to Horizon">
      <div className="ob-sky" aria-hidden="true">
        <span className="ob-haze ob-haze-a" />
        <span className="ob-haze ob-haze-b" />
        {stars.map((star, i) => (
          <span
            key={i}
            className={"ob-star" + (star.size > 2.2 ? " ob-star-big" : "")}
            style={
              {
                "--x": `${star.x}%`,
                "--y": `${star.y}%`,
                "--s": `${star.size}px`,
                "--o": star.opacity,
                "--d": `${star.duration}s`,
                "--delay": `${star.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {!isLast && (
        <button type="button" className="ob-skip" onClick={finish}>
          Skip
          <X size={14} aria-hidden="true" />
        </button>
      )}

      <div
        className="ob-stage"
        onPointerDown={(event) => {
          startX.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (startX.current === null) return;
          const dx = event.clientX - startX.current;
          startX.current = null;
          if (dx < -50) go(1);
          else if (dx > 50) go(-1);
        }}
      >
        <section
          key={slide.id}
          ref={cardRef}
          tabIndex={-1}
          aria-live="polite"
          className={"ob-card " + (direction > 0 ? "ob-enter-next" : "ob-enter-prev")}
        >
          <div className="ob-visual">{slide.visual}</div>
          <p className="ob-eyebrow">{slide.eyebrow}</p>
          <h2 className="ob-title">{slide.title}</h2>
          <p className="ob-body">{slide.body}</p>
        </section>
      </div>

      <div className="ob-nav">
        <div className="ob-dots" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.id} className={"ob-dot" + (i === index ? " ob-dot-active" : "")} />
          ))}
        </div>
        <div className="ob-buttons">
          <button
            type="button"
            className="ob-btn ob-btn-ghost"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous card"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" className="ob-btn ob-btn-primary" onClick={() => go(1)}>
            {isLast ? "Enter Horizon" : "Next"}
            {!isLast && <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
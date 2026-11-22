export type Strength = "weak" | "okay" | "strong";

export interface StrengthResult {
  level: Strength;
  hint: string;
  ok: boolean; // okay or strong: allowed to use
}

const MIN_LENGTH = 12;

const COMMON = [
  "password",
  "passw0rd",
  "letmein",
  "qwerty",
  "iloveyou",
  "welcome",
  "admin",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "trustno1",
  "superman",
  "abc123",
  "123123",
  "111111",
  "000000",
];

const RUNS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function hasRun(lower: string): boolean {
  const run = 5;
  for (const sequence of RUNS) {
    for (const text of [sequence, [...sequence].reverse().join("")]) {
      for (let i = 0; i + run <= text.length; i++) {
        if (lower.includes(text.slice(i, i + run))) return true;
      }
    }
  }
  return false;
}

function weak(hint: string): StrengthResult {
  return { level: "weak", hint, ok: false };
}

// `avoid` holds things the password must not contain, such as the person's name or email name.
export function checkPassword(password: string, avoid: string[] = []): StrengthResult {
  const value = password.normalize("NFKC");
  const lower = value.toLowerCase();

  if (value.length < MIN_LENGTH) return weak(`Use at least ${MIN_LENGTH} characters.`);
  if (COMMON.some((word) => lower.includes(word))) return weak("That contains a very common password. Pick something else.");
  if (avoid.some((token) => token.length >= 4 && lower.includes(token.toLowerCase()))) {
    return weak("Leave your name and email out of it.");
  }
  if (hasRun(lower)) return weak("Avoid runs like 12345 or qwerty.");
  if (new Set(value).size < 7) return weak("Use more different characters.");

  const classes =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/[0-9]/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  if (value.length >= 20) return { level: "strong", hint: "Strong.", ok: true };
  if (value.length >= 16 && classes >= 2) return { level: "strong", hint: "Strong.", ok: true };
  if (value.length >= 12 && classes >= 3) {
    return { level: "okay", hint: "Okay. A longer one is stronger.", ok: true };
  }
  if (value.length >= 16) {
    return { level: "okay", hint: "Okay. Adding capitals, numbers or a symbol makes it stronger.", ok: true };
  }
  return weak("Add length, or mix capitals, numbers and symbols.");
}
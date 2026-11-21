import type { DayKey } from "../config/dates";
import type { EncryptedPayload } from "../crypto/vaultCrypto";
import { decryptRecord, encryptRecord, onVaultCleared } from "../crypto/vaultSession";
import { api } from "./api";
import { serialize } from "./queue";

export interface SettingsFields {
  countdownDate: DayKey | "";
  countdownLabel: string;
}

const KIND = "settings";
const RECORD_ID = "singleton";
const EMPTY: SettingsFields = { countdownDate: "", countdownLabel: "" };
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

let cached: SettingsFields | null = null;
onVaultCleared(() => {
  cached = null;
});

export async function fetchSettings(): Promise<SettingsFields> {
  const { data } = await api.get<{ settings: { payload: EncryptedPayload } | null }>("/settings");
  if (!data.settings) {
    cached = { ...EMPTY };
    return cached;
  }
  // If this fails to decrypt it throws, so a blank settings object never overwrites the real one.
  const value = await decryptRecord<Partial<SettingsFields>>(KIND, RECORD_ID, data.settings.payload);
  cached = {
    countdownDate: typeof value.countdownDate === "string" ? (value.countdownDate as DayKey | "") : "",
    countdownLabel: typeof value.countdownLabel === "string" ? value.countdownLabel : "",
  };
  return cached;
}

export function saveSettings(patch: Partial<SettingsFields>): Promise<SettingsFields> {
  return serialize("settings", async () => {
    const base = cached ?? (await fetchSettings());

    const countdownDate = patch.countdownDate ?? base.countdownDate;
    if (countdownDate !== "" && !DAY_KEY.test(countdownDate)) {
      throw new Error("countdownDate must look like 2026-09-23, or be empty");
    }
    const countdownLabel = patch.countdownLabel !== undefined ? patch.countdownLabel.trim() : base.countdownLabel;
    if (countdownLabel.length > 120) throw new Error("countdownLabel is too long");

    const next: SettingsFields = { countdownDate, countdownLabel };
    const payload = await encryptRecord(KIND, RECORD_ID, next);
    await api.put("/settings", { payload });
    cached = next;
    return next;
  });
}
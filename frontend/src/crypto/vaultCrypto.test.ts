import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "./bytes";
import {
  KDF_ITERATIONS,
  changePassphrase,
  createVault,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  regenerateRecoveryCode,
  resetPassphraseWithRecoveryCode,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  type RecordContext,
} from "./vaultCrypto";

const FAST = { iterations: 1000 };
const PASSPHRASE = "correct horse battery staple";
const ctx: RecordContext = { userId: "user_abc", kind: "journal", recordId: "rec-1" };

describe("vault creation and unlocking", () => {
  it("ships a strong default work factor", () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("round-trips a record", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "dear diary", ctx);
    expect(await decryptText(masterKey, payload, ctx)).toBe("dear diary");
  });

  it("handles unicode and emoji", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const text = "आज का दिन 🌅 — good day";
    const payload = await encryptText(masterKey, text, ctx);
    expect(await decryptText(masterKey, payload, ctx)).toBe(text);
  });

  it("round-trips JSON", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const value = { mood: "good", photos: [1, 2], note: "ok" };
    const payload = await encryptJson(masterKey, value, ctx);
    expect(await decryptJson(masterKey, payload, ctx)).toEqual(value);
  });

  it("unlocks again with the right passphrase and reads old data", async () => {
    const { masterKey, record } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    const again = await unlockWithPassphrase(record, PASSPHRASE, FAST);
    expect(await decryptText(again, payload, ctx)).toBe("secret");
  });

  it("rejects a wrong passphrase", async () => {
    const { record } = await createVault(PASSPHRASE, FAST);
    await expect(unlockWithPassphrase(record, "wrong horse battery staple", FAST)).rejects.toMatchObject({
      code: "WRONG_SECRET",
    });
  });

  it("rejects a short passphrase", async () => {
    await expect(createVault("short", FAST)).rejects.toMatchObject({ code: "WEAK_PASSPHRASE" });
  });

  it("treats the same passphrase typed in different unicode forms as equal", async () => {
    const composed = "caf\u00e9 au lait demain";
    const decomposed = "cafe\u0301 au lait demain";
    const { record } = await createVault(composed, FAST);
    await expect(unlockWithPassphrase(record, decomposed, FAST)).resolves.toBeDefined();
  });

  it("never hands back an exportable master key", async () => {
    const { masterKey, record } = await createVault(PASSPHRASE, FAST);
    await expect(crypto.subtle.exportKey("raw", masterKey)).rejects.toThrow();
    const unlocked = await unlockWithPassphrase(record, PASSPHRASE, FAST);
    await expect(crypto.subtle.exportKey("raw", unlocked)).rejects.toThrow();
  });

  it("refuses a record whose work factor was weakened", async () => {
    const { record } = await createVault(PASSPHRASE, FAST); // 1000 iterations
    await expect(unlockWithPassphrase(record, PASSPHRASE)).rejects.toMatchObject({ code: "WEAK_KDF" });
  });
});

describe("recovery code", () => {
  it("has the expected shape", async () => {
    const { recoveryCode } = await createVault(PASSPHRASE, FAST);
    expect(recoveryCode).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  });

  it("unlocks and reads data written before", async () => {
    const { masterKey, record, recoveryCode } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    const viaRecovery = await unlockWithRecoveryCode(record, recoveryCode, FAST);
    expect(await decryptText(viaRecovery, payload, ctx)).toBe("secret");
  });

  it("accepts lowercase, spaces and missing dashes", async () => {
    const { record, recoveryCode } = await createVault(PASSPHRASE, FAST);
    const sloppy = recoveryCode.toLowerCase().replace(/-/g, " ");
    await expect(unlockWithRecoveryCode(record, sloppy, FAST)).resolves.toBeDefined();
  });

  it("rejects a malformed code", async () => {
    const { record } = await createVault(PASSPHRASE, FAST);
    await expect(unlockWithRecoveryCode(record, "nope", FAST)).rejects.toMatchObject({ code: "BAD_RECOVERY_CODE" });
  });

  it("rejects a well-formed code from a different vault", async () => {
    const a = await createVault(PASSPHRASE, FAST);
    const b = await createVault(PASSPHRASE, FAST);
    await expect(unlockWithRecoveryCode(a.record, b.recoveryCode, FAST)).rejects.toMatchObject({ code: "WRONG_SECRET" });
  });

  it("regenerating invalidates the old code and keeps data readable", async () => {
    const { masterKey, record, recoveryCode } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    const next = await regenerateRecoveryCode(record, PASSPHRASE, FAST);

    await expect(unlockWithRecoveryCode(next.record, recoveryCode, FAST)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    const viaNew = await unlockWithRecoveryCode(next.record, next.recoveryCode, FAST);
    expect(await decryptText(viaNew, payload, ctx)).toBe("secret");
  });
});

describe("changing and resetting the passphrase", () => {
  it("changing it keeps old data readable and retires the old passphrase", async () => {
    const { masterKey, record } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);

    const changed = await changePassphrase(record, PASSPHRASE, "a brand new passphrase", FAST);
    expect(await decryptText(changed.masterKey, payload, ctx)).toBe("secret");
    await expect(unlockWithPassphrase(changed.record, PASSPHRASE, FAST)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    await expect(unlockWithPassphrase(changed.record, "a brand new passphrase", FAST)).resolves.toBeDefined();
  });

  it("changing it needs the current passphrase", async () => {
    const { record } = await createVault(PASSPHRASE, FAST);
    await expect(changePassphrase(record, "not the passphrase", "a brand new passphrase", FAST)).rejects.toMatchObject({
      code: "WRONG_SECRET",
    });
  });

  it("forgot-passphrase reset works with the recovery code, and the code still works after", async () => {
    const { masterKey, record, recoveryCode } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);

    const reset = await resetPassphraseWithRecoveryCode(record, recoveryCode, "my replacement passphrase", FAST);
    expect(await decryptText(reset.masterKey, payload, ctx)).toBe("secret");
    await expect(unlockWithPassphrase(reset.record, PASSPHRASE, FAST)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    await expect(unlockWithRecoveryCode(reset.record, recoveryCode, FAST)).resolves.toBeDefined();
  });
});

describe("tamper and misuse resistance", () => {
  it("uses a fresh IV, so identical text never gives identical ciphertext", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const a = await encryptText(masterKey, "same", ctx);
    const b = await encryptText(masterKey, "same", ctx);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("detects a modified ciphertext", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    const bytes = fromBase64(payload.ciphertext);
    bytes[0] = (bytes[0] as number) ^ 1;
    await expect(decryptText(masterKey, { ...payload, ciphertext: toBase64(bytes) }, ctx)).rejects.toMatchObject({
      code: "DECRYPT_FAILED",
    });
  });

  it("refuses a ciphertext moved to another record id", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    await expect(decryptText(masterKey, payload, { ...ctx, recordId: "rec-2" })).rejects.toMatchObject({
      code: "DECRYPT_FAILED",
    });
  });

  it("refuses a ciphertext moved to another user or record type", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    await expect(decryptText(masterKey, payload, { ...ctx, userId: "user_other" })).rejects.toMatchObject({
      code: "DECRYPT_FAILED",
    });
    await expect(decryptText(masterKey, payload, { ...ctx, kind: "thought" })).rejects.toMatchObject({
      code: "DECRYPT_FAILED",
    });
  });

  it("refuses data written by an unknown format version", async () => {
    const { masterKey } = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(masterKey, "secret", ctx);
    await expect(decryptText(masterKey, { ...payload, v: 99 }, ctx)).rejects.toMatchObject({
      code: "UNSUPPORTED_VERSION",
    });
  });

  it("cannot read another vault's data", async () => {
    const a = await createVault(PASSPHRASE, FAST);
    const b = await createVault(PASSPHRASE, FAST);
    const payload = await encryptText(a.masterKey, "secret", ctx);
    await expect(decryptText(b.masterKey, payload, ctx)).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
  });
});
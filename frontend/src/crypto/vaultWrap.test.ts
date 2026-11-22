import { describe, expect, it } from "vitest";
import { unlockWithPassphrase, unlockWithRecoveryCode } from "./vaultCrypto";
import { createVaultFromKey, sameKey } from "./vaultWrap";

const FAST = { iterations: 1000 };
const PASSPHRASE = "correct horse battery staple";

async function newKey(extractable = true): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

describe("createVaultFromKey", () => {
  it("the passphrase unlocks the SAME key that was wrapped", async () => {
    const master = await newKey();
    const { record } = await createVaultFromKey(master, PASSPHRASE, FAST);
    const unlocked = await unlockWithPassphrase(record, PASSPHRASE, FAST);
    expect(await sameKey(master, unlocked)).toBe(true);
  });

  it("the recovery code unlocks the same key", async () => {
    const master = await newKey();
    const { record, recoveryCode } = await createVaultFromKey(master, PASSPHRASE, FAST);
    const unlocked = await unlockWithRecoveryCode(record, recoveryCode, FAST);
    expect(await sameKey(master, unlocked)).toBe(true);
  });

  it("a wrong passphrase is refused", async () => {
    const { record } = await createVaultFromKey(await newKey(), PASSPHRASE, FAST);
    await expect(unlockWithPassphrase(record, "a different long passphrase", FAST)).rejects.toMatchObject({
      code: "WRONG_SECRET",
    });
  });

  it("a short passphrase is refused", async () => {
    await expect(createVaultFromKey(await newKey(), "short", FAST)).rejects.toMatchObject({ code: "WEAK_PASSPHRASE" });
  });

  it("a key that cannot be exported is refused", async () => {
    await expect(createVaultFromKey(await newKey(false), PASSPHRASE, FAST)).rejects.toThrow();
  });

  it("sameKey tells two different keys apart", async () => {
    expect(await sameKey(await newKey(), await newKey())).toBe(false);
  });
});
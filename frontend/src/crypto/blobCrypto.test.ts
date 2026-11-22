import { describe, expect, it } from "vitest";
import { decryptBytes, encryptBytes } from "./blobCrypto";

const context = { userId: "user_a", kind: "photo-full", recordId: "3f2b8a52-6d0e-4c1a-9a57-0c3c2f6d9b11" };

async function newKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function sampleBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(5000));
}

describe("blobCrypto", () => {
  it("round-trips bytes", async () => {
    const key = await newKey();
    const plain = sampleBytes();
    const sealed = await encryptBytes(key, plain, context);
    expect(await decryptBytes(key, sealed, context)).toEqual(plain);
  });

  it("uses a fresh IV every time", async () => {
    const key = await newKey();
    const plain = sampleBytes();
    const a = await encryptBytes(key, plain, context);
    const b = await encryptBytes(key, plain, context);
    expect(a).not.toEqual(b);
  });

  it("refuses another record id, kind or user", async () => {
    const key = await newKey();
    const sealed = await encryptBytes(key, sampleBytes(), context);
    await expect(decryptBytes(key, sealed, { ...context, recordId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow();
    await expect(decryptBytes(key, sealed, { ...context, kind: "photo-thumb" })).rejects.toThrow();
    await expect(decryptBytes(key, sealed, { ...context, userId: "user_b" })).rejects.toThrow();
  });

  it("refuses a tampered or truncated file", async () => {
    const key = await newKey();
    const sealed = await encryptBytes(key, sampleBytes(), context);

    const flipped = sealed.slice();
    flipped[100] = (flipped[100] ?? 0) ^ 1;
    await expect(decryptBytes(key, flipped, context)).rejects.toThrow();

    await expect(decryptBytes(key, sealed.slice(0, 20), context)).rejects.toThrow();
  });

  it("refuses an unknown format version", async () => {
    const key = await newKey();
    const sealed = await encryptBytes(key, sampleBytes(), context);
    sealed[0] = 99;
    await expect(decryptBytes(key, sealed, context)).rejects.toThrow();
  });
});
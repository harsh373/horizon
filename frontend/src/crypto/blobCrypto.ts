import { randomBytes, utf8 } from "./bytes";
import { VaultError } from "./errors";
import { FORMAT_VERSION } from "./vaultCrypto";
import type { RecordContext } from "./vaultCrypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES;

// Same binding as the JSON records in vaultCrypto.ts: the ciphertext only opens for the same
// user, the same kind and the same record id. Keep this line identical to recordAad() there.
function blobAad(context: RecordContext): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify(["horizon", "v1", context.userId, context.kind, context.recordId]));
}

// File layout: [1 byte format version][12 byte random IV][AES-GCM ciphertext + tag].
export async function encryptBytes(
  key: CryptoKey,
  plain: Uint8Array<ArrayBuffer>,
  context: RecordContext,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(IV_BYTES);
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: blobAad(context) }, key, plain);

  const out = new Uint8Array(HEADER_BYTES + sealed.byteLength);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(new Uint8Array(sealed), HEADER_BYTES);
  return out;
}

export async function decryptBytes(
  key: CryptoKey,
  data: Uint8Array<ArrayBuffer>,
  context: RecordContext,
): Promise<Uint8Array<ArrayBuffer>> {
  if (data.length < HEADER_BYTES + TAG_BYTES) {
    throw new VaultError("DECRYPT_FAILED", "Could not decrypt this photo.");
  }
  if (data[0] !== FORMAT_VERSION) {
    throw new VaultError("UNSUPPORTED_VERSION", "This photo was made by a newer version of the app.");
  }

  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.slice(1, HEADER_BYTES), additionalData: blobAad(context) },
      key,
      data.slice(HEADER_BYTES),
    );
    return new Uint8Array(plain);
  } catch {
    throw new VaultError("DECRYPT_FAILED", "Could not decrypt this photo.");
  }
}
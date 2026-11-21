export type VaultErrorCode =
  | "WEAK_PASSPHRASE"
  | "WRONG_SECRET"
  | "BAD_RECOVERY_CODE"
  | "DECRYPT_FAILED"
  | "UNSUPPORTED_VERSION"
  | "WEAK_KDF";

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}
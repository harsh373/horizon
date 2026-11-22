import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { connectDatabase } from "../config/db";
import { runAsUser } from "../config/userScope";
import {
  cancelPrivateVault,
  finalizePrivateVault,
  getVaultKey,
  stagePrivateVault,
  updatePrivateRecord,
} from "../controller/vault.controller";
import { Vault } from "../models/Vault";

const TEST_USER = "test_private_vault_user";
let failures = 0;

function check(name: string, ok: boolean): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
}

type Handler = (req: Request, res: Response) => Promise<void>;

async function call(handler: Handler, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const out = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    set() {
      return res;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(value: unknown) {
      out.body = value as Record<string, unknown>;
      return res;
    },
  };
  await handler({ body } as unknown as Request, res as unknown as Response);
  return out;
}

const b64 = (bytes: number) => randomBytes(bytes).toString("base64");

function makeRecord() {
  return {
    version: 1,
    kdf: { salt: b64(16), iterations: 600_000 },
    recoverySalt: b64(16),
    passphraseWrap: { iv: b64(12), data: b64(48) },
    recoveryWrap: { iv: b64(12), data: b64(48) },
  };
}

async function main(): Promise<void> {
  await connectDatabase();

  await runAsUser(TEST_USER, async () => {
    await Vault.deleteMany({});

    const first = await call(getVaultKey);
    check("new account starts in server mode with a key", first.body["mode"] === "server" && typeof first.body["key"] === "string");
    check("nothing staged at first", first.body["pending"] === null);

    const bad = await call(stagePrivateVault, { record: { ...makeRecord(), version: 2 } });
    check("wrong version is refused", bad.status === 400);
    const weak = await call(stagePrivateVault, { record: { ...makeRecord(), kdf: { salt: b64(16), iterations: 1000 } } });
    check("weak key-stretching is refused", weak.status === 400);
    const short = await call(stagePrivateVault, { record: { ...makeRecord(), recoverySalt: b64(8) } });
    check("wrong-length field is refused", short.status === 400);

    const noStage = await call(finalizePrivateVault, { keyVersion: 1 });
    check("finalize without staging is refused", noStage.status === 409);

    const staged = await call(stagePrivateVault, { record: makeRecord() });
    check("valid record stages", staged.status === 200);
    const afterStage = await call(getVaultKey);
    check("server key still intact after staging", afterStage.body["mode"] === "server" && typeof afterStage.body["key"] === "string");
    check("staged record is returned for the browser test", afterStage.body["pending"] !== null);

    await call(cancelPrivateVault);
    const afterCancel = await call(getVaultKey);
    check("cancel removes the staged record", afterCancel.body["pending"] === null);
    const noStageAgain = await call(finalizePrivateVault, { keyVersion: 1 });
    check("finalize after cancel is refused", noStageAgain.status === 409);

    await call(stagePrivateVault, { record: makeRecord() });
    const wrongVersion = await call(finalizePrivateVault, { keyVersion: 99 });
    check("finalize with wrong keyVersion is refused", wrongVersion.status === 409);

    const done = await call(finalizePrivateVault, { keyVersion: 1 });
    check("finalize succeeds", done.status === 200 && done.body["mode"] === "private");
    const again = await call(finalizePrivateVault, { keyVersion: 1 });
    check("finalize twice is safe", again.status === 200 && again.body["mode"] === "private");

    const priv = await call(getVaultKey);
    check("private mode returns the record", priv.body["mode"] === "private" && priv.body["record"] !== undefined);
    check("private mode never returns a key", priv.body["key"] === undefined);

    const doc = await Vault.findOne().lean();
    check("server key copy is gone from the database", doc?.mode === "private" && doc.wrappedKey === undefined);
    check("staged copy is gone too", doc?.pendingPrivate === undefined);

    const restage = await call(stagePrivateVault, { record: makeRecord() });
    check("cannot stage again once private", restage.status === 409);

    const upd = await call(updatePrivateRecord, { record: makeRecord(), baseRevision: 1 });
    check("update with correct revision works", upd.status === 200 && upd.body["revision"] === 2);
    const stale = await call(updatePrivateRecord, { record: makeRecord(), baseRevision: 1 });
    check("update with stale revision is refused", stale.status === 409);
    const badUpd = await call(updatePrivateRecord, { record: { nope: true }, baseRevision: 2 });
    check("update with a bad record is refused", badUpd.status === 400);

    await Vault.deleteMany({});
  });

  await mongoose.disconnect();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
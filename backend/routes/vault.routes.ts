import { Router } from "express";
import {
  cancelPrivateVault,
  finalizePrivateVault,
  getVaultKey,
  stagePrivateVault,
  updatePrivateRecord,
} from "../controller/vault.controller";

const router = Router();

router.get("/key", getVaultKey);
router.post("/private/stage", stagePrivateVault);
router.post("/private/cancel", cancelPrivateVault);
router.post("/private/finalize", finalizePrivateVault);
router.put("/private/record", updatePrivateRecord);

export default router;
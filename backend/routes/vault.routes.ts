import { Router } from "express";
import { getVaultKey } from "../controller/vault.controller";

const router = Router();

router.get("/key", getVaultKey);

export default router;
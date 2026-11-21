import { Router } from "express";
import { getTodayPlan, saveTodayPlan } from "../controller/today.controller";

const router = Router();

router.get("/:date", getTodayPlan);
router.put("/:date", saveTodayPlan);

export default router;
import { Router } from "express";
import { getWeeklyPlan, saveWeeklyPlan } from "../controller/weekly.controller";

const router = Router();

router.get("/:weekStart", getWeeklyPlan);
router.put("/:weekStart", saveWeeklyPlan);

export default router;
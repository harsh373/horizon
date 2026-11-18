import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { runAsUser } from "../config/userScope";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ message: "Not signed in" });
    return;
  }
  runAsUser(userId, () => next());
}
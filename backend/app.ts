import "./config/userScope";
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import healthRoutes from "./routes/health.routes";
import journalRoutes from "./routes/journal.routes";
import photoLibraryRoutes from "./routes/photoLibrary.routes";
import settingsRoutes from "./routes/settings.routes";
import { errorHandler, notFound } from "./utility/errorHandler";
import { requireAuth } from "./utility/requireAuth";
import sideQuestRoutes from "./routes/sideQuest.routes";
import todayRoutes from "./routes/today.routes";
import trackRoutes from "./routes/track.routes";
import weeklyRoutes from "./routes/weekly.routes";
import nowRoutes from "./routes/now.routes";
import quoteRoutes from "./routes/quote.routes";
import circleRoutes from "./routes/circle.routes";
import thoughtRoutes from "./routes/thought.routes";
import vaultRoutes from "./routes/vault.routes";

const app = express();

if (env.isProduction) app.set("trust proxy", 1);

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  clerkMiddleware({
    publishableKey: env.clerkPublishableKey,
    secretKey: env.clerkSecretKey,
    authorizedParties: [env.clientOrigin],
  }),
);

// Public route: health check doesn't touch the database.
app.use("/api/health", healthRoutes);

// Everything below needs the database ready first. On a cold start this awaits
// the connection; on a warm instance connectDatabase() returns immediately.
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api", requireAuth);
app.use("/api/vault", vaultRoutes);
app.use("/api/tracks", trackRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/circle", circleRoutes);
app.use("/api/side-quests", sideQuestRoutes);
app.use("/api/photo-library", photoLibraryRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/weekly", weeklyRoutes);
app.use("/api/today", todayRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/now", nowRoutes);
app.use("/api/thoughts", thoughtRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
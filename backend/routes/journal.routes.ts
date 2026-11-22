import { Router } from "express";
import { deleteEntry, getEntry, listArchive, listEntries, saveEntry } from "../controller/journal.controller";
import { deleteJournalPhoto, registerJournalPhoto, signJournalPhoto } from "../controller/photo.controller";

const router = Router();

router.get("/", listEntries);
router.get("/archive", listArchive);
router.get("/:date", getEntry);
router.put("/:date", saveEntry);
router.delete("/:date", deleteEntry);

// Photos are encrypted in the browser and uploaded straight to Cloudinary. The server only signs and records.
router.post("/:date/photos/sign", signJournalPhoto);
router.post("/:date/photos", registerJournalPhoto);
router.delete("/:date/photos/:photoId", deleteJournalPhoto);

export default router;
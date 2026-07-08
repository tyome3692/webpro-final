import { Router } from "express";
import { listTimetable } from "../controllers/timetableController.js";

const router = Router();

router.get("/", listTimetable);

export default router;

import { Router } from "express";
import { listExams } from "../controllers/examController.js";

const router = Router();

router.get("/", listExams);

export default router;

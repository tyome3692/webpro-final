import { Router } from "express";
import { listAssignments } from "../controllers/assignmentController.js";

const router = Router();

router.get("/", listAssignments);

export default router;

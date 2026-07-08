import { Router } from "express";
import { listClassrooms, searchClassrooms } from "../controllers/classroomController.js";

const router = Router();

router.get("/search", searchClassrooms);
router.get("/", listClassrooms);

export default router;

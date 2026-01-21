import express from "express";
import { generateSchedules } from "../controllers/adminController.js";

const router = express.Router();

router.post("/generate-schedules", generateSchedules);

export default router;
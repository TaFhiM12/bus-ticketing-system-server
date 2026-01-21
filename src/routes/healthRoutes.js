import express from "express";
import {
  healthCheck,
  testEndpoint
} from "../controllers/healthController.js";

const router = express.Router();

router.get("/health", healthCheck);
router.get("/test", testEndpoint);

export default router;
import express from "express";
import {
  getAllBuses,
  getBusById,
  getBusSeats,
  getFilters,
  getOperators,
  getPopularRoutes,
  searchBuses
} from "../controllers/busController.js";
// import { searchBuses } from "../controllers/searchController.js";

const router = express.Router();

router.get("/", getAllBuses);
router.get("/filters", getFilters);
router.get("/:id", getBusById);
router.get("/:id/seats", getBusSeats);
router.post("/search", searchBuses); 
router.get("/operators/all", getOperators);
router.get("/routes/popular", getPopularRoutes);

export default router;
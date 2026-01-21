import express from "express";
import {
  searchBuses,
  getSearchSuggestions,
  getAvailableDates
} from "../controllers/searchController.js";

const router = express.Router();

router.post("/buses", searchBuses);
router.get("/suggestions", getSearchSuggestions);
router.get("/routes/:from/:to/dates", getAvailableDates);

export default router;
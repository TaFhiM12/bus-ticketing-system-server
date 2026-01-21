import express from "express";
import {
  createBooking,
  getBookingByPNR
} from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/pnr/:pnr", getBookingByPNR);

export default router;
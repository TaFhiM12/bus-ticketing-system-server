import express from "express";
import {
  createBooking,
  getBookingByPNR,
  getBookingById,
  getBookingsByUser,
  getBookingsByUserId,
  getAllBookings,
  cancelBooking,
  updateBookingStatus,
  getBookingStats
} from "../controllers/bookingController.js";

const router = express.Router();

// Create new booking
router.post("/", createBooking);

// Get booking by PNR
router.get("/pnr/:pnr", getBookingByPNR);

// Get booking by ID
router.get("/:id", getBookingById);

// Get bookings by user email
router.get("/user/email/:email", getBookingsByUser);

// Get bookings by user ID (for logged-in users)
router.get("/user/id/:userId", getBookingsByUserId);

// Get all bookings (admin)
router.get("/", getAllBookings);

// Cancel booking by PNR
router.post("/cancel/:pnr", cancelBooking);

// Update booking status (admin)
router.put("/:id/status", updateBookingStatus);

// Get booking statistics (admin)
router.get("/stats/overview", getBookingStats);

export default router;
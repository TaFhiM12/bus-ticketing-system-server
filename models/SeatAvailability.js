import mongoose from "mongoose";

const seatAvailabilitySchema = new mongoose.Schema({
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
  seatNumber: String,
  status: { type: String, enum: ["available", "locked", "booked"], default: "available" },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lockExpiry: { type: Date, index: { expires: "5m" } }
});

export default mongoose.model("SeatAvailability", seatAvailabilitySchema);

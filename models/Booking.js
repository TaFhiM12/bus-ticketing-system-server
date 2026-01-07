import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
  seats: [String],
  totalPrice: Number,
  bookingStatus: { type: String, default: "confirmed" },
  paymentStatus: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Booking", bookingSchema);

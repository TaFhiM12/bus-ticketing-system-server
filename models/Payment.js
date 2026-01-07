import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  amount: Number,
  method: String,
  transactionId: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Payment", paymentSchema);

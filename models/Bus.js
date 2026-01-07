import mongoose from "mongoose";

const busSchema = new mongoose.Schema({
  busNumber: { type: String, unique: true },
  busType: { type: String, enum: ["AC", "Non-AC"] },
  totalSeats: Number,
  seatLayout: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Bus", busSchema);

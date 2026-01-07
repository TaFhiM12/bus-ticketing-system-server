import mongoose from "mongoose";

const seatSchema = new mongoose.Schema({
  busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus" },
  seatNumber: String,
  seatType: { type: String, enum: ["window", "aisle"] }
});

export default mongoose.model("Seat", seatSchema);

import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  busId: { type: mongoose.Schema.Types.ObjectId, ref: "Bus" },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route" },
  date: Date,
  departureTime: String,
  arrivalTime: String,
  price: Number,
  status: { type: String, enum: ["active", "cancelled"], default: "active" }
});

export default mongoose.model("Schedule", scheduleSchema);

import mongoose from "mongoose";

const routeSchema = new mongoose.Schema({
  from: String,
  to: String,
  distance: Number,
  duration: String
});

export default mongoose.model("Route", routeSchema);

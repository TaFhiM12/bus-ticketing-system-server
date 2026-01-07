import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  firebaseUid: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("User", userSchema);

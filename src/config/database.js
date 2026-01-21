import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
let client = null;
let db = null;

let busesCollection = null;
let bookingsCollection = null;
let schedulesCollection = null;
let usersCollection = null;

export async function connectToDatabase() {
  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    
    await client.connect();
    db = client.db("busVaraDB");
    
    // Initialize collections
    busesCollection = db.collection("buses");
    bookingsCollection = db.collection("bookings");
    schedulesCollection = db.collection("schedules");
    usersCollection = db.collection("users");
    
    console.log("✅ Connected to MongoDB");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    return false;
  }
}

// Individual collection getters
export function getBusesCollection() {
  if (!busesCollection) throw new Error("Database not connected. Call connectToDatabase() first.");
  return busesCollection;
}

export function getBookingsCollection() {
  if (!bookingsCollection) throw new Error("Database not connected. Call connectToDatabase() first.");
  return bookingsCollection;
}

export function getSchedulesCollection() {
  if (!schedulesCollection) throw new Error("Database not connected. Call connectToDatabase() first.");
  return schedulesCollection;
}

export function getUsersCollection() {
  if (!usersCollection) throw new Error("Database not connected. Call connectToDatabase() first.");
  return usersCollection;
}

// Client getter for transactions
export function getClient() {
  return client;
}
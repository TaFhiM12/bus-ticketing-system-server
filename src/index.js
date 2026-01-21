import express from "express";
import dotenv from "dotenv";
import cron from "node-cron";
import { connectToDatabase } from "./config/database.js";
import corsMiddleware from "./middleware/cors.js";
import busRoutes from "./routes/busRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { 
  initializeSchedules, 
  cleanupOldBuses,
  generateDailySchedules  // ADD THIS IMPORT
} from "./services/schedulingService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(corsMiddleware);
app.use(express.json());

// Routes
app.use("/api/buses", busRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", healthRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚌 Bus Vara Professional Server",
    version: "2.0.0",
    description: "Professional bus ticketing system with dynamic scheduling",
    documentation: "https://github.com/your-repo/docs"
  });
});

async function startServer() {
  try {
    // Connect to database
    const connected = await connectToDatabase();
    if (!connected) {
      console.error("❌ Failed to connect to database. Exiting...");
      process.exit(1);
    }
    
    // Initialize schedules
    await initializeSchedules();
    
    // Set up cron job for daily maintenance
    cron.schedule('0 3 * * *', async () => {
      console.log("🔄 Running daily maintenance...");
      await cleanupOldBuses();
      
      // Generate schedules for 7 days ahead
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      await generateDailySchedules(tomorrow);
    });
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Test endpoint: http://localhost:${PORT}/api/test`);
    });
    
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Terminating server...');
  process.exit(0);
});

// Start the server
startServer();
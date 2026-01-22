import express from "express";
import dotenv from "dotenv";
import cron from "node-cron";
import { createServer } from "http";
import { Server } from "socket.io";
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
  dailyMaintenance,
  generateDailySchedules 
} from "./services/schedulingService.js";
import { getBusesCollection, getBookingsCollection } from "./config/database.js";
import { ObjectId } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const httpServer = createServer(app);

// Socket.io setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "https://busvara.netlify.app",
      "https://bus-ticketing-system-51ddb.web.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store active seat selection sessions
const activeSessions = new Map();
// Map socket.id to userId for easier tracking
const socketUserMap = new Map();

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

// Auto-generation endpoints
app.post("/api/generate-for-date", async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: "Date is required"
      });
    }
    
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    console.log(`Generating schedules for ${targetDate.toDateString()}...`);
    
    const busesGenerated = await generateDailySchedules(targetDate);
    
    res.json({
      success: true,
      message: `Generated ${busesGenerated} buses for ${targetDate.toDateString()}`,
      date: targetDate.toISOString(),
      busesGenerated
    });
    
  } catch (error) {
    console.error("Generate for date error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate schedules"
    });
  }
});

// Manual trigger for daily maintenance
app.post("/api/admin/daily-maintenance", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ 
        success: false,
        error: "Unauthorized" 
      });
    }
    
    const result = await dailyMaintenance();
    
    res.json({
      success: true,
      message: "Daily maintenance completed",
      result
    });
    
  } catch (error) {
    console.error("Manual maintenance error:", error);
    res.status(500).json({
      success: false,
      error: "Maintenance failed",
      details: error.message
    });
  }
});

// Helper function to get booked seats
async function getBookedSeats(busId) {
  try {
    const bookingsCollection = getBookingsCollection();
    const bookings = await bookingsCollection.find({
      busId: busId.toString(),
      status: { $in: ["confirmed", "pending"] }
    }).toArray();
    
    return bookings.flatMap(booking => 
      booking.selectedSeats?.map(seat => seat.seatNumber) || []
    );
  } catch (error) {
    console.error("Error getting booked seats:", error);
    return [];
  }
}

// Helper function to get seats selected by others
function getSelectedByOthers(busId, socketId) {
  const session = activeSessions.get(busId);
  if (!session) return [];
  
  const othersSelections = [];
  for (const [otherSocketId, seats] of session.selectedSeats.entries()) {
    if (otherSocketId !== socketId) {
      seats.forEach(seat => {
        othersSelections.push({
          ...seat,
          userId: socketUserMap.get(otherSocketId) || otherSocketId.substring(0, 8)
        });
      });
    }
  }
  return othersSelections;
}

// Clean up expired selections and notify clients
function cleanupExpiredSelectionsAndNotify() {
  const now = new Date();
  const expiredSeatsByBus = new Map(); // busId -> [seatNumbers]
  const expiredSeatsByUser = new Map(); // socketId -> [{busId, seatNumber}]

  for (const [busId, session] of activeSessions.entries()) {
    for (const [socketId, seats] of session.selectedSeats.entries()) {
      const validSeats = seats.filter(seat => new Date(seat.expiresAt) > now);
      const expiredSeats = seats.filter(seat => new Date(seat.expiresAt) <= now);
      
      // Track expired seats
      if (expiredSeats.length > 0) {
        // Add to bus expired seats
        if (!expiredSeatsByBus.has(busId)) {
          expiredSeatsByBus.set(busId, []);
        }
        expiredSeatsByBus.get(busId).push(
          ...expiredSeats.map(s => s.seatNumber)
        );
        
        // Add to user expired seats
        if (!expiredSeatsByUser.has(socketId)) {
          expiredSeatsByUser.set(socketId, []);
        }
        expiredSeatsByUser.get(socketId).push(
          ...expiredSeats.map(s => ({ busId, seatNumber: s.seatNumber }))
        );
      }
      
      // Update session with valid seats
      if (validSeats.length === 0) {
        session.selectedSeats.delete(socketId);
      } else {
        session.selectedSeats.set(socketId, validSeats);
      }
    }
    
    // Remove empty sessions
    if (session.selectedSeats.size === 0) {
      activeSessions.delete(busId);
    }
  }

  // Notify all clients in bus rooms about expired seats
  expiredSeatsByBus.forEach((seats, busId) => {
    io.to(`bus:${busId}`).emit('seats-expired', {
      seats,
      message: 'Seat selections have expired',
      busId
    });
  });

  // Notify individual users about their expired seats
  expiredSeatsByUser.forEach((expiredSeats, socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      expiredSeats.forEach(({ busId, seatNumber }) => {
        socket.emit('your-seat-expired', {
          seatNumber,
          busId,
          message: 'Your seat selection has expired'
        });
        
        // Also notify others in the room
        socket.to(`bus:${busId}`).emit('seat-deselected', {
          seatNumber,
          message: 'Seat selection expired'
        });
      });
    }
  });
}

// Run cleanup every 5 seconds
setInterval(cleanupExpiredSelectionsAndNotify, 5000);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔄 Socket connected: ${socket.id}`);

  // Track user mapping
  socket.on("register-user", ({ userId }) => {
    socketUserMap.set(socket.id, userId || 'anonymous');
  });

  // Join a bus room for seat selection
  socket.on("join-bus", async ({ busId, userId }) => {
    try {
      if (!ObjectId.isValid(busId)) {
        socket.emit("error", { message: "Invalid bus ID" });
        return;
      }

      const busesCollection = getBusesCollection();
      const bus = await busesCollection.findOne({ _id: new ObjectId(busId) });

      if (!bus) {
        socket.emit("error", { message: "Bus not found" });
        return;
      }

      // Store user mapping
      socketUserMap.set(socket.id, userId || 'anonymous');

      // Join bus room
      socket.join(`bus:${busId}`);
      console.log(`👤 Socket ${socket.id} (User: ${userId}) joined bus:${busId}`);

      // Initialize session if not exists
      if (!activeSessions.has(busId)) {
        activeSessions.set(busId, {
          busId,
          selectedSeats: new Map(),
          lastUpdated: new Date()
        });
      }

      // Send current seat availability
      const bookedSeats = await getBookedSeats(busId);
      socket.emit("seat-status", {
        busId,
        bookedSeats,
        selectedByOthers: getSelectedByOthers(busId, socket.id),
        availableSeats: bus.availableSeats
      });
    } catch (error) {
      console.error("Join bus error:", error);
      socket.emit("error", { message: "Failed to join bus session" });
    }
  });

  // Select seat
  socket.on("select-seat", async ({ busId, seatNumber, action, userId }) => {
    try {
      if (!activeSessions.has(busId)) {
        socket.emit("error", { message: "Session not found" });
        return;
      }

      const session = activeSessions.get(busId);
      const now = new Date();

      // Check if seat is already booked
      const bookedSeats = await getBookedSeats(busId);
      if (bookedSeats.includes(seatNumber)) {
        socket.emit("seat-unavailable", { 
          seatNumber,
          message: "Seat already booked" 
        });
        return;
      }

      // Check if seat is selected by someone else (within last 2 minutes)
      const selectedByOthers = getSelectedByOthers(busId, socket.id);
      const othersSelection = selectedByOthers.find(s => s.seatNumber === seatNumber);
      
      if (othersSelection) {
        const selectedTime = new Date(othersSelection.selectedAt);
        const timeDiff = (now - selectedTime) / 1000; // in seconds
        
        if (timeDiff < 120) {
          socket.emit("seat-locked", { 
            seatNumber,
            message: "Seat is being selected by another user",
            userId: othersSelection.userId,
            timeLeft: Math.ceil(120 - timeDiff)
          });
          return;
        } else {
          // Seat selection has expired, allow current user to select
          // Remove expired selection from the other user
          for (const [otherSocketId, seats] of session.selectedSeats.entries()) {
            if (otherSocketId !== socket.id) {
              const updatedSeats = seats.filter(s => s.seatNumber !== seatNumber);
              session.selectedSeats.set(otherSocketId, updatedSeats);
              
              if (updatedSeats.length === 0) {
                session.selectedSeats.delete(otherSocketId);
              }
            }
          }
        }
      }

      if (action === "select") {
        // Add seat to user's selection
        if (!session.selectedSeats.has(socket.id)) {
          session.selectedSeats.set(socket.id, []);
        }
        
        const userSeats = session.selectedSeats.get(socket.id);
        const existingSeatIndex = userSeats.findIndex(s => s.seatNumber === seatNumber);
        
        if (existingSeatIndex === -1) {
          const seatData = {
            seatNumber,
            selectedAt: now,
            expiresAt: new Date(now.getTime() + 2 * 60 * 1000), // 2 minutes
            userId: userId || socketUserMap.get(socket.id) || socket.id.substring(0, 8)
          };
          
          userSeats.push(seatData);
          
          // Broadcast to others in the same bus room
          socket.to(`bus:${busId}`).emit("seat-selected", {
            seatNumber,
            selectedBy: seatData.userId,
            selectedAt: now,
            expiresIn: 120 // seconds
          });
          
          socket.emit("seat-selection-success", {
            seatNumber,
            message: "Seat selected successfully"
          });
        }
      } else if (action === "deselect") {
        // Remove seat from user's selection
        if (session.selectedSeats.has(socket.id)) {
          const userSeats = session.selectedSeats.get(socket.id);
          const updatedSeats = userSeats.filter(s => s.seatNumber !== seatNumber);
          session.selectedSeats.set(socket.id, updatedSeats);
          
          if (updatedSeats.length === 0) {
            session.selectedSeats.delete(socket.id);
          }
          
          // Broadcast seat release
          socket.to(`bus:${busId}`).emit("seat-deselected", {
            seatNumber
          });
          
          socket.emit("seat-deselection-success", {
            seatNumber,
            message: "Seat deselected"
          });
        }
      }

      // Update session timestamp
      session.lastUpdated = now;
    } catch (error) {
      console.error("Select seat error:", error);
      socket.emit("error", { message: "Failed to process seat selection" });
    }
  });

  // Get current seat status
  socket.on("get-seat-status", async ({ busId }) => {
    try {
      const bookedSeats = await getBookedSeats(busId);
      const selectedByOthers = getSelectedByOthers(busId, socket.id);
      
      socket.emit("seat-status-update", {
        busId,
        bookedSeats,
        selectedByOthers
      });
    } catch (error) {
      console.error("Get seat status error:", error);
    }
  });

  // Handle seat booking completion
  socket.on("booking-completed", async ({ busId, bookedSeats }) => {
    try {
      const session = activeSessions.get(busId);
      if (session) {
        // Remove booked seats from all users' selections
        for (const [socketId, seats] of session.selectedSeats.entries()) {
          const remainingSeats = seats.filter(seat => !bookedSeats.includes(seat.seatNumber));
          if (remainingSeats.length === 0) {
            session.selectedSeats.delete(socketId);
          } else {
            session.selectedSeats.set(socketId, remainingSeats);
          }
        }
        
        // Broadcast seats are now booked
        io.to(`bus:${busId}`).emit("seats-booked", {
          bookedSeats,
          message: "Seats have been booked"
        });
      }
    } catch (error) {
      console.error("Booking completed error:", error);
    }
  });

  // Handle user seat expiry notification
  socket.on("user-seat-expired", ({ busId, seatNumber }) => {
    try {
      const session = activeSessions.get(busId);
      if (session && session.selectedSeats.has(socket.id)) {
        const userSeats = session.selectedSeats.get(socket.id);
        const updatedSeats = userSeats.filter(s => s.seatNumber !== seatNumber);
        
        if (updatedSeats.length === 0) {
          session.selectedSeats.delete(socket.id);
        } else {
          session.selectedSeats.set(socket.id, updatedSeats);
        }
        
        // Notify others that seat is available
        socket.to(`bus:${busId}`).emit("seat-deselected", {
          seatNumber,
          message: "Seat selection expired"
        });
      }
    } catch (error) {
      console.error("User seat expiry error:", error);
    }
  });

  // Handle seat selection refresh
  socket.on("refresh-seat-selection", ({ busId }) => {
    try {
      const session = activeSessions.get(busId);
      if (session) {
        const selectedByOthers = getSelectedByOthers(busId, socket.id);
        socket.emit("seat-status-update", {
          busId,
          bookedSeats: [],
          selectedByOthers
        });
      }
    } catch (error) {
      console.error("Refresh seat selection error:", error);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    
    // Clean up user's selections from all sessions
    for (const [busId, session] of activeSessions.entries()) {
      if (session.selectedSeats.has(socket.id)) {
        const userSeats = session.selectedSeats.get(socket.id);
        session.selectedSeats.delete(socket.id);
        
        // Notify others that seats are available
        if (userSeats && userSeats.length > 0) {
          io.to(`bus:${busId}`).emit("seats-released", {
            seats: userSeats.map(s => s.seatNumber),
            message: "Seats released by another user"
          });
        }
      }
    }
    
    // Remove user mapping
    socketUserMap.delete(socket.id);
  });

  // Leave bus room
  socket.on("leave-bus", ({ busId }) => {
    socket.leave(`bus:${busId}`);
    console.log(`👋 Socket ${socket.id} left bus:${busId}`);
  });
});

async function startServer() {
  try {
    // Connect to database
    console.log("🔗 Connecting to database...");
    const connected = await connectToDatabase();
    if (!connected) {
      console.error("❌ Failed to connect to database. Exiting...");
      process.exit(1);
    }
    
    console.log("✅ Database connected successfully");
    
    // Initialize schedules
    console.log("🔄 Initializing schedules...");
    await initializeSchedules();
    
    // Set up cron job for daily maintenance at 3:00 AM every day
    cron.schedule('0 3 * * *', async () => {
      console.log("⏰ Running scheduled daily maintenance...");
      try {
        const result = await dailyMaintenance();
        console.log("✅ Daily maintenance completed successfully");
        console.log(`   🧹 Cleaned: ${result.cleaned} old buses`);
        console.log(`   🚌 Generated: ${result.generated} new buses`);
        console.log(`   📅 Filled: ${result.filled} missing days`);
      } catch (error) {
        console.error("❌ Daily maintenance failed:", error);
      }
    });
    
    // Also run check every 6 hours as backup
    cron.schedule('0 */6 * * *', async () => {
      console.log("🔄 Running 6-hour schedule check...");
      try {
        const busesCollection = getBusesCollection();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Check next 3 days
        let missingDays = 0;
        for (let i = 0; i < 3; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() + i);
          
          const dateBuses = await busesCollection.countDocuments({
            scheduleDate: checkDate
          });
          
          if (dateBuses === 0) {
            console.log(`📅 No buses for ${checkDate.toDateString()}, generating...`);
            await generateDailySchedules(checkDate);
            missingDays++;
          }
        }
        
        if (missingDays > 0) {
          console.log(`✅ Filled ${missingDays} missing days`);
        }
      } catch (error) {
        console.error("6-hour check error:", error);
      }
    });
    
    // Start server
    httpServer.listen(PORT, () => {
      console.log(`\n✅ Server running on port ${PORT}`);
      console.log("🌐 Server URL: http://localhost:" + PORT);
      console.log("\n⏰ Daily maintenance scheduled at 3:00 AM every day");
      console.log("🔄 6-hour schedule check also enabled");
      console.log("\n📊 Available endpoints:");
      console.log("   • POST /api/generate-for-date - Generate buses for specific date");
      console.log("   • POST /api/admin/daily-maintenance - Manual maintenance trigger");
      console.log("   • GET /api/buses - Get all buses");
      console.log("   • POST /api/buses/search - Search buses");
      console.log("\n🚀 Ready to accept bus searches!");
    });
    
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Terminating server...');
  process.exit(0);
});

// Start the server
startServer();
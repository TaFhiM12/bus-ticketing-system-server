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
import socketRoutes from "./routes/socketRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { initializeSchedules, cleanupOldBuses, generateDailySchedules } from "./services/schedulingService.js";
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

// Middleware
app.use(corsMiddleware);
app.use(express.json());

// Routes
app.use("/api/buses", busRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/socket", socketRoutes);
app.use("/api/socket", socketRoutes);
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
          userId: otherSocketId.substring(0, 8)
        });
      });
    }
  }
  return othersSelections;
}

// Clean up expired selections
function cleanupExpiredSelections() {
  const now = new Date();
  for (const [busId, session] of activeSessions.entries()) {
    for (const [socketId, seats] of session.selectedSeats.entries()) {
      const validSeats = seats.filter(seat => new Date(seat.expiresAt) > now);
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
}

// Run cleanup every 30 seconds
setInterval(cleanupExpiredSelections, 30000);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔄 Socket connected: ${socket.id}`);

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
        const timeDiff = (now - new Date(othersSelection.selectedAt)) / (1000 * 60);
        if (timeDiff < 2) {
          socket.emit("seat-locked", { 
            seatNumber,
            message: "Seat is being selected by another user",
            userId: othersSelection.userId,
            timeLeft: Math.ceil(120 - timeDiff * 60)
          });
          return;
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
          userSeats.push({
            seatNumber,
            selectedAt: now,
            expiresAt: new Date(now.getTime() + 2 * 60 * 1000), // 2 minutes
            userId: userId || socket.id.substring(0, 8)
          });
          
          // Broadcast to others in the same bus room
          socket.to(`bus:${busId}`).emit("seat-selected", {
            seatNumber,
            selectedBy: userId || socket.id.substring(0, 8),
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
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Test endpoint: http://localhost:${PORT}/api/test`);
      console.log(`🔌 Socket.io running on port ${PORT}`);
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
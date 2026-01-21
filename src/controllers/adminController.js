import { generateDailySchedules } from "../services/schedulingService.js";
import { getBusesCollection, getBookingsCollection, getUsersCollection } from "../config/database.js";

// Generate schedules (admin)
export const generateSchedules = async (req, res) => {
  try {
    const { date, days = 1 } = req.body;
    const authHeader = req.headers.authorization;
    
    // Simple admin check (in production, use proper authentication)
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }
    
    const startDate = new Date(date);
    const results = [];
    
    for (let i = 0; i < days; i++) {
      const targetDate = new Date(startDate);
      targetDate.setDate(startDate.getDate() + i);
      
      await generateDailySchedules(targetDate);
      results.push({
        date: targetDate.toISOString().split('T')[0],
        status: "generated"
      });
    }
    
    res.json({
      success: true,
      message: `Generated schedules for ${days} day(s)`,
      results
    });
    
  } catch (error) {
    console.error("Admin schedule generation error:", error);
    res.status(500).json({ 
      error: "Schedule generation failed",
      details: error.message 
    });
  }
};

// Get system stats (admin)
export const getSystemStats = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();
    const usersCollection = getUsersCollection();
    
    // Get counts
    const totalBuses = await busesCollection.countDocuments();
    const totalBookings = await bookingsCollection.countDocuments();
    const totalUsers = await usersCollection.countDocuments();
    
    // Get today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBookings = await bookingsCollection.countDocuments({
      bookingDate: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    // Get revenue stats
    const revenueResult = await bookingsCollection.aggregate([
      {
        $match: { status: "confirmed" }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          averageBookingValue: { $avg: "$totalPrice" }
        }
      }
    ]).toArray();
    
    // Get bus utilization
    const busStats = await busesCollection.aggregate([
      {
        $group: {
          _id: null,
          totalSeats: { $sum: "$totalSeats" },
          availableSeats: { $sum: "$availableSeats" },
          averagePrice: { $avg: "$price" }
        }
      }
    ]).toArray();
    
    // Get top routes
    const topRoutes = await busesCollection.aggregate([
      {
        $group: {
          _id: {
            from: "$route.from.city",
            to: "$route.to.city"
          },
          busCount: { $sum: 1 },
          averagePrice: { $avg: "$price" }
        }
      },
      {
        $sort: { busCount: -1 }
      },
      {
        $limit: 5
      }
    ]).toArray();
    
    res.json({
      success: true,
      stats: {
        counts: {
          buses: totalBuses,
          bookings: totalBookings,
          users: totalUsers,
          todayBookings: todayBookings
        },
        revenue: revenueResult[0] || { totalRevenue: 0, averageBookingValue: 0 },
        buses: busStats[0] || { totalSeats: 0, availableSeats: 0, averagePrice: 0 },
        topRoutes: topRoutes.map(route => ({
          route: `${route._id.from} to ${route._id.to}`,
          busCount: route.busCount,
          averagePrice: Math.round(route.averagePrice)
        })),
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error("Get system stats error:", error);
    res.status(500).json({ 
      error: "Failed to fetch system stats",
      details: error.message 
    });
  }
};

// Get all bookings (admin)
export const getAllBookingsAdmin = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const bookingsCollection = getBookingsCollection();
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const bookings = await bookingsCollection.find(query)
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const total = await bookingsCollection.countDocuments(query);
    
    const formattedBookings = bookings.map(booking => ({
      ...booking,
      _id: booking._id.toString(),
      bookingDate: booking.bookingDate.toISOString(),
      departureDate: booking.departureDate.toISOString(),
      busDetails: {
        ...booking.busDetails,
        departureTime: booking.busDetails.departureTime.toISOString(),
        arrivalTime: booking.busDetails.arrivalTime.toISOString()
      }
    }));
    
    res.json({
      success: true,
      bookings: formattedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error("Get all bookings admin error:", error);
    res.status(500).json({ 
      error: "Failed to fetch bookings",
      details: error.message 
    });
  }
};

// Delete bus (admin)
export const deleteBus = async (req, res) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { ObjectId } = await import('mongodb');
    const busesCollection = getBusesCollection();
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }
    
    // Check if bus has any bookings
    const bookingsCollection = getBookingsCollection();
    const existingBookings = await bookingsCollection.countDocuments({
      busId: id,
      status: { $in: ["confirmed", "pending"] }
    });
    
    if (existingBookings > 0) {
      return res.status(400).json({ 
        error: "Cannot delete bus with active bookings" 
      });
    }
    
    const result = await busesCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Bus not found" });
    }
    
    res.json({
      success: true,
      message: "Bus deleted successfully"
    });
    
  } catch (error) {
    console.error("Delete bus error:", error);
    res.status(500).json({ 
      error: "Failed to delete bus",
      details: error.message 
    });
  }
};
import { ObjectId } from "mongodb";
import { 
  getBusesCollection, 
  getBookingsCollection, 
  getUsersCollection,
  getClient 
} from "../config/database.js";
import { generatePNR } from "../services/pnrService.js";

// Create booking
export const createBooking = async (req, res) => {
  try {
    const { busId, passengers, selectedSeats, contactInfo, paymentMethod } = req.body;
    
    if (!busId || !passengers || !selectedSeats || !contactInfo) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required booking information" 
      });
    }

    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();
    const client = getClient();

    if (!ObjectId.isValid(busId)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid bus ID format" 
      });
    }

    const bus = await busesCollection.findOne({ _id: new ObjectId(busId) });
    if (!bus) {
      return res.status(404).json({ 
        success: false,
        error: "Bus not found" 
      });
    }

    // Check seat availability
    const seatNumbers = selectedSeats.map(s => s.seatNumber);
    const existingBookings = await bookingsCollection.find({
      busId: busId,
      "selectedSeats.seatNumber": { $in: seatNumbers },
      status: { $in: ["confirmed", "pending"] }
    }).toArray();

    if (existingBookings.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: "Some seats are already booked",
        conflictedSeats: existingBookings.flatMap(b => 
          b.selectedSeats.map(s => s.seatNumber)
        )
      });
    }

    // Check if bus has enough seats
    if (bus.availableSeats < passengers.length) {
      return res.status(400).json({ 
        success: false,
        error: `Not enough seats available. Only ${bus.availableSeats} seats left.`
      });
    }

    // Calculate total price
    let totalPrice = 0;
    passengers.forEach((passenger, index) => {
      const seatPrice = bus.price * (selectedSeats[index]?.priceMultiplier || 1);
      totalPrice += seatPrice;
    });

    // Apply discount if available
    if (bus.discountPrice && bus.discountPrice < bus.price) {
      totalPrice = totalPrice * (bus.discountPrice / bus.price);
    }

    // Round total price
    totalPrice = Math.round(totalPrice);

    const booking = {
      busId: busId,
      passengers: passengers,
      selectedSeats: selectedSeats,
      contactInfo: contactInfo,
      paymentMethod: paymentMethod || "cash",
      totalPrice: totalPrice,
      status: "confirmed",
      bookingDate: new Date(),
      departureDate: bus.departureTime,
      pnr: generatePNR(),
      busDetails: {
        operator: bus.operator,
        busNumber: bus.busNumber,
        type: bus.type,
        route: bus.route,
        departureTime: bus.departureTime,
        arrivalTime: bus.arrivalTime,
        boardingPoints: bus.boardingPoints,
        droppingPoints: bus.droppingPoints,
        amenities: bus.amenities || [],
        features: bus.features || []
      },
      cancellationPolicy: {
        allowed: true,
        deadlineHours: 24,
        refundPercentage: 70
      }
    };

    // Start transaction
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        // Update bus available seats
        const updateResult = await busesCollection.updateOne(
          { _id: new ObjectId(busId) },
          { $inc: { availableSeats: -passengers.length } },
          { session }
        );

        if (updateResult.modifiedCount !== 1) {
          throw new Error("Failed to update bus seats");
        }

        // Create booking
        const result = await bookingsCollection.insertOne(booking, { session });
        booking._id = result.insertedId;
      });

      res.json({
        success: true,
        bookingId: booking._id,
        pnr: booking.pnr,
        booking: {
          ...booking,
          _id: booking._id.toString(),
          bookingDate: booking.bookingDate.toISOString(),
          departureDate: booking.departureDate.toISOString(),
          busDetails: {
            ...booking.busDetails,
            departureTime: booking.busDetails.departureTime.toISOString(),
            arrivalTime: booking.busDetails.arrivalTime.toISOString()
          }
        },
        message: "Booking confirmed successfully!",
        nextSteps: [
          "Show this PNR at boarding point",
          "Arrive at least 30 minutes before departure",
          "Carry valid ID proof"
        ]
      });

    } finally {
      await session.endSession();
    }

  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ 
      success: false,
      error: "Booking failed",
      details: error.message 
    });
  }
};

// Get booking by PNR
export const getBookingByPNR = async (req, res) => {
  try {
    const bookingsCollection = getBookingsCollection();
    const booking = await bookingsCollection.findOne({ 
      pnr: req.params.pnr.toUpperCase() 
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    res.json({
      success: true,
      booking: {
        ...booking,
        _id: booking._id.toString(),
        bookingDate: booking.bookingDate.toISOString(),
        departureDate: booking.departureDate.toISOString(),
        busDetails: {
          ...booking.busDetails,
          departureTime: booking.busDetails.departureTime.toISOString(),
          arrivalTime: booking.busDetails.arrivalTime.toISOString()
        }
      }
    });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch booking",
      details: error.message 
    });
  }
};

// Get booking by ID
export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const bookingsCollection = getBookingsCollection();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid booking ID format" 
      });
    }

    const booking = await bookingsCollection.findOne({ 
      _id: new ObjectId(id) 
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    res.json({
      success: true,
      booking: {
        ...booking,
        _id: booking._id.toString(),
        bookingDate: booking.bookingDate.toISOString(),
        departureDate: booking.departureDate.toISOString(),
        busDetails: {
          ...booking.busDetails,
          departureTime: booking.busDetails.departureTime.toISOString(),
          arrivalTime: booking.busDetails.arrivalTime.toISOString()
        }
      }
    });
  } catch (error) {
    console.error("Get booking by ID error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch booking",
      details: error.message 
    });
  }
};

// Get bookings by user email
export const getBookingsByUser = async (req, res) => {
  try {
    const { email } = req.params;
    const bookingsCollection = getBookingsCollection();

    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: "Email is required" 
      });
    }

    const bookings = await bookingsCollection.find({
      "contactInfo.email": email.toLowerCase()
    })
    .sort({ bookingDate: -1 })
    .toArray();

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

    // Categorize bookings
    const currentTime = new Date();
    const upcoming = formattedBookings.filter(booking => 
      new Date(booking.departureDate) > currentTime && 
      booking.status === "confirmed"
    );
    const completed = formattedBookings.filter(booking => 
      new Date(booking.departureDate) <= currentTime && 
      booking.status === "confirmed"
    );
    const cancelled = formattedBookings.filter(booking => 
      booking.status === "cancelled"
    );

    res.json({
      success: true,
      bookings: formattedBookings,
      categorized: {
        upcoming,
        completed,
        cancelled
      },
      stats: {
        total: formattedBookings.length,
        upcoming: upcoming.length,
        completed: completed.length,
        cancelled: cancelled.length
      }
    });
  } catch (error) {
    console.error("Get bookings by user error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch bookings",
      details: error.message 
    });
  }
};

// Get bookings by user ID (for logged-in users)
export const getBookingsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const usersCollection = getUsersCollection();
    const bookingsCollection = getBookingsCollection();

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: "User ID is required" 
      });
    }

    // Get user by UID
    const user = await usersCollection.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    // Get bookings by user email
    const bookings = await bookingsCollection.find({
      "contactInfo.email": user.email.toLowerCase()
    })
    .sort({ bookingDate: -1 })
    .toArray();

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

    // Categorize bookings
    const currentTime = new Date();
    const upcoming = formattedBookings.filter(booking => 
      new Date(booking.departureDate) > currentTime && 
      booking.status === "confirmed"
    );
    const completed = formattedBookings.filter(booking => 
      new Date(booking.departureDate) <= currentTime && 
      booking.status === "confirmed"
    );
    const cancelled = formattedBookings.filter(booking => 
      booking.status === "cancelled"
    );

    res.json({
      success: true,
      user: {
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      bookings: formattedBookings,
      categorized: {
        upcoming,
        completed,
        cancelled
      },
      stats: {
        total: formattedBookings.length,
        upcoming: upcoming.length,
        completed: completed.length,
        cancelled: cancelled.length
      }
    });
  } catch (error) {
    console.error("Get bookings by user ID error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch bookings",
      details: error.message 
    });
  }
};

// Get all bookings (admin)
export const getAllBookings = async (req, res) => {
  try {
    const bookingsCollection = getBookingsCollection();
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.bookingDate = {};
      if (startDate) {
        query.bookingDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.bookingDate.$lte = new Date(endDate);
      }
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

    // Calculate stats
    const stats = {
      totalBookings: await bookingsCollection.countDocuments(),
      confirmed: await bookingsCollection.countDocuments({ status: "confirmed" }),
      cancelled: await bookingsCollection.countDocuments({ status: "cancelled" }),
      pending: await bookingsCollection.countDocuments({ status: "pending" }),
      totalRevenue: await calculateTotalRevenue()
    };
    
    res.json({
      success: true,
      bookings: formattedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats
    });
    
  } catch (error) {
    console.error("Get all bookings error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch bookings",
      details: error.message 
    });
  }
};

// Cancel booking
export const cancelBooking = async (req, res) => {
  try {
    const { pnr } = req.params;
    const bookingsCollection = getBookingsCollection();
    const busesCollection = getBusesCollection();

    // Find booking by PNR
    const booking = await bookingsCollection.findOne({ 
      pnr: pnr.toUpperCase() 
    });

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }

    // Check if booking is already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({ 
        success: false,
        error: "Booking is already cancelled" 
      });
    }

    // Check if booking is completed (departure has passed)
    const departureTime = new Date(booking.departureDate);
    const currentTime = new Date();
    
    if (departureTime <= currentTime) {
      return res.status(400).json({ 
        success: false,
        error: "Cannot cancel completed journey" 
      });
    }

    // Check if cancellation is allowed based on cancellation policy
    const hoursUntilDeparture = (departureTime - currentTime) / (1000 * 60 * 60);
    
    // Use booking's cancellation policy or default 24 hours
    const cancellationDeadline = booking.cancellationPolicy?.deadlineHours || 24;
    const refundPercentage = booking.cancellationPolicy?.refundPercentage || 70;
    const isCancellationAllowed = booking.cancellationPolicy?.allowed !== false;

    if (!isCancellationAllowed) {
      return res.status(400).json({ 
        success: false,
        error: "Cancellation is not allowed for this booking" 
      });
    }

    if (hoursUntilDeparture < cancellationDeadline) {
      return res.status(400).json({ 
        success: false,
        error: `Cancellation not allowed. Must cancel at least ${cancellationDeadline} hours before departure.` 
      });
    }

    // Calculate refund amount
    const refundAmount = Math.round(booking.totalPrice * (refundPercentage / 100));

    // Start transaction
    const session = getClient().startSession();

    try {
      await session.withTransaction(async () => {
        // Update booking status
        const updateResult = await bookingsCollection.updateOne(
          { pnr: pnr.toUpperCase() },
          { 
            $set: { 
              status: "cancelled", 
              cancelledAt: new Date(),
              cancellationDetails: {
                refundAmount,
                refundPercentage,
                cancelledBy: "user",
                cancellationTime: new Date(),
                reason: req.body.reason || "User requested cancellation"
              }
            } 
          },
          { session }
        );

        if (updateResult.modifiedCount === 0) {
          throw new Error("Failed to cancel booking");
        }

        // Return seats to bus (only if seats are still relevant)
        if (hoursUntilDeparture > 0) {
          await busesCollection.updateOne(
            { _id: new ObjectId(booking.busId) },
            { $inc: { availableSeats: booking.passengers.length } },
            { session }
          );
        }
      });

      // Get updated booking
      const updatedBooking = await bookingsCollection.findOne({ 
        pnr: pnr.toUpperCase() 
      });

      res.json({
        success: true,
        message: "Booking cancelled successfully",
        booking: {
          ...updatedBooking,
          _id: updatedBooking._id.toString(),
          bookingDate: updatedBooking.bookingDate.toISOString(),
          departureDate: updatedBooking.departureDate.toISOString(),
          cancelledAt: updatedBooking.cancelledAt.toISOString(),
          busDetails: {
            ...updatedBooking.busDetails,
            departureTime: updatedBooking.busDetails.departureTime.toISOString(),
            arrivalTime: updatedBooking.busDetails.arrivalTime.toISOString()
          }
        },
        refund: {
          amount: refundAmount,
          percentage: refundPercentage,
          message: `৳${refundAmount} (${refundPercentage}% refund)`,
          refundMethod: booking.paymentMethod === "cash" ? "Bank transfer within 7 working days" : "Original payment method",
          estimatedTime: "7-10 working days"
        },
        cancellationTime: new Date().toISOString(),
        nextSteps: [
          "Refund will be processed within 7-10 working days",
          "You will receive confirmation email",
          "Keep this cancellation reference for future queries"
        ]
      });

    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to cancel booking",
      details: error.message 
    });
  }
};

// Update booking status (admin)
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    const bookingsCollection = getBookingsCollection();
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid booking ID format" 
      });
    }
    
    if (!status || !["confirmed", "cancelled", "pending", "completed"].includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: "Valid status is required" 
      });
    }
    
    const booking = await bookingsCollection.findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        error: "Booking not found" 
      });
    }
    
    const updateData = {
      status,
      updatedAt: new Date()
    };
    
    if (reason) {
      updateData.statusReason = reason;
    }
    
    if (status === "cancelled") {
      updateData.cancelledAt = new Date();
      updateData.cancellationDetails = {
        cancelledBy: "admin",
        cancellationTime: new Date(),
        reason: reason || "Administrative cancellation"
      };
      
      // Return seats to bus
      const busesCollection = getBusesCollection();
      await busesCollection.updateOne(
        { _id: new ObjectId(booking.busId) },
        { $inc: { availableSeats: booking.passengers.length } }
      );
    }
    
    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Failed to update booking status" 
      });
    }
    
    const updatedBooking = await bookingsCollection.findOne({ 
      _id: new ObjectId(id) 
    });
    
    res.json({
      success: true,
      message: `Booking status updated to ${status}`,
      booking: {
        ...updatedBooking,
        _id: updatedBooking._id.toString(),
        bookingDate: updatedBooking.bookingDate.toISOString(),
        departureDate: updatedBooking.departureDate.toISOString(),
        busDetails: {
          ...updatedBooking.busDetails,
          departureTime: updatedBooking.busDetails.departureTime.toISOString(),
          arrivalTime: updatedBooking.busDetails.arrivalTime.toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update booking status",
      details: error.message 
    });
  }
};

// Get booking statistics
export const getBookingStats = async (req, res) => {
  try {
    const bookingsCollection = getBookingsCollection();
    const busesCollection = getBusesCollection();
    
    // Get date range (last 30 days by default)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    // Overall stats
    const totalBookings = await bookingsCollection.countDocuments();
    const confirmedBookings = await bookingsCollection.countDocuments({ status: "confirmed" });
    const cancelledBookings = await bookingsCollection.countDocuments({ status: "cancelled" });
    
    // Revenue stats
    const revenueResult = await bookingsCollection.aggregate([
      {
        $match: { 
          status: "confirmed",
          bookingDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          averageBookingValue: { $avg: "$totalPrice" },
          bookingCount: { $sum: 1 }
        }
      }
    ]).toArray();
    
    // Daily bookings for chart
    const dailyBookings = await bookingsCollection.aggregate([
      {
        $match: { 
          bookingDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$bookingDate" },
            month: { $month: "$bookingDate" },
            day: { $dayOfMonth: "$bookingDate" }
          },
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ]).toArray();
    
    // Top routes
    const topRoutes = await bookingsCollection.aggregate([
      {
        $match: { status: "confirmed" }
      },
      {
        $group: {
          _id: {
            from: "$busDetails.route.from.city",
            to: "$busDetails.route.to.city"
          },
          bookingCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
          averagePassengers: { $avg: { $size: "$passengers" } }
        }
      },
      {
        $sort: { bookingCount: -1 }
      },
      {
        $limit: 10
      }
    ]).toArray();
    
    // Payment method distribution
    const paymentMethods = await bookingsCollection.aggregate([
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalPrice" }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();
    
    res.json({
      success: true,
      stats: {
        overview: {
          totalBookings,
          confirmedBookings,
          cancelledBookings,
          cancellationRate: totalBookings > 0 ? (cancelledBookings / totalBookings * 100).toFixed(2) : 0
        },
        revenue: revenueResult[0] || {
          totalRevenue: 0,
          averageBookingValue: 0,
          bookingCount: 0
        },
        dailyBookings: dailyBookings.map(day => ({
          date: new Date(day._id.year, day._id.month - 1, day._id.day).toISOString().split('T')[0],
          count: day.count,
          revenue: day.revenue
        })),
        topRoutes: topRoutes.map(route => ({
          route: `${route._id.from} to ${route._id.to}`,
          bookingCount: route.bookingCount,
          totalRevenue: route.totalRevenue,
          averagePassengers: Math.round(route.averagePassengers * 10) / 10
        })),
        paymentMethods: paymentMethods.map(method => ({
          method: method._id || "unknown",
          count: method.count,
          totalAmount: method.totalAmount,
          percentage: totalBookings > 0 ? (method.count / totalBookings * 100).toFixed(2) : 0
        }))
      },
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
    
  } catch (error) {
    console.error("Get booking stats error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch booking statistics",
      details: error.message 
    });
  }
};

// Helper function to calculate total revenue
async function calculateTotalRevenue() {
  try {
    const bookingsCollection = getBookingsCollection();
    const result = await bookingsCollection.aggregate([
      {
        $match: { status: "confirmed" }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" }
        }
      }
    ]).toArray();
    
    return result[0]?.totalRevenue || 0;
  } catch (error) {
    console.error("Calculate total revenue error:", error);
    return 0;
  }
}

// Export all functions
export default {
  createBooking,
  getBookingByPNR,
  getBookingById,
  getBookingsByUser,
  getBookingsByUserId,
  getAllBookings,
  cancelBooking,
  updateBookingStatus,
  getBookingStats
};
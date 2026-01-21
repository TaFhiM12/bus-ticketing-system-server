import { ObjectId } from "mongodb";
import { getBusesCollection, getBookingsCollection, getClient } from "../config/database.js";
import { generatePNR } from "../services/pnrService.js";

// Create booking
export const createBooking = async (req, res) => {
  try {
    const { busId, passengers, selectedSeats, contactInfo, paymentMethod } = req.body;
    
    if (!busId || !passengers || !selectedSeats || !contactInfo) {
      return res.status(400).json({ 
        error: "Missing required booking information" 
      });
    }

    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();
    const client = getClient();

    if (!ObjectId.isValid(busId)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }

    const bus = await busesCollection.findOne({ _id: new ObjectId(busId) });
    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
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
        error: "Some seats are already booked",
        conflictedSeats: existingBookings.flatMap(b => b.selectedSeats.map(s => s.seatNumber))
      });
    }

    // Check if bus has enough seats
    if (bus.availableSeats < passengers.length) {
      return res.status(400).json({ 
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

    const booking = {
      busId: busId,
      passengers: passengers,
      selectedSeats: selectedSeats,
      contactInfo: contactInfo,
      paymentMethod: paymentMethod || "cash",
      totalPrice: Math.round(totalPrice),
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
        droppingPoints: bus.droppingPoints
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
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({
      ...booking,
      _id: booking._id.toString(),
      bookingDate: booking.bookingDate.toISOString(),
      departureDate: booking.departureDate.toISOString(),
      busDetails: {
        ...booking.busDetails,
        departureTime: booking.busDetails.departureTime.toISOString(),
        arrivalTime: booking.busDetails.arrivalTime.toISOString()
      }
    });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ 
      error: "Failed to fetch booking",
      details: error.message 
    });
  }
};

// Get all bookings (admin)
export const getAllBookings = async (req, res) => {
  try {
    const bookingsCollection = getBookingsCollection();
    const bookings = await bookingsCollection.find({})
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

    res.json({
      count: bookings.length,
      bookings: formattedBookings
    });
  } catch (error) {
    console.error("Get all bookings error:", error);
    res.status(500).json({ 
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

    const booking = await bookingsCollection.findOne({ 
      pnr: pnr.toUpperCase() 
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check if cancellation is allowed (24 hours before departure)
    const departureTime = new Date(booking.departureDate);
    const currentTime = new Date();
    const hoursUntilDeparture = (departureTime - currentTime) / (1000 * 60 * 60);

    if (hoursUntilDeparture < 24) {
      return res.status(400).json({ 
        error: "Cancellation not allowed. Must cancel at least 24 hours before departure." 
      });
    }

    // Update booking status
    const updateResult = await bookingsCollection.updateOne(
      { pnr: pnr.toUpperCase() },
      { $set: { status: "cancelled", cancelledAt: new Date() } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({ error: "Failed to cancel booking" });
    }

    // Return seats to bus
    await busesCollection.updateOne(
      { _id: new ObjectId(booking.busId) },
      { $inc: { availableSeats: booking.passengers.length } }
    );

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      refund: `৳${Math.round(booking.totalPrice * 0.7)} (70% refund)`,
      cancellationTime: new Date().toISOString()
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ 
      error: "Failed to cancel booking",
      details: error.message 
    });
  }
};
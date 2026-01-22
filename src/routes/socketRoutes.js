import express from "express";
import { getBusesCollection } from "../config/database.js";
import { ObjectId } from "mongodb";

const router = express.Router();

// Get real-time seat status
router.get("/bus/:id/seat-status", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }
    
    const busesCollection = getBusesCollection();
    const bus = await busesCollection.findOne({ _id: new ObjectId(id) });
    
    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
    }
    
    // Get current seat layout
    const totalSeats = bus.totalSeats || 40;
    const rows = Math.ceil(totalSeats / 4);
    const seatLayout = [];
    
    for (let row = 0; row < rows; row++) {
      const rowSeats = [];
      for (let col = 0; col < 4; col++) {
        const seatNumber = row * 4 + col + 1;
        if (seatNumber > totalSeats) break;
        
        const seatType = col === 0 || col === 3 ? 'window' : 'aisle';
        
        rowSeats.push({
          seatNumber,
          type: seatType,
          priceMultiplier: seatType === 'window' ? 1.1 : 1.0
        });
      }
      if (rowSeats.length > 0) {
        seatLayout.push(rowSeats);
      }
    }
    
    res.json({
      success: true,
      seatLayout,
      busInfo: {
        operator: bus.operator,
        busNumber: bus.busNumber,
        type: bus.type,
        totalSeats,
        availableSeats: bus.availableSeats || totalSeats,
        price: bus.price,
        discountPrice: bus.discountPrice,
        route: bus.route
      }
    });
    
  } catch (error) {
    console.error("Seat status error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch seat status" 
    });
  }
});

export default router;
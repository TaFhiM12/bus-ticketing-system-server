import { ObjectId } from "mongodb";
import { getBusesCollection } from "../config/database.js";

export class SeatSelectionService {
  constructor(io) {
    this.io = io;
    this.activeSessions = new Map();
  }

  async getBusSeatLayout(busId) {
    try {
      const busesCollection = getBusesCollection();
      const bus = await busesCollection.findOne({ _id: new ObjectId(busId) });
      
      if (!bus) {
        return null;
      }

      const totalSeats = bus.totalSeats || 40;
      const availableSeats = bus.availableSeats || totalSeats;
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

      return {
        layout: seatLayout,
        busInfo: {
          operator: bus.operator,
          busNumber: bus.busNumber,
          type: bus.type,
          totalSeats,
          availableSeats,
          price: bus.price,
          discountPrice: bus.discountPrice,
          departureTime: bus.departureTime,
          arrivalTime: bus.arrivalTime,
          route: bus.route
        }
      };
    } catch (error) {
      console.error("Get bus seat layout error:", error);
      return null;
    }
  }

  getSession(busId) {
    return this.activeSessions.get(busId);
  }

  createSession(busId) {
    const session = {
      busId,
      selectedSeats: new Map(),
      lastUpdated: new Date(),
      connectedUsers: new Set()
    };
    this.activeSessions.set(busId, session);
    return session;
  }

  cleanupExpiredSelections() {
    const now = new Date();
    for (const [busId, session] of this.activeSessions.entries()) {
      for (const [socketId, seats] of session.selectedSeats.entries()) {
        const validSeats = seats.filter(seat => new Date(seat.expiresAt) > now);
        if (validSeats.length === 0) {
          session.selectedSeats.delete(socketId);
        } else {
          session.selectedSeats.set(socketId, validSeats);
        }
      }
      
      if (session.selectedSeats.size === 0 && session.connectedUsers.size === 0) {
        this.activeSessions.delete(busId);
      }
    }
  }

  broadcastSeatUpdate(room, data) {
    this.io.to(room).emit("seat-update", data);
  }
}
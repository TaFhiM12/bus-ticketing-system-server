import { ObjectId } from "mongodb";
import { 
  getBusesCollection, 
  getSchedulesCollection 
} from "../config/database.js";
import { BUS_OPERATORS } from "../constants/busOperators.js";
import { POPULAR_ROUTES } from "../constants/popularRoutes.js";
import { getTerminals } from "../constants/cities.js";

export async function generateDailySchedules(date) {
  try {
    const schedulesCollection = getSchedulesCollection();
    const busesCollection = getBusesCollection();
    
    const scheduleDate = new Date(date);
    scheduleDate.setHours(0, 0, 0, 0);
    
    // Check if schedules already exist for this date
    const existingSchedules = await schedulesCollection.findOne({ date: scheduleDate });
    if (existingSchedules) {
      console.log(`Schedules already exist for ${scheduleDate.toDateString()}`);
      return;
    }
    
    const schedules = [];
    
    for (const route of POPULAR_ROUTES) {
      // Generate 3-6 buses per route
      const busesPerRoute = Math.floor(Math.random() * 4) + 3;
      
      for (let i = 0; i < busesPerRoute; i++) {
        const operator = BUS_OPERATORS[Math.floor(Math.random() * BUS_OPERATORS.length)];
        const busType = operator.types[Math.floor(Math.random() * operator.types.length)];
        
        // Generate bus number
        const randomNum = Math.floor(Math.random() * 9000) + 1000;
        const busNumber = `${operator.busPrefix}-${randomNum}`;
        
        // Generate departure time (between 6 AM and 11 PM)
        const departureHour = Math.floor(Math.random() * 18) + 6;
        const departureMinute = Math.floor(Math.random() * 4) * 15;
        const departureTime = new Date(scheduleDate);
        departureTime.setHours(departureHour, departureMinute, 0, 0);
        
        // Calculate arrival time based on duration
        const arrivalTime = new Date(departureTime);
        const travelHours = route.duration + (Math.random() * 1 - 0.5);
        arrivalTime.setHours(arrivalTime.getHours() + Math.floor(travelHours));
        arrivalTime.setMinutes(arrivalTime.getMinutes() + Math.floor((travelHours % 1) * 60));
        
        // Calculate price
        const basePrice = route.distance * 2.5;
        const operatorMultiplier = operator.minPrice / 600;
        const typeMultiplier = busType.includes("Business") || busType.includes("Executive") ? 1.5 : 
                             busType.includes("Sleeper") ? 1.3 : 1.0;
        
        let price = Math.round(basePrice * operatorMultiplier * typeMultiplier);
        price += Math.floor(Math.random() * 100) - 50;
        price = Math.max(operator.minPrice, Math.min(operator.maxPrice, price));
        
        // Apply random discount (30% chance)
        const hasDiscount = Math.random() < 0.3;
        const discountPrice = hasDiscount ? Math.round(price * 0.85) : price;
        const discountAmount = hasDiscount ? price - discountPrice : 0;
        const discountText = hasDiscount ? `Save ${discountAmount} TK` : "";
        
        // Seat configuration
        const totalSeats = busType.includes("Business") || busType.includes("Executive") ? 28 : 40;
        const availableSeats = Math.floor(Math.random() * (totalSeats - 15)) + 10;
        
        // Amenities
        let amenities = [...operator.amenities];
        if (!busType.includes("AC")) {
          amenities = amenities.filter(amenity => amenity !== "ac");
        }
        
        const boardingPoints = getTerminals(route.from);
        const droppingPoints = getTerminals(route.to);
        
        const busSchedule = {
          operator: operator.name,
          busNumber: busNumber,
          type: busType,
          route: {
            from: {
              city: route.from,
              terminal: boardingPoints[0]
            },
            to: {
              city: route.to,
              terminal: droppingPoints[0]
            },
            distance: `${route.distance} km`,
            duration: `${Math.floor(route.duration)}h ${Math.round((route.duration % 1) * 60)}m`
          },
          departureTime: departureTime,
          arrivalTime: arrivalTime,
          price: price,
          discountPrice: discountPrice,
          discountText: discountText,
          availableSeats: availableSeats,
          totalSeats: totalSeats,
          amenities: amenities,
          cancellationPolicy: "Cancellation available with 70% refund up to 24 hours before departure",
          boardingPoints: boardingPoints,
          droppingPoints: droppingPoints,
          features: operator.features,
          rating: parseFloat((operator.rating + (Math.random() * 0.4 - 0.2)).toFixed(1)),
          scheduleDate: scheduleDate,
          createdAt: new Date()
        };
        
        schedules.push(busSchedule);
      }
    }
    
    if (schedules.length > 0) {
      // Store in schedules collection
      await schedulesCollection.insertOne({
        date: scheduleDate,
        schedules: schedules,
        generatedAt: new Date(),
        count: schedules.length
      });
      
      // Store individual buses in buses collection
      const busesToInsert = schedules.map(schedule => ({
        ...schedule,
        _id: new ObjectId()
      }));
      
      const result = await busesCollection.insertMany(busesToInsert);
      // console.log(`✅ Generated ${result.insertedCount} buses for ${scheduleDate.toDateString()}`);
    }
    
  } catch (error) {
    console.error("Error generating schedules:", error);
  }
}

export async function cleanupOldBuses() {
  try {
    const busesCollection = getBusesCollection();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    
    const result = await busesCollection.deleteMany({
      departureTime: { $lt: yesterday }
    });
    
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} old buses`);
    }
  } catch (error) {
    console.error("Error cleaning up old buses:", error);
  }
}

export async function initializeSchedules() {
  try {
    const schedulesCollection = getSchedulesCollection();
    const busesCollection = getBusesCollection();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if we have any schedules
    const scheduleCount = await schedulesCollection.countDocuments();
    const busCount = await busesCollection.countDocuments();
    
    console.log(`📊 Current stats - Schedules: ${scheduleCount}, Buses: ${busCount}`);
    
    if (busCount === 0) {
      // console.log("🔄 Initializing schedules for next 7 days...");
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        await generateDailySchedules(date);
      }
      
      // console.log("✅ Schedules initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing schedules:", error);
  }
}
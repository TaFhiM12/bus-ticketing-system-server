// schedulingService.js
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
    const existingSchedules = await schedulesCollection.findOne({ 
      date: scheduleDate 
    });
    
    if (existingSchedules) {
      console.log(`✅ Schedules already exist for ${scheduleDate.toDateString()}`);
      return existingSchedules.schedules.length;
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
      console.log(`✅ Generated ${result.insertedCount} buses for ${scheduleDate.toDateString()}`);
      
      return result.insertedCount;
    }
    
    return 0;
    
  } catch (error) {
    console.error("Error generating schedules:", error);
    throw error;
  }
}

export async function cleanupOldBuses() {
  try {
    const busesCollection = getBusesCollection();
    const schedulesCollection = getSchedulesCollection();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log(`   Looking for buses before ${today.toDateString()}...`);
    
    // Get count before deletion for logging
    const busesBefore = await busesCollection.countDocuments({
      scheduleDate: { $lt: today }
    });
    
    const schedulesBefore = await schedulesCollection.countDocuments({
      date: { $lt: today }
    });
    
    console.log(`   Found ${busesBefore} old buses and ${schedulesBefore} old schedules to delete`);
    
    // Delete buses from yesterday and earlier (based on scheduleDate)
    const busResult = await busesCollection.deleteMany({
      scheduleDate: { $lt: today }
    });
    
    // Also delete old schedules
    const scheduleResult = await schedulesCollection.deleteMany({
      date: { $lt: today }
    });
    
    if (busResult.deletedCount > 0 || scheduleResult.deletedCount > 0) {
      console.log(`   ✅ Cleaned ${busResult.deletedCount} old buses and ${scheduleResult.deletedCount} old schedules`);
    } else {
      console.log(`   ✅ No old data to clean up`);
    }
    
    return {
      busesDeleted: busResult.deletedCount,
      schedulesDeleted: scheduleResult.deletedCount
    };
    
  } catch (error) {
    console.error("Error cleaning up old buses:", error);
    throw error;
  }
}

export async function generateSchedulesForNextDays(days = 7) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalBusesGenerated = 0;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const busesGenerated = await generateDailySchedules(date);
      totalBusesGenerated += busesGenerated;
    }
    
    console.log(`✅ Generated ${totalBusesGenerated} buses for next ${days} days`);
    return totalBusesGenerated;
    
  } catch (error) {
    console.error("Error generating schedules for next days:", error);
    throw error;
  }
}

export async function ensureNext7DaysSchedules() {
  try {
    const busesCollection = getBusesCollection();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let busesGenerated = 0;
    
    // Check each of the next 7 days
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      
      const existingBuses = await busesCollection.countDocuments({
        scheduleDate: checkDate
      });
      
      if (existingBuses === 0) {
        console.log(`📅 No buses found for ${checkDate.toDateString()}. Generating...`);
        const generated = await generateDailySchedules(checkDate);
        busesGenerated += generated;
      } else {
        console.log(`✅ ${existingBuses} buses already exist for ${checkDate.toDateString()}`);
      }
    }
    
    return busesGenerated;
    
  } catch (error) {
    console.error("Error ensuring next 7 days schedules:", error);
    throw error;
  }
}

export async function dailyMaintenance() {
  try {
    console.log("\n" + "=".repeat(50));
    console.log("🔄 STARTING DAILY MAINTENANCE");
    console.log("=".repeat(50));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`📅 Today's date: ${today.toDateString()}`);
    
    // 1. Clean up old buses (from yesterday and earlier)
    console.log("\n🧹 STEP 1: Cleaning up old buses...");
    const cleanupResult = await cleanupOldBuses();
    
    // 2. Check what dates we have buses for
    console.log("\n📊 STEP 2: Checking existing schedules...");
    const busesCollection = getBusesCollection();
    
    // Get all dates we have buses for (today and future)
    const futureDates = await busesCollection.distinct("scheduleDate", {
      scheduleDate: { $gte: today }
    });
    
    // Sort dates
    futureDates.sort((a, b) => a - b);
    
    console.log(`   Found buses for ${futureDates.length} future dates`);
    
    // 3. Find the LAST date (7th day from today)
    const targetLastDate = new Date(today);
    targetLastDate.setDate(today.getDate() + 6); // 7th day (today + 6)
    
    console.log(`   Target coverage: ${today.toDateString()} to ${targetLastDate.toDateString()}`);
    
    // 4. Generate schedules for missing dates in the 7-day window
    console.log("\n🚌 STEP 3: Generating missing schedules...");
    let generatedBuses = 0;
    
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      
      // Check if we have buses for this date
      const hasBuses = futureDates.some(date => 
        date.toDateString() === checkDate.toDateString()
      );
      
      if (!hasBuses) {
        console.log(`   📅 Missing: ${checkDate.toDateString()}. Generating...`);
        const generated = await generateDailySchedules(checkDate);
        generatedBuses += generated;
        console.log(`   ✅ Generated ${generated} buses`);
      } else {
        const dateBuses = await busesCollection.countDocuments({
          scheduleDate: checkDate
        });
        console.log(`   ✅ ${dateBuses} buses already exist for ${checkDate.toDateString()}`);
      }
    }
    
    // 5. Delete any buses BEYOND the 7-day window
    console.log("\n🗑️ STEP 4: Cleaning up beyond 7-day window...");
    const deleteAfterDate = new Date(targetLastDate);
    deleteAfterDate.setDate(deleteAfterDate.getDate() + 1); // Day after the 7th day
    
    const beyondResult = await busesCollection.deleteMany({
      scheduleDate: { $gte: deleteAfterDate }
    });
    
    const beyondSchedules = await getSchedulesCollection().deleteMany({
      date: { $gte: deleteAfterDate }
    });
    
    if (beyondResult.deletedCount > 0) {
      console.log(`   🧹 Deleted ${beyondResult.deletedCount} buses beyond 7-day window`);
    }
    
    // 6. Final summary
    console.log("\n" + "=".repeat(50));
    console.log("🎉 DAILY MAINTENANCE COMPLETE");
    console.log("=".repeat(50));
    console.log(`🧹 Cleaned old: ${cleanupResult.busesDeleted} buses`);
    console.log(`🚌 Generated new: ${generatedBuses} buses`);
    console.log(`🗑️  Cleaned beyond window: ${beyondResult.deletedCount} buses`);
    
    // Check total future buses
    const totalFutureBuses = await busesCollection.countDocuments({
      scheduleDate: { $gte: today }
    });
    
    console.log(`📊 Total future buses available (7 days): ${totalFutureBuses}`);
    console.log("✅ Maintenance completed successfully!");
    console.log("=".repeat(50) + "\n");
    
    return {
      cleanedOld: cleanupResult.busesDeleted,
      generatedNew: generatedBuses,
      cleanedBeyond: beyondResult.deletedCount,
      totalFutureBuses: totalFutureBuses
    };
    
  } catch (error) {
    console.error("❌ Daily maintenance error:", error);
    throw error;
  }
}

export async function initializeSchedules() {
  try {
    const busesCollection = getBusesCollection();
    
    // Clean up old buses first
    await cleanupOldBuses();
    
    // Check how many future buses we have
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureBuses = await busesCollection.countDocuments({
      scheduleDate: { $gte: today }
    });
    
    console.log(`📊 Found ${futureBuses} future buses in database`);
    
    if (futureBuses === 0) {
      // Generate for next 7 days
      console.log("🔄 No future buses found. Generating schedules for next 7 days...");
      await generateSchedulesForNextDays(7);
    } else {
      // Ensure we have schedules for next 7 days
      console.log("🔄 Ensuring schedules exist for next 7 days...");
      await ensureNext7DaysSchedules();
    }
    
    console.log("✅ Schedule initialization complete");
    
  } catch (error) {
    console.error("Error initializing schedules:", error);
    throw error;
  }
}
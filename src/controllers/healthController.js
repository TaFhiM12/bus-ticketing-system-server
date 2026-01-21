import { getClient, getBusesCollection, getBookingsCollection, getSchedulesCollection, getUsersCollection } from "../config/database.js";

// Health check
export const healthCheck = async (req, res) => {
  try {
    const client = getClient();
    
    if (!client) {
      return res.status(500).json({ 
        status: "unhealthy", 
        error: "Database not connected" 
      });
    }
    
    await client.db().admin().ping();
    
    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();
    const schedulesCollection = getSchedulesCollection();
    const usersCollection = getUsersCollection();
    
    const busCount = await busesCollection.countDocuments();
    const bookingCount = await bookingsCollection.countDocuments();
    const scheduleCount = await schedulesCollection.countDocuments();
    const userCount = await usersCollection.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBuses = await busesCollection.countDocuments({
      departureTime: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    res.json({ 
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      statistics: {
        buses: busCount,
        bookings: bookingCount,
        schedules: scheduleCount,
        users: userCount,
        busesToday: todayBuses
      },
      services: {
        search: "operational",
        booking: "operational",
        scheduling: "operational",
        authentication: "operational"
      },
      version: "2.0.0"
    });
  } catch (error) {
    res.status(500).json({ 
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
      version: "2.0.0"
    });
  }
};

// Test endpoint
export const testEndpoint = async (req, res) => {
  try {
    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();
    const schedulesCollection = getSchedulesCollection();
    const usersCollection = getUsersCollection();
    const client = getClient();
    
    const busCount = await busesCollection.countDocuments();
    const bookingCount = await bookingsCollection.countDocuments();
    const scheduleCount = await schedulesCollection.countDocuments();
    const userCount = await usersCollection.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayBuses = await busesCollection.countDocuments({
      departureTime: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    res.json({ 
      message: "🚌 Bus Vara Professional API",
      status: "operational",
      version: "2.0.0",
      serverTime: new Date().toISOString(),
      database: {
        connected: !!client,
        collections: {
          buses: busCount,
          bookings: bookingCount,
          schedules: scheduleCount,
          users: userCount,
          todayBuses: todayBuses
        }
      },
      services: {
        search: "active",
        booking: "active",
        scheduling: "active",
        authentication: "active"
      },
      endpoints: {
        health: "GET /api/health",
        test: "GET /api/test",
        search: "POST /api/search/buses",
        filters: "GET /api/buses/filters",
        suggestions: "GET /api/search/suggestions",
        busDetails: "GET /api/buses/:id",
        operators: "GET /api/buses/operators/all",
        popularRoutes: "GET /api/buses/routes/popular",
        createBooking: "POST /api/bookings",
        bookingByPNR: "GET /api/bookings/pnr/:pnr",
        userRegister: "POST /api/users/register",
        userProfile: "GET /api/users/:uid"
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      status: "degraded",
      version: "2.0.0"
    });
  }
};
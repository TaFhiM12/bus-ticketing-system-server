// server.js - Professional Bus Ticketing System
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://bus-ticketing-system-server-1.onrender.com",
  "https://bus-ticketing-system-client-1.onrender.com",
  "https://busvara.netlify.app"
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// Enhanced Bus operators data
const BUS_OPERATORS = [
  {
    name: "Hanif Enterprise",
    busPrefix: "HAN",
    types: ["AC Business", "AC Seater", "Non-AC Seater"],
    minPrice: 700,
    maxPrice: 1200,
    amenities: ["ac", "charging", "water", "wifi", "snacks", "blanket", "newspaper"],
    rating: 4.5,
    features: ["Punctual", "Comfortable", "Professional Staff", "On-time Service"]
  },
  {
    name: "Shyamoli Paribahan",
    busPrefix: "SHY",
    types: ["AC Seater", "Non-AC Seater"],
    minPrice: 600,
    maxPrice: 900,
    amenities: ["ac", "charging", "water", "blanket"],
    rating: 4.2,
    features: ["Economical", "Frequent Service", "Reliable"]
  },
  {
    name: "ENA Paribahan",
    busPrefix: "ENA",
    types: ["AC Business", "AC Seater", "AC Sleeper"],
    minPrice: 800,
    maxPrice: 1500,
    amenities: ["ac", "charging", "water", "wifi", "entertainment", "blanket", "hot-meal"],
    rating: 4.7,
    features: ["Luxury", "Premium Service", "Entertainment", "Meal Service"]
  },
  {
    name: "Liton Enterprise",
    busPrefix: "LIT",
    types: ["AC Seater", "Non-AC Seater"],
    minPrice: 650,
    maxPrice: 950,
    amenities: ["ac", "charging", "water"],
    rating: 4.0,
    features: ["Economical", "Good Service", "Value for Money"]
  },
  {
    name: "Green Line Paribahan",
    busPrefix: "GRN",
    types: ["AC Business", "AC Seater", "Executive"],
    minPrice: 900,
    maxPrice: 1800,
    amenities: ["ac", "charging", "water", "wifi", "entertainment", "blanket", "hot-meal", "newspaper"],
    rating: 4.8,
    features: ["Premium", "Luxury", "Executive Service", "Meal Included"]
  },
  {
    name: "Saintmartin Travels",
    busPrefix: "STM",
    types: ["AC Seater", "Non-AC Seater"],
    minPrice: 550,
    maxPrice: 850,
    amenities: ["ac", "charging", "water"],
    rating: 3.8,
    features: ["Budget Friendly", "Frequent Service"]
  },
  {
    name: "Soudia Paribahan",
    busPrefix: "SOU",
    types: ["AC Seater", "AC Sleeper"],
    minPrice: 600,
    maxPrice: 950,
    amenities: ["ac", "water", "blanket", "snacks"],
    rating: 4.0,
    features: ["AC", "Comfortable", "Reliable"]
  }
];

// Popular routes with distances and typical durations
const POPULAR_ROUTES = [
  { from: "Dhaka", to: "Chittagong", distance: 250, duration: 5.5 },
  { from: "Dhaka", to: "Cox's Bazar", distance: 390, duration: 8 },
  { from: "Dhaka", to: "Sylhet", distance: 240, duration: 5 },
  { from: "Dhaka", to: "Khulna", distance: 200, duration: 4.5 },
  { from: "Dhaka", to: "Rajshahi", distance: 240, duration: 5 },
  { from: "Dhaka", to: "Barisal", distance: 180, duration: 4 },
  { from: "Chittagong", to: "Cox's Bazar", distance: 150, duration: 3 },
  { from: "Chittagong", to: "Sylhet", distance: 280, duration: 6 },
  { from: "Sylhet", to: "Dhaka", distance: 240, duration: 5 },
  { from: "Khulna", to: "Dhaka", distance: 200, duration: 4.5 },
];

const ALL_CITIES = [...new Set([
  ...POPULAR_ROUTES.map(r => r.from),
  ...POPULAR_ROUTES.map(r => r.to)
])];

const uri = process.env.MONGODB_URI;
let client, database, busesCollection, bookingsCollection, schedulesCollection;

async function connectToDatabase() {
  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    
    await client.connect();
    database = client.db("busVaraDB");
    busesCollection = database.collection("buses");
    bookingsCollection = database.collection("bookings");
    schedulesCollection = database.collection("schedules");
    
    console.log("✅ Connected to MongoDB");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    return false;
  }
}

// ==================== DYNAMIC SCHEDULING SYSTEM ====================

async function generateDailySchedules(date) {
  try {
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
        const departureMinute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, or 45
        const departureTime = new Date(scheduleDate);
        departureTime.setHours(departureHour, departureMinute, 0, 0);
        
        // Calculate arrival time based on duration
        const arrivalTime = new Date(departureTime);
        const travelHours = route.duration + (Math.random() * 1 - 0.5); // ±30 minutes variation
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
    }
    
  } catch (error) {
    console.error("Error generating schedules:", error);
  }
}

function getTerminals(city) {
  const terminals = {
    "Dhaka": ["Gabtoli", "Sayedabad", "Mohakhali", "Arambagh"],
    "Chittagong": ["Dampara", "GEC Circle", "Oxygen", "Bahaddarhat"],
    "Cox's Bazar": ["Bus Terminal", "Kolatali", "Hotel Sea Crown"],
    "Sylhet": ["Kadamtali", "Subidbazar", "Ambarkhana"],
    "Khulna": ["Sonadanga", "Gollamari", "Rupsha"],
    "Rajshahi": ["Shaheb Bazar", "New Market", "Terminal"],
    "Barisal": ["Natun Bazar", "Rupatali", "Nobogram"]
  };
  
  return terminals[city] || ["Main Terminal"];
}

async function cleanupOldBuses() {
  try {
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

async function initializeSchedules() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if we have any schedules
    const scheduleCount = await schedulesCollection.countDocuments();
    const busCount = await busesCollection.countDocuments();
    
    console.log(`📊 Current stats - Schedules: ${scheduleCount}, Buses: ${busCount}`);
    
    if (busCount === 0) {
      console.log("🔄 Initializing schedules for next 7 days...");
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        await generateDailySchedules(date);
      }
      
      console.log("✅ Schedules initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing schedules:", error);
  }
}

// ==================== API ENDPOINTS ====================

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    if (!client || !database) {
      return res.status(500).json({ 
        status: "unhealthy", 
        error: "Database not connected" 
      });
    }
    
    await client.db().admin().ping();
    
    const busCount = await busesCollection.countDocuments();
    const bookingCount = await bookingsCollection.countDocuments();
    const scheduleCount = await schedulesCollection.countDocuments();
    
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
        busesToday: todayBuses
      },
      services: {
        search: "operational",
        booking: "operational",
        scheduling: "operational"
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get filters endpoint (FIXED)
app.get("/api/buses/filters", async (req, res) => {
  try {
    // First check if we have data
    const busCount = await busesCollection.countDocuments();
    
    if (busCount === 0) {
      // Return default filters from BUS_OPERATORS
      const allOperators = BUS_OPERATORS.map(op => op.name);
      const allBusTypes = [...new Set(BUS_OPERATORS.flatMap(op => op.types))];
      const allAmenities = [...new Set(BUS_OPERATORS.flatMap(op => op.amenities))];
      
      return res.json({
        operators: allOperators,
        busTypes: allBusTypes,
        amenities: allAmenities,
        sortOptions: [
          { value: "departureTime", label: "Departure Time (Earliest)" },
          { value: "arrivalTime", label: "Arrival Time (Earliest)" },
          { value: "priceLow", label: "Price (Low to High)" },
          { value: "priceHigh", label: "Price (High to Low)" },
          { value: "rating", label: "Rating (Highest)" }
        ],
        message: "Using default filters - no buses in database yet"
      });
    }
    
    // Get unique values from actual data
    const operators = await busesCollection.distinct("operator");
    const busTypes = await busesCollection.distinct("type");
    
    // Get all amenities (flatten array)
    const buses = await busesCollection.find({}, { projection: { amenities: 1 } }).toArray();
    const allAmenities = [...new Set(buses.flatMap(bus => bus.amenities || []))];
    
    res.json({
      operators: operators.sort(),
      busTypes: busTypes.sort(),
      amenities: allAmenities.sort(),
      sortOptions: [
        { value: "departureTime", label: "Departure Time (Earliest)" },
        { value: "arrivalTime", label: "Arrival Time (Earliest)" },
        { value: "priceLow", label: "Price (Low to High)" },
        { value: "priceHigh", label: "Price (High to Low)" },
        { value: "rating", label: "Rating (Highest)" }
      ]
    });
  } catch (error) {
    console.error("Filters error:", error);
    
    // Fallback to default filters on error
    res.json({
      operators: BUS_OPERATORS.map(op => op.name),
      busTypes: [...new Set(BUS_OPERATORS.flatMap(op => op.types))],
      amenities: [...new Set(BUS_OPERATORS.flatMap(op => op.amenities))],
      sortOptions: [
        { value: "departureTime", label: "Departure Time (Earliest)" },
        { value: "arrivalTime", label: "Arrival Time (Earliest)" },
        { value: "priceLow", label: "Price (Low to High)" },
        { value: "priceHigh", label: "Price (High to Low)" },
        { value: "rating", label: "Rating (Highest)" }
      ],
      error: error.message
    });
  }
});

// Search suggestions endpoint (FIXED)
app.get("/api/search/suggestions", async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    const searchTerm = q.toLowerCase();
    
    // Get suggestions from database if available
    let citySuggestions = [];
    let operatorSuggestions = [];
    
    try {
      // Get city suggestions from existing routes
      const fromCities = await busesCollection.distinct("route.from.city");
      const toCities = await busesCollection.distinct("route.to.city");
      const allCities = [...new Set([...fromCities, ...toCities])];
      
      citySuggestions = allCities.filter(city => 
        city.toLowerCase().includes(searchTerm)
      ).map(city => ({ type: "city", value: city }));
      
      // Get operator suggestions
      const operators = await busesCollection.distinct("operator");
      operatorSuggestions = operators.filter(op => 
        op.toLowerCase().includes(searchTerm)
      ).map(op => ({ type: "operator", value: op }));
      
    } catch (dbError) {
      console.log("Using fallback suggestions:", dbError.message);
      // Fallback to static data if database query fails
      citySuggestions = ALL_CITIES.filter(city => 
        city.toLowerCase().includes(searchTerm)
      ).map(city => ({ type: "city", value: city }));
      
      operatorSuggestions = BUS_OPERATORS.filter(op => 
        op.name.toLowerCase().includes(searchTerm)
      ).map(op => ({ type: "operator", value: op.name }));
    }
    
    // Combine and limit suggestions
    const suggestions = [
      ...citySuggestions,
      ...operatorSuggestions
    ].slice(0, 10);
    
    res.json({ suggestions });
    
  } catch (error) {
    console.error("Suggestions error:", error);
    // Always return valid JSON, even on error
    res.json({ suggestions: [] });
  }
});

// Search buses endpoint
app.post("/api/buses/search", async (req, res) => {
  try {
    const { from, to, date, passengers = 1, sortBy = "departureTime", filters = {} } = req.body;
    
    if (!from || !to || !date) {
      return res.status(400).json({ 
        error: "Missing required fields: from, to, date" 
      });
    }
    
    // Check if database has data
    const totalBuses = await busesCollection.countDocuments();
    if (totalBuses === 0) {
      return res.status(404).json({
        error: "No buses available. Please try again later.",
        count: 0,
        buses: []
      });
    }
    
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Build query
    const query = {
      "route.from.city": { $regex: new RegExp(`^${from}$`, "i") },
      "route.to.city": { $regex: new RegExp(`^${to}$`, "i") },
      departureTime: {
        $gte: searchDate,
        $lt: nextDay
      },
      availableSeats: { $gte: parseInt(passengers) }
    };
    
    // Apply filters
    if (filters.operators && filters.operators.length > 0) {
      query.operator = { $in: filters.operators };
    }
    
    if (filters.busTypes && filters.busTypes.length > 0) {
      query.type = { $in: filters.busTypes };
    }
    
    if (filters.departureTime) {
      const timeRanges = {
        "morning": { $gte: 6, $lt: 12 },
        "afternoon": { $gte: 12, $lt: 18 },
        "evening": { $gte: 18, $lt: 24 },
        "night": { $gte: 0, $lt: 6 }
      };
      
      if (timeRanges[filters.departureTime]) {
        const range = timeRanges[filters.departureTime];
        query.$expr = {
          $and: [
            { $gte: [{ $hour: "$departureTime" }, range.$gte] },
            { $lt: [{ $hour: "$departureTime" }, range.$lt] }
          ]
        };
      }
    }
    
    if (filters.priceRange) {
      query.price = {
        $gte: filters.priceRange.min || 0,
        $lte: filters.priceRange.max || 10000
      };
    }
    
    // Sort options
    let sortOptions = {};
    switch (sortBy) {
      case "priceLow":
        sortOptions = { price: 1 };
        break;
      case "priceHigh":
        sortOptions = { price: -1 };
        break;
      case "departureTime":
        sortOptions = { departureTime: 1 };
        break;
      case "arrivalTime":
        sortOptions = { arrivalTime: 1 };
        break;
      case "rating":
        sortOptions = { rating: -1 };
        break;
      default:
        sortOptions = { departureTime: 1 };
    }
    
    // Execute query
    const buses = await busesCollection.find(query).sort(sortOptions).toArray();
    
    // Format dates for response
    const formattedBuses = buses.map(bus => ({
      ...bus,
      _id: bus._id.toString(),
      departureTime: bus.departureTime.toISOString(),
      arrivalTime: bus.arrivalTime.toISOString()
    }));
    
    // Get available filters from results
    const availableOperators = [...new Set(buses.map(b => b.operator))];
    const availableBusTypes = [...new Set(buses.map(b => b.type))];
    const allAmenities = [...new Set(buses.flatMap(b => b.amenities || []))];
    
    const priceValues = buses.map(b => b.price);
    const priceRange = {
      min: priceValues.length > 0 ? Math.min(...priceValues) : 0,
      max: priceValues.length > 0 ? Math.max(...priceValues) : 0
    };
    
    res.json({
      success: true,
      count: buses.length,
      buses: formattedBuses,
      filters: {
        operators: availableOperators.sort(),
        busTypes: availableBusTypes.sort(),
        amenities: allAmenities.sort(),
        priceRange: priceRange
      },
      searchParams: {
        from,
        to,
        date,
        passengers
      }
    });
    
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ 
      error: "Search failed. Please try again.",
      details: error.message 
    });
  }
});

// Get bus details by ID
app.get("/api/buses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }
    
    const bus = await busesCollection.findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
    }
    
    // Generate seat layout
    const seatLayout = generateSeatLayout(bus.totalSeats, bus.availableSeats);
    
    const formattedBus = {
      ...bus,
      _id: bus._id.toString(),
      departureTime: bus.departureTime.toISOString(),
      arrivalTime: bus.arrivalTime.toISOString(),
      seatLayout: seatLayout
    };
    
    res.json(formattedBus);
    
  } catch (error) {
    console.error("Bus details error:", error);
    res.status(500).json({ 
      error: "Failed to fetch bus details",
      details: error.message 
    });
  }
});

// Get all buses (for testing)
app.get("/api/buses", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const buses = await busesCollection.find({})
      .sort({ departureTime: 1 })
      .limit(limit)
      .toArray();
    
    const formattedBuses = buses.map(bus => ({
      ...bus,
      _id: bus._id.toString(),
      departureTime: bus.departureTime.toISOString(),
      arrivalTime: bus.arrivalTime.toISOString()
    }));
    
    res.json({
      count: buses.length,
      buses: formattedBuses
    });
    
  } catch (error) {
    console.error("Get buses error:", error);
    res.status(500).json({ 
      error: "Failed to fetch buses",
      details: error.message 
    });
  }
});

// Create booking
app.post("/api/bookings", async (req, res) => {
  try {
    const { busId, passengers, selectedSeats, contactInfo, paymentMethod } = req.body;
    
    if (!busId || !passengers || !selectedSeats || !contactInfo) {
      return res.status(400).json({ 
        error: "Missing required booking information" 
      });
    }
    
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
          departureDate: booking.departureDate.toISOString()
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
});

// Get booking by PNR
app.get("/api/bookings/pnr/:pnr", async (req, res) => {
  try {
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
      departureDate: booking.departureDate.toISOString()
    });
    
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ 
      error: "Failed to fetch booking",
      details: error.message 
    });
  }
});

// Get popular routes
app.get("/api/routes/popular", async (req, res) => {
  try {
    const today = new Date();
    
    const popularRoutes = await busesCollection.aggregate([
      {
        $match: {
          departureTime: { $gte: today }
        }
      },
      {
        $group: {
          _id: {
            from: "$route.from.city",
            to: "$route.to.city"
          },
          count: { $sum: 1 },
          lowestPrice: { $min: "$price" },
          earliestDeparture: { $min: "$departureTime" },
          operators: { $addToSet: "$operator" }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 8
      }
    ]).toArray();
    
    const formatted = popularRoutes.map(route => ({
      from: route._id.from,
      to: route._id.to,
      availableBuses: route.count,
      lowestPrice: `৳${route.lowestPrice}`,
      operators: route.operators.slice(0, 3),
      nextDeparture: route.earliestDeparture.toISOString()
    }));
    
    res.json(formatted);
    
  } catch (error) {
    console.error("Popular routes error:", error);
    
    // Fallback to static popular routes
    const fallbackRoutes = POPULAR_ROUTES.slice(0, 6).map(route => ({
      from: route.from,
      to: route.to,
      availableBuses: Math.floor(Math.random() * 10) + 5,
      lowestPrice: `৳${Math.floor(Math.random() * 500) + 500}`,
      operators: BUS_OPERATORS.slice(0, 3).map(op => op.name),
      nextDeparture: new Date().toISOString()
    }));
    
    res.json(fallbackRoutes);
  }
});

// Get available dates for a route
app.get("/api/routes/:from/:to/dates", async (req, res) => {
  try {
    const { from, to } = req.params;
    const { month, year } = req.query;
    
    const targetDate = new Date(
      parseInt(year || new Date().getFullYear()),
      parseInt(month || new Date().getMonth()),
      1
    );
    const nextMonth = new Date(targetDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    const availableDates = await busesCollection.aggregate([
      {
        $match: {
          "route.from.city": { $regex: new RegExp(from, "i") },
          "route.to.city": { $regex: new RegExp(to, "i") },
          departureTime: {
            $gte: targetDate,
            $lt: nextMonth
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$departureTime" },
            month: { $month: "$departureTime" },
            day: { $dayOfMonth: "$departureTime" }
          },
          availableBuses: { $sum: 1 },
          lowestPrice: { $min: "$price" },
          seatsAvailable: { $sum: "$availableSeats" }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
          "_id.day": 1
        }
      }
    ]).toArray();
    
    const formatted = availableDates.map(date => ({
      date: new Date(date._id.year, date._id.month - 1, date._id.day).toISOString().split('T')[0],
      availableBuses: date.availableBuses,
      lowestPrice: date.lowestPrice,
      seatsAvailable: date.seatsAvailable
    }));
    
    res.json(formatted);
    
  } catch (error) {
    console.error("Available dates error:", error);
    res.json([]);
  }
});

// Get bus operators
app.get("/api/operators", async (req, res) => {
  try {
    const operators = BUS_OPERATORS.map(op => ({
      name: op.name,
      rating: op.rating,
      types: op.types,
      amenities: op.amenities,
      features: op.features,
      minPrice: op.minPrice,
      maxPrice: op.maxPrice
    }));
    
    res.json(operators);
  } catch (error) {
    console.error("Operators error:", error);
    res.status(500).json({ 
      error: "Failed to fetch operators",
      details: error.message 
    });
  }
});

// Admin endpoint to generate schedules
app.post("/api/admin/generate-schedules", async (req, res) => {
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
});

// Test endpoint
app.get("/api/test", async (req, res) => {
  try {
    const busCount = await busesCollection.countDocuments();
    const bookingCount = await bookingsCollection.countDocuments();
    const scheduleCount = await schedulesCollection.countDocuments();
    
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
        connected: !!client && !!database,
        collections: {
          buses: busCount,
          bookings: bookingCount,
          schedules: scheduleCount,
          todayBuses: todayBuses
        }
      },
      services: {
        search: "active",
        booking: "active",
        scheduling: "active"
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      status: "degraded"
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚌 Bus Vara Professional Server",
    version: "2.0.0",
    description: "Professional bus ticketing system with dynamic scheduling",
    endpoints: {
      health: "GET /api/health",
      test: "GET /api/test",
      search: "POST /api/buses/search",
      filters: "GET /api/buses/filters",
      suggestions: "GET /api/search/suggestions",
      busDetails: "GET /api/buses/:id",
      operators: "GET /api/operators",
      popularRoutes: "GET /api/routes/popular",
      availableDates: "GET /api/routes/:from/:to/dates",
      createBooking: "POST /api/bookings",
      bookingByPNR: "GET /api/bookings/pnr/:pnr"
    },
    features: [
      "Dynamic bus scheduling",
      "Multiple operators",
      "Seat selection",
      "Real-time availability",
      "PNR system",
      "Advanced filtering"
    ],
    documentation: "https://github.com/your-repo/docs"
  });
});

// ==================== HELPER FUNCTIONS ====================

function generateSeatLayout(totalSeats, availableSeats) {
  const seats = [];
  const rows = Math.ceil(totalSeats / 4);
  let seatNumber = 1;
  
  const bookedSeats = totalSeats - availableSeats;
  const bookedSeatNumbers = [];
  
  // Randomly select booked seats
  for (let i = 0; i < bookedSeats; i++) {
    let randomSeat;
    do {
      randomSeat = Math.floor(Math.random() * totalSeats) + 1;
    } while (bookedSeatNumbers.includes(randomSeat));
    bookedSeatNumbers.push(randomSeat);
  }
  
  // Generate seat layout
  for (let row = 1; row <= rows; row++) {
    const rowSeats = [];
    
    for (let col = 1; col <= 4; col++) {
      if (seatNumber > totalSeats) break;
      
      const seatType = col === 2 ? "aisle" : col === 3 ? "aisle" : "window";
      const isBooked = bookedSeatNumbers.includes(seatNumber);
      
      rowSeats.push({
        seatNumber: seatNumber,
        type: seatType,
        status: isBooked ? "booked" : "available",
        priceMultiplier: seatType === "window" ? 1.0 : 0.95
      });
      
      seatNumber++;
    }
    
    if (rowSeats.length > 0) {
      seats.push({
        rowNumber: row,
        seats: rowSeats
      });
    }
  }
  
  return seats;
}

function generatePNR() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pnr = '';
  for (let i = 0; i < 8; i++) {
    pnr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pnr;
}

// ==================== SERVER STARTUP ====================

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
    
    // Set up cron job for daily cleanup and schedule generation
    cron.schedule('0 3 * * *', async () => {
      console.log("🔄 Running daily maintenance...");
      await cleanupOldBuses();
      
      // Generate schedules for 7 days ahead
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      await generateDailySchedules(tomorrow);
    });
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Test endpoint: http://localhost:${PORT}/api/test`);
    });
    
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Terminating server...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// Start the server
startServer();
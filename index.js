// server.js - Cleaned version for deployment
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
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

app.use(express.json());

// Bus operators data
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
];

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    
    const database = client.db("busVaraDB");
    const busesCollection = database.collection("buses");
    const bookingsCollection = database.collection("bookings");
    const schedulesCollection = database.collection("schedules");
    
    // ==================== DYNAMIC SCHEDULING SYSTEM ====================
    
    async function generateDailySchedules(date) {
      const scheduleDate = new Date(date);
      scheduleDate.setHours(0, 0, 0, 0);
      
      const existingSchedules = await schedulesCollection.findOne({ date: scheduleDate });
      if (existingSchedules) {
        return;
      }
      
      const schedules = [];
      
      for (const route of POPULAR_ROUTES) {
        const busesPerRoute = Math.floor(Math.random() * 6) + 4;
        
        for (let i = 0; i < busesPerRoute; i++) {
          const operator = BUS_OPERATORS[Math.floor(Math.random() * BUS_OPERATORS.length)];
          const busType = operator.types[Math.floor(Math.random() * operator.types.length)];
          
          const busNumber = `${operator.busPrefix}-${Math.floor(Math.random() * 900) + 100}`;
          
          const departureHour = Math.floor(Math.random() * 24);
          const departureMinute = Math.floor(Math.random() * 4) * 15;
          const departureTime = new Date(scheduleDate);
          departureTime.setHours(departureHour, departureMinute, 0, 0);
          
          const arrivalTime = new Date(departureTime);
          const travelHours = route.duration + (Math.random() * 2 - 1);
          arrivalTime.setHours(arrivalTime.getHours() + Math.floor(travelHours));
          arrivalTime.setMinutes(arrivalTime.getMinutes() + Math.floor((travelHours % 1) * 60));
          
          const basePrice = route.distance * 2.5;
          const operatorMultiplier = operator.minPrice / 600;
          const typeMultiplier = busType.includes("Business") || busType.includes("Executive") ? 1.5 : 
                               busType.includes("Sleeper") ? 1.3 : 1.0;
          
          let price = Math.round(basePrice * operatorMultiplier * typeMultiplier);
          price += Math.floor(Math.random() * 100) - 50;
          price = Math.max(operator.minPrice, Math.min(operator.maxPrice, price));
          
          const hasDiscount = Math.random() < 0.3;
          const discountPrice = hasDiscount ? Math.round(price * 0.9) : price;
          const discountText = hasDiscount ? `Save ${price - discountPrice} TK` : "";
          
          const totalSeats = busType.includes("Business") || busType.includes("Executive") ? 28 : 40;
          const availableSeats = Math.floor(Math.random() * (totalSeats - 10)) + 5;
          
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
            rating: operator.rating + (Math.random() * 0.3 - 0.15),
            scheduleDate: scheduleDate,
            createdAt: new Date()
          };
          
          schedules.push(busSchedule);
        }
      }
      
      if (schedules.length > 0) {
        await schedulesCollection.insertOne({
          date: scheduleDate,
          schedules: schedules,
          generatedAt: new Date()
        });
        
        const busesToInsert = schedules.map(schedule => ({
          ...schedule,
          _id: new ObjectId()
        }));
        
        await busesCollection.insertMany(busesToInsert);
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await busesCollection.deleteMany({
        departureTime: { $lt: today }
      });
    }
    
    async function initializeSchedules() {
      const today = new Date();
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        await generateDailySchedules(date);
      }
    }
    
    cron.schedule('0 2 * * *', async () => {
      await cleanupOldBuses();
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 7);
      await generateDailySchedules(tomorrow);
    });
    
    await initializeSchedules();
    
    // ==================== ENHANCED SEARCH API ====================
    
    app.post("/api/buses/search", async (req, res) => {
      try {
        const { from, to, date, passengers = 1, sortBy = "departureTime", filters = {} } = req.body;
        
        if (!from || !to || !date) {
          return res.status(400).json({ error: "Missing required fields: from, to, date" });
        }
        
        const searchDate = new Date(date);
        const nextDay = new Date(searchDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const query = {
          "route.from.city": { $regex: new RegExp(from, "i") },
          "route.to.city": { $regex: new RegExp(to, "i") },
          departureTime: {
            $gte: searchDate,
            $lt: nextDay
          },
          availableSeats: { $gte: parseInt(passengers) }
        };
        
        if (filters.operator && filters.operator.length > 0) {
          query.operator = { $in: filters.operator };
        }
        
        if (filters.busType && filters.busType.length > 0) {
          query.type = { $in: filters.busType };
        }
        
        if (filters.departureTime) {
          const timeRanges = {
            "morning": { $gte: 6, $lt: 12 },
            "afternoon": { $gte: 12, $lt: 18 },
            "evening": { $gte: 18, $lt: 24 },
            "night": { $gte: 0, $lt: 6 }
          };
          
          if (timeRanges[filters.departureTime]) {
            query.$expr = {
              $and: [
                { $gte: [{ $hour: "$departureTime" }, timeRanges[filters.departureTime].$gte] },
                { $lt: [{ $hour: "$departureTime" }, timeRanges[filters.departureTime].$lt] }
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
        
        const buses = await busesCollection.find(query).sort(sortOptions).toArray();
        
        const formattedBuses = buses.map(bus => ({
          ...bus,
          departureTime: bus.departureTime.toISOString(),
          arrivalTime: bus.arrivalTime.toISOString(),
          _id: bus._id.toString()
        }));
        
        const availableOperators = [...new Set(buses.map(b => b.operator))];
        const availableBusTypes = [...new Set(buses.map(b => b.type))];
        
        res.json({
          success: true,
          count: buses.length,
          buses: formattedBuses,
          filters: {
            operators: availableOperators,
            busTypes: availableBusTypes,
            priceRange: {
              min: Math.min(...buses.map(b => b.price)),
              max: Math.max(...buses.map(b => b.price))
            }
          }
        });
        
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/buses/filters", async (req, res) => {
      try {
        const operators = await busesCollection.distinct("operator");
        const busTypes = await busesCollection.distinct("type");
        const amenities = await busesCollection.distinct("amenities");
        
        const allAmenities = [...new Set(amenities.flat())];
        
        res.json({
          operators,
          busTypes,
          amenities: allAmenities,
          sortOptions: [
            { value: "departureTime", label: "Departure Time (Earliest)" },
            { value: "arrivalTime", label: "Arrival Time (Earliest)" },
            { value: "priceLow", label: "Price (Low to High)" },
            { value: "priceHigh", label: "Price (High to Low)" },
            { value: "rating", label: "Rating (Highest)" }
          ]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/buses/:id/details", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid bus ID format" });
        }
        
        const bus = await busesCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!bus) {
          return res.status(404).json({ error: "Bus not found" });
        }
        
        const seatLayout = generateSeatLayout(bus.totalSeats, bus.availableSeats);
        
        const formattedBus = {
          ...bus,
          departureTime: bus.departureTime.toISOString(),
          arrivalTime: bus.arrivalTime.toISOString(),
          seatLayout,
          _id: bus._id.toString()
        };
        
        res.json(formattedBus);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    function generateSeatLayout(totalSeats, availableSeats) {
      const seats = [];
      const rows = Math.ceil(totalSeats / 4);
      let seatNumber = 1;
      
      const bookedSeats = totalSeats - availableSeats;
      const bookedSeatNumbers = [];
      
      for (let i = 0; i < bookedSeats; i++) {
        let randomSeat;
        do {
          randomSeat = Math.floor(Math.random() * totalSeats) + 1;
        } while (bookedSeatNumbers.includes(randomSeat));
        bookedSeatNumbers.push(randomSeat);
      }
      
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
        
        seats.push({
          rowNumber: row,
          seats: rowSeats
        });
      }
      
      return seats;
    }
    
    // ==================== EXISTING APIs ====================
    
    app.get("/api/operators", async (req, res) => {
      try {
        const operators = BUS_OPERATORS.map(op => ({
          name: op.name,
          rating: op.rating,
          types: op.types,
          amenities: op.amenities,
          features: op.features
        }));
        
        res.json(operators);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/routes/popular", async (req, res) => {
      try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
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
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/routes/:from/:to/dates", async (req, res) => {
      try {
        const { from, to } = req.params;
        const { month, year } = req.query;
        
        const targetDate = new Date(year || new Date().getFullYear(), month || new Date().getMonth(), 1);
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
        
        res.json(availableDates.map(date => ({
          date: new Date(date._id.year, date._id.month - 1, date._id.day).toISOString().split('T')[0],
          availableBuses: date.availableBuses,
          lowestPrice: date.lowestPrice,
          seatsAvailable: date.seatsAvailable
        })));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // ==================== ENHANCED BOOKING SYSTEM ====================
    
    app.post("/api/bookings", async (req, res) => {
      try {
        const { busId, passengers, selectedSeats, contactInfo, paymentMethod } = req.body;
        
        if (!busId || !passengers || !selectedSeats || !contactInfo) {
          return res.status(400).json({ error: "Missing required booking information" });
        }
        
        if (!ObjectId.isValid(busId)) {
          return res.status(400).json({ error: "Invalid bus ID format" });
        }
        
        if (selectedSeats.length !== passengers.length) {
          return res.status(400).json({ error: "Number of seats must match number of passengers" });
        }
        
        const bus = await busesCollection.findOne({ _id: new ObjectId(busId) });
        if (!bus) {
          return res.status(404).json({ error: "Bus not found" });
        }
        
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
        
        let totalPrice = 0;
        passengers.forEach((passenger, index) => {
          const seatPrice = bus.price * selectedSeats[index].priceMultiplier;
          totalPrice += seatPrice;
        });
        
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
        
        const session = client.startSession();
        
        try {
          await session.withTransaction(async () => {
            const updateResult = await busesCollection.updateOne(
              { _id: new ObjectId(busId) },
              { $inc: { availableSeats: -passengers.length } },
              { session }
            );
            
            if (updateResult.modifiedCount !== 1) {
              throw new Error("Failed to update bus seats");
            }
            
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
        res.status(500).json({ error: error.message });
      }
    });
    
    function generatePNR() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let pnr = '';
      for (let i = 0; i < 8; i++) {
        pnr += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pnr;
    }
    
    // ==================== ADDITIONAL APIs ====================
    
    app.get("/api/search/suggestions", async (req, res) => {
      try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
          return res.json({ suggestions: [] });
        }
        
        const fromCities = await busesCollection.distinct("route.from.city", {
          "route.from.city": { $regex: new RegExp(q, "i") }
        });
        
        const toCities = await busesCollection.distinct("route.to.city", {
          "route.to.city": { $regex: new RegExp(q, "i") }
        });
        
        const operators = await busesCollection.distinct("operator", {
          operator: { $regex: new RegExp(q, "i") }
        });
        
        const suggestions = [
          ...fromCities.map(city => ({ type: "from", value: city })),
          ...toCities.map(city => ({ type: "to", value: city })),
          ...operators.map(op => ({ type: "operator", value: op }))
        ].slice(0, 10);
        
        res.json({ suggestions });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
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
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post("/api/admin/generate-schedules", async (req, res) => {
      try {
        const { date, days = 1 } = req.body;
        
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
        res.status(500).json({ error: error.message });
      }
    });
    
    // ==================== EXISTING ENDPOINTS ====================
    
    app.get("/api/buses", async (req, res) => {
      try {
        const buses = await busesCollection.find({}).limit(20).toArray();
        
        const formattedBuses = buses.map(bus => ({
          ...bus,
          departureTime: bus.departureTime.toISOString(),
          arrivalTime: bus.arrivalTime.toISOString(),
          _id: bus._id.toString()
        }));
        
        res.json({
          count: buses.length,
          buses: formattedBuses
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/buses/:id", async (req, res) => {
      try {
        if (!ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ error: "Invalid bus ID format" });
        }
        
        const bus = await busesCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!bus) {
          return res.status(404).json({ error: "Bus not found" });
        }
        
        const formattedBus = {
          ...bus,
          departureTime: bus.departureTime.toISOString(),
          arrivalTime: bus.arrivalTime.toISOString(),
          _id: bus._id.toString()
        };
        
        res.json(formattedBus);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/test", async (req, res) => {
      try {
        const busCount = await busesCollection.countDocuments();
        const bookingCount = await bookingsCollection.countDocuments();
        const scheduleCount = await schedulesCollection.countDocuments();
        
        res.json({ 
          message: "🚌 Bus Vara Professional API",
          status: "operational",
          statistics: {
            buses: busCount,
            bookings: bookingCount,
            schedules: scheduleCount
          },
          serverTime: new Date().toISOString(),
          version: "2.0.0"
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.get("/api/health", async (req, res) => {
      try {
        await client.db().admin().ping();
        
        const busCount = await busesCollection.countDocuments();
        const nextDay = new Date();
        nextDay.setDate(nextDay.getDate() + 1);
        
        const tomorrowBuses = await busesCollection.countDocuments({
          departureTime: {
            $gte: new Date(),
            $lt: nextDay
          }
        });
        
        res.json({ 
          status: "healthy",
          database: "connected",
          busesAvailable: busCount,
          busesTomorrow: tomorrowBuses,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ 
          status: "unhealthy",
          error: error.message 
        });
      }
    });
    
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

run().catch(console.error);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚌 Bus Vara Professional Server",
    version: "2.0.0",
    description: "Professional bus ticketing system with dynamic scheduling",
    endpoints: {
      search: "POST /api/buses/search",
      filters: "GET /api/buses/filters",
      operators: "GET /api/operators",
      popularRoutes: "GET /api/routes/popular",
      availableDates: "GET /api/routes/:from/:to/dates",
      busDetails: "GET /api/buses/:id/details",
      createBooking: "POST /api/bookings",
      bookingByPNR: "GET /api/bookings/pnr/:pnr",
      searchSuggestions: "GET /api/search/suggestions"
    },
    features: [
      "Dynamic bus scheduling",
      "Multiple operators (Hanif, Shyamoli, ENA, etc.)",
      "Seat selection",
      "Real-time availability",
      "PNR system",
      "Automatic schedule generation"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
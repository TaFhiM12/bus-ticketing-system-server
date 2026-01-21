import { ObjectId } from "mongodb";
import { getBusesCollection, getBookingsCollection } from "../config/database.js";
import { BUS_OPERATORS } from "../constants/busOperators.js";
import { POPULAR_ROUTES } from "../constants/popularRoutes.js";
import { ALL_CITIES } from "../constants/cities.js";

// Get all buses
export const getAllBuses = async (req, res) => {
  try {
    const busesCollection = getBusesCollection();
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
};

// Get bus by ID
export const getBusById = async (req, res) => {
  try {
    const { id } = req.params;
    const busesCollection = getBusesCollection();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }

    const bus = await busesCollection.findOne({ 
      _id: new ObjectId(id) 
    });

    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
    }

    const formattedBus = {
      ...bus,
      _id: bus._id.toString(),
      departureTime: bus.departureTime.toISOString(),
      arrivalTime: bus.arrivalTime.toISOString()
    };

    res.json(formattedBus);
  } catch (error) {
    console.error("Bus details error:", error);
    res.status(500).json({ 
      error: "Failed to fetch bus details",
      details: error.message 
    });
  }
};

// Get seat layout for a bus
export const getBusSeats = async (req, res) => {
  try {
    const { id } = req.params;
    const busesCollection = getBusesCollection();
    const bookingsCollection = getBookingsCollection();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid bus ID format" });
    }

    const bus = await busesCollection.findOne({ _id: new ObjectId(id) });
    if (!bus) {
      return res.status(404).json({ error: "Bus not found" });
    }

    // Generate seat layout as 2D array
    const totalSeats = bus.totalSeats || 40;
    const availableSeats = bus.availableSeats || totalSeats;
    const rows = Math.ceil(totalSeats / 4);
    const seatLayout = [];

    for (let row = 0; row < rows; row++) {
      const rowSeats = [];
      for (let col = 0; col < 4; col++) {
        const seatNumber = row * 4 + col + 1;
        if (seatNumber > totalSeats) break;

        const isBooked = seatNumber > (totalSeats - availableSeats);
        const seatType = col === 0 || col === 3 ? 'window' : 'aisle';

        rowSeats.push({
          seatNumber,
          type: seatType,
          status: isBooked ? 'booked' : 'available',
          priceMultiplier: seatType === 'window' ? 1.1 : 1.0
        });
      }
      if (rowSeats.length > 0) {
        seatLayout.push(rowSeats);
      }
    }

    // Check for booked seats from database
    const bookings = await bookingsCollection.find({
      busId: id.toString(),
      status: "confirmed"
    }).toArray();

    const bookedSeats = bookings.flatMap(booking => 
      booking.selectedSeats.map(seat => seat.seatNumber)
    );

    // Update seat status based on bookings
    seatLayout.forEach(row => {
      row.forEach(seat => {
        if (bookedSeats.includes(seat.seatNumber)) {
          seat.status = 'booked';
        }
      });
    });

    res.json({
      success: true,
      seatLayout: seatLayout,
      busInfo: {
        operator: bus.operator,
        busNumber: bus.busNumber,
        type: bus.type,
        totalSeats: totalSeats,
        availableSeats: availableSeats,
        price: bus.price,
        discountPrice: bus.discountPrice,
        departureTime: bus.departureTime.toISOString(),
        arrivalTime: bus.arrivalTime.toISOString(),
        route: bus.route
      }
    });
  } catch (error) {
    console.error("Seat layout error:", error);
    res.status(500).json({ 
      error: "Failed to fetch seat layout",
      details: error.message 
    });
  }
};

// Get filters
export const getFilters = async (req, res) => {
  try {
    const busesCollection = getBusesCollection();
    const busCount = await busesCollection.countDocuments();

    if (busCount === 0) {
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

    const operators = await busesCollection.distinct("operator");
    const busTypes = await busesCollection.distinct("type");

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
};

// Get bus operators
export const getOperators = (req, res) => {
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
};

// Get popular routes
export const getPopularRoutes = async (req, res) => {
  try {
    const busesCollection = getBusesCollection();
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
      nextDeparture: route.earliestDeparture ? route.earliestDeparture.toISOString() : new Date().toISOString()
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Popular routes error:", error);
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
};

// Search buses function in busController.js
export const searchBuses = async (req, res) => {
  try {
    const { from, to, date, passengers = 1, sortBy = "departureTime", filters = {} } = req.body;
    
    if (!from || !to || !date) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields: from, to, date" 
      });
    }
    
    const busesCollection = getBusesCollection();
    
    // Check if database has data
    const totalBuses = await busesCollection.countDocuments();
    if (totalBuses === 0) {
      return res.status(404).json({
        success: false,
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
    
    // Apply amenities filter
    if (filters.amenities && filters.amenities.length > 0) {
      query.amenities = { $all: filters.amenities };
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
      success: false,
      error: "Search failed. Please try again.",
      details: error.message 
    });
  }
};
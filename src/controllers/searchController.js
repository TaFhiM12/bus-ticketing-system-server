import { getBusesCollection } from "../config/database.js";
import { BUS_OPERATORS } from "../constants/busOperators.js";
import { ALL_CITIES, getTerminals } from "../constants/cities.js";
import { POPULAR_ROUTES } from "../constants/popularRoutes.js";

// Search buses
export const searchBuses = async (req, res) => {
  try {
    const { from, to, date, passengers = 1, sortBy = "departureTime", filters = {} } = req.body;
    
    if (!from || !to || !date) {
      return res.status(400).json({ 
        error: "Missing required fields: from, to, date" 
      });
    }
    
    const busesCollection = getBusesCollection();
    
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
      error: "Search failed. Please try again.",
      details: error.message 
    });
  }
};

// Get search suggestions
export const getSearchSuggestions = async (req, res) => {
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
      const busesCollection = getBusesCollection();
      
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
      // console.log("Using fallback suggestions:", dbError.message);
      // Fallback to static data if database query fails
      citySuggestions = ALL_CITIES.filter(city => 
        city.toLowerCase().includes(searchTerm)
      ).map(city => ({ type: "city", value: city }));
      
      operatorSuggestions = BUS_OPERATORS.filter(op => 
        op.name.toLowerCase().includes(searchTerm)
      ).map(op => ({ type: "operator", value: op.name }));
    }
    
    // Add popular routes as suggestions
    const routeSuggestions = POPULAR_ROUTES
      .filter(route => 
        route.from.toLowerCase().includes(searchTerm) || 
        route.to.toLowerCase().includes(searchTerm)
      )
      .map(route => ({
        type: "route",
        value: `${route.from} to ${route.to}`,
        from: route.from,
        to: route.to
      }));
    
    // Combine and limit suggestions
    const suggestions = [
      ...citySuggestions.slice(0, 5),
      ...operatorSuggestions.slice(0, 3),
      ...routeSuggestions.slice(0, 3)
    ];
    
    res.json({ suggestions });
    
  } catch (error) {
    console.error("Suggestions error:", error);
    res.json({ suggestions: [] });
  }
};

// Get available dates for a route
export const getAvailableDates = async (req, res) => {
  try {
    const { from, to } = req.params;
    const { month, year } = req.query;
    
    const busesCollection = getBusesCollection();
    
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
};

// Get all cities
export const getAllCities = (req, res) => {
  try {
    res.json({
      cities: ALL_CITIES.sort(),
      popularRoutes: POPULAR_ROUTES.map(route => ({
        from: route.from,
        to: route.to,
        distance: route.distance,
        duration: route.duration
      }))
    });
  } catch (error) {
    console.error("Get cities error:", error);
    res.status(500).json({ 
      error: "Failed to fetch cities",
      details: error.message 
    });
  }
};

// Quick search (popular routes)
export const quickSearch = async (req, res) => {
  try {
    const { from, to } = req.query;
    const busesCollection = getBusesCollection();
    
    if (!from || !to) {
      return res.status(400).json({ 
        error: "Missing from or to parameters" 
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const buses = await busesCollection.find({
      "route.from.city": { $regex: new RegExp(`^${from}$`, "i") },
      "route.to.city": { $regex: new RegExp(`^${to}$`, "i") },
      departureTime: {
        $gte: today,
        $lt: tomorrow
      },
      availableSeats: { $gte: 1 }
    })
    .sort({ departureTime: 1 })
    .limit(10)
    .toArray();
    
    const formattedBuses = buses.map(bus => ({
      ...bus,
      _id: bus._id.toString(),
      departureTime: bus.departureTime.toISOString(),
      arrivalTime: bus.arrivalTime.toISOString()
    }));
    
    res.json({
      success: true,
      count: buses.length,
      buses: formattedBuses,
      route: {
        from,
        to,
        terminals: {
          from: getTerminals(from),
          to: getTerminals(to)
        }
      }
    });
    
  } catch (error) {
    console.error("Quick search error:", error);
    res.status(500).json({ 
      error: "Quick search failed",
      details: error.message 
    });
  }
};
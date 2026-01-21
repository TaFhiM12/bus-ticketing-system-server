import { getUsersCollection } from "../config/database.js";
import { getBookingsCollection } from "../config/database.js";

// Register user
export const registerUser = async (req, res) => {
  try {
    console.log("📥 Received registration request:", req.body);
    
    const { uid, name, email, photoURL, phone } = req.body;

    if (!uid || !name || !email) {
      return res.status(400).json({ 
        success: false,
        error: "UID, name, and email are required" 
      });
    }

    const usersCollection = getUsersCollection();

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ uid });

    if (existingUser) {
      return res.json({
        success: true,
        message: "User already exists",
        user: {
          ...existingUser,
          _id: existingUser._id.toString()
        },
      });
    }

    const newUser = {
      uid,
      name,
      email,
      photoURL: photoURL || "",
      phone: phone || "",
      role: "user",
      bookings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    newUser._id = result.insertedId;

    console.log("✅ User registered in MongoDB:", newUser.email);
    
    res.json({
      success: true,
      message: "User registered successfully",
      user: {
        ...newUser,
        _id: newUser._id.toString()
      },
    });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ 
      success: false,
      error: "Registration failed", 
      details: error.message 
    });
  }
};

// Get user by UID
export const getUserByUid = async (req, res) => {
  try {
    const { uid } = req.params;
    const usersCollection = getUsersCollection();
    const bookingsCollection = getBookingsCollection();

    const user = await usersCollection.findOne({ uid });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    // Get user's bookings
    const bookings = await bookingsCollection.find({
      "contactInfo.email": user.email
    }).sort({ bookingDate: -1 }).toArray();

    const formattedBookings = bookings.map(booking => ({
      ...booking,
      _id: booking._id.toString(),
      bookingDate: booking.bookingDate.toISOString(),
      departureDate: booking.departureDate.toISOString()
    }));

    res.json({
      success: true,
      user: {
        ...user,
        _id: user._id.toString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      },
      bookings: formattedBookings,
      stats: {
        totalBookings: bookings.length,
        upcomingBookings: bookings.filter(b => new Date(b.departureDate) > new Date()).length,
        completedBookings: bookings.filter(b => new Date(b.departureDate) <= new Date()).length
      }
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch user",
      details: error.message 
    });
  }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, phone, photoURL } = req.body;

    if (!uid) {
      return res.status(400).json({ 
        success: false,
        error: "User UID is required" 
      });
    }

    const usersCollection = getUsersCollection();

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (photoURL) updateData.photoURL = photoURL;
    updateData.updatedAt = new Date();

    const result = await usersCollection.updateOne(
      { uid },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const updatedUser = await usersCollection.findOne({ uid });

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        ...updatedUser,
        _id: updatedUser._id.toString(),
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update profile",
      details: error.message 
    });
  }
};

// Get user bookings
export const getUserBookings = async (req, res) => {
  try {
    const { uid } = req.params;
    const usersCollection = getUsersCollection();
    const bookingsCollection = getBookingsCollection();

    const user = await usersCollection.findOne({ uid });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    // Get bookings by email (since email is stored in contactInfo)
    const bookings = await bookingsCollection.find({
      "contactInfo.email": user.email
    })
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

    // Categorize bookings
    const upcomingBookings = formattedBookings.filter(b => 
      new Date(b.departureDate) > new Date()
    );
    const pastBookings = formattedBookings.filter(b => 
      new Date(b.departureDate) <= new Date()
    );

    res.json({
      success: true,
      bookings: {
        all: formattedBookings,
        upcoming: upcomingBookings,
        past: pastBookings
      },
      stats: {
        total: formattedBookings.length,
        upcoming: upcomingBookings.length,
        past: pastBookings.length
      }
    });
  } catch (error) {
    console.error("Get user bookings error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch bookings",
      details: error.message 
    });
  }
};
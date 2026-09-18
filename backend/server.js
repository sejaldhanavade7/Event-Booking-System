const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const connectDB = require("./config/db");
const User = require("./models/User");
const Event = require("./models/Event");
const Booking = require("./models/Booking");

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup for image/banner uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Serve uploaded banner images statically
app.use("/uploads", express.static(uploadsDir));

// Connect MongoDB
connectDB();

// Test & Health route
app.get("/", (req, res) => {
    res.send("Event Booking System Backend is Running!");
});

app.get("/api/health", (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    res.json({
        status: "ok",
        database: isDbConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

// Registration API
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if all fields are provided
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill all fields"
            });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if user already exists
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword
        });

        res.status(201).json({
            message: "Registration successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            message: "Server error during registration"
        });
    }
});

// Login API
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if fields are provided
        if (!email || !password) {
            return res.status(400).json({
                message: "Please fill all fields"
            });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Find user by email
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Compare password
        const isPasswordCorrect = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordCorrect) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // Login successful
        res.status(200).json({
            message: "Login successful",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Server error during login"
        });
    }
});

// =====================================================
// FILE / BANNER UPLOAD API
// =====================================================
app.post("/api/upload", upload.single("banner"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image file uploaded" });
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        res.status(200).json({
            message: "Banner uploaded successfully",
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Failed to upload banner" });
    }
});

// =====================================================
// EVENT MANAGEMENT CRUD APIs
// =====================================================

// 1. CREATE EVENT (POST /api/events)
app.post("/api/events", upload.single("banner"), async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const {
            title,
            description,
            date,
            time,
            venue,
            location,
            category,
            price,
            availableSeats,
            seats,
            image,
            organizer,
            organizerName
        } = req.body;

        // Validation for critical event details
        if (!title || !date || !time || !venue || !category) {
            return res.status(400).json({
                message: "Please fill all required fields (title, date, time, venue, category)"
            });
        }

        // Determine banner image path
        let bannerImage = "";
        if (req.file) {
            bannerImage = `/uploads/${req.file.filename}`;
        } else if (image) {
            bannerImage = image;
        } else if (req.body.banner && typeof req.body.banner === "string") {
            bannerImage = req.body.banner;
        }

        const seatCount = Number(availableSeats !== undefined ? availableSeats : seats) || 100;
        const ticketPrice = Number(price) || 0;
        const eventLocation = location || venue;

        // Construct event payload
        const eventData = {
            title: title.trim(),
            description: description ? description.trim() : "Join us for an exciting event!",
            date: date,
            time: time,
            venue: venue.trim(),
            location: eventLocation.trim(),
            category: category.trim(),
            price: ticketPrice,
            availableSeats: seatCount,
            image: bannerImage,
            status: "Active",
            organizerName: organizerName || "Admin"
        };

        // Attach valid organizer ObjectId if provided
        if (organizer && mongoose.Types.ObjectId.isValid(organizer)) {
            eventData.organizer = organizer;
        }

        const event = await Event.create(eventData);

        res.status(201).json({
            message: "Event created successfully",
            event: event
        });

    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({
            message: "Server error while creating event",
            error: error.message
        });
    }
});

// 2. READ ALL EVENTS (GET /api/events)
app.get("/api/events", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { category, status, search } = req.query;
        let query = {};

        if (category && category !== "All") {
            query.category = new RegExp(`^${category}$`, "i");
        }

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { venue: { $regex: search, $options: "i" } },
                { category: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ];
        }

        const events = await Event.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            count: events.length,
            events: events
        });

    } catch (error) {
        console.error("Get events error:", error);
        res.status(500).json({
            message: "Server error while fetching events"
        });
    }
});

// 3. READ SINGLE EVENT BY ID (GET /api/events/:id)
app.get("/api/events/:id", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid Event ID format" });
        }

        const event = await Event.findById(id);

        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({ event });

    } catch (error) {
        console.error("Get event by ID error:", error);
        res.status(500).json({ message: "Server error while fetching event details" });
    }
});

// 4. UPDATE EVENT (PUT /api/events/:id)
app.put("/api/events/:id", upload.single("banner"), async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid Event ID format" });
        }

        const existingEvent = await Event.findById(id);
        if (!existingEvent) {
            return res.status(404).json({ message: "Event not found" });
        }

        const updateData = { ...req.body };

        // If a new banner file was uploaded
        if (req.file) {
            updateData.image = `/uploads/${req.file.filename}`;
        }

        // Handle price and seats conversion
        if (updateData.price !== undefined) {
            updateData.price = Number(updateData.price);
        }
        if (updateData.availableSeats !== undefined) {
            updateData.availableSeats = Number(updateData.availableSeats);
        } else if (updateData.seats !== undefined) {
            updateData.availableSeats = Number(updateData.seats);
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: "Event updated successfully",
            event: updatedEvent
        });

    } catch (error) {
        console.error("Update event error:", error);
        res.status(500).json({
            message: "Server error while updating event",
            error: error.message
        });
    }
});

// 5. DELETE EVENT (DELETE /api/events/:id)
app.delete("/api/events/:id", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid Event ID format" });
        }

        const deletedEvent = await Event.findByIdAndDelete(id);

        if (!deletedEvent) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.status(200).json({
            message: "Event deleted successfully",
            id: deletedEvent._id,
            title: deletedEvent.title
        });

    } catch (error) {
        console.error("Delete event error:", error);
        res.status(500).json({
            message: "Server error while deleting event"
        });
    }
});

// =====================================================
// MODULE 4: BOOKING APIS
// =====================================================

// 1. Create a Booking (POST /api/bookings)
app.post("/api/bookings", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { eventId, eventTitle, userName, userEmail, seats, userId } = req.body;

        if (!eventTitle || !userName || !userEmail) {
            return res.status(400).json({
                message: "Please provide event title, user name, and user email"
            });
        }

        const seatCount = Number(seats) || 1;
        if (seatCount < 1) {
            return res.status(400).json({ message: "Must book at least 1 seat" });
        }

        let eventDoc = null;
        let eventDate = "";
        let eventVenue = "";
        let ticketPrice = 0;

        // If eventId provided, look up event and decrement available seats
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            eventDoc = await Event.findById(eventId);
            if (eventDoc) {
                if (eventDoc.availableSeats < seatCount) {
                    return res.status(400).json({
                        message: `Only ${eventDoc.availableSeats} seat(s) remaining for this event.`
                    });
                }
                eventDoc.availableSeats -= seatCount;
                await eventDoc.save();

                eventDate = eventDoc.date;
                eventVenue = eventDoc.venue;
                ticketPrice = eventDoc.price || 0;
            }
        } else {
            // Find event by title if eventId wasn't passed directly
            const matchedEvent = await Event.findOne({ title: new RegExp(`^${eventTitle.trim()}$`, "i") });
            if (matchedEvent) {
                eventDoc = matchedEvent;
                if (matchedEvent.availableSeats >= seatCount) {
                    matchedEvent.availableSeats -= seatCount;
                    await matchedEvent.save();
                }
                eventDate = matchedEvent.date;
                eventVenue = matchedEvent.venue;
                ticketPrice = matchedEvent.price || 0;
            }
        }

        const confirmationCode = `CONF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const totalAmount = ticketPrice * seatCount;
        const formattedTotal = totalAmount > 0 ? `₹${totalAmount}` : "Free";
        const confirmationMessage = `Dear ${userName.trim()}, your booking for "${eventTitle.trim()}" on ${eventDate || "Upcoming"} at ${eventVenue || "Main Venue"} is confirmed! Confirmation Code: ${confirmationCode}. Reserved ${seatCount} seat(s). Total Amount: ${formattedTotal}.`;

        const bookingData = {
            eventTitle: eventTitle.trim(),
            eventDate: eventDate || new Date().toLocaleDateString("en-GB"),
            eventVenue: eventVenue || "Main Hall",
            userName: userName.trim(),
            userEmail: userEmail.trim().toLowerCase(),
            seats: seatCount,
            totalAmount: totalAmount,
            confirmationCode: confirmationCode,
            confirmationMessage: confirmationMessage,
            status: "Confirmed",
            activityText: `Booking confirmed for ${eventTitle.trim()} (${seatCount} seat${seatCount > 1 ? "s" : ""})`
        };

        if (eventDoc && eventDoc._id) {
            bookingData.event = eventDoc._id;
        }

        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            bookingData.user = userId;
        }

        const newBooking = await Booking.create(bookingData);

        res.status(201).json({
            message: "Tickets booked successfully!",
            confirmationCode: confirmationCode,
            confirmationMessage: confirmationMessage,
            booking: newBooking
        });

    } catch (error) {
        console.error("Create booking error:", error);
        res.status(500).json({
            message: "Server error while processing booking",
            error: error.message
        });
    }
});

// 2. Read All Bookings (GET /api/bookings)
app.get("/api/bookings", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { email, userId, eventId } = req.query;
        let filter = {};

        if (email) filter.userEmail = email.trim().toLowerCase();
        if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.user = userId;
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) filter.event = eventId;

        const bookings = await Booking.find(filter).sort({ createdAt: -1 });

        res.status(200).json({
            count: bookings.length,
            bookings: bookings
        });

    } catch (error) {
        console.error("Get bookings error:", error);
        res.status(500).json({ message: "Server error while fetching bookings" });
    }
});

// =====================================================
// MODULE 4: DASHBOARD & ANALYTICS APIS
// =====================================================

// 3. User & Overview Dashboard API (GET /api/dashboard)
app.get("/api/dashboard", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const { email, userId } = req.query;

        // User specific booking query if email or userId provided
        let userBookingQuery = {};
        if (email) userBookingQuery.userEmail = email.trim().toLowerCase();
        if (userId && mongoose.Types.ObjectId.isValid(userId)) userBookingQuery.user = userId;

        // Fetch upcoming events, bookings, and category counts concurrently
        const [upcomingEvents, userBookings, allBookings, totalEventsCount] = await Promise.all([
            Event.find({ status: { $ne: "Cancelled" } }).sort({ date: 1, createdAt: -1 }).limit(10),
            Booking.find(userBookingQuery).sort({ createdAt: -1 }),
            Booking.find().sort({ createdAt: -1 }),
            Event.countDocuments()
        ]);

        // Calculate user stats
        const displayedBookings = userBookings.length > 0 ? userBookings : allBookings;
        const totalBookingsCount = displayedBookings.length;
        const totalTicketsBooked = displayedBookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
        const upcomingEventsCount = upcomingEvents.length;

        // Calculate Category Breakdown
        const categoryCounts = {};
        upcomingEvents.forEach(evt => {
            const cat = evt.category || "Other";
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        // Calculate Booking Overview (chart data: tickets booked per event)
        const eventBookingMap = {};
        allBookings.forEach(b => {
            const title = b.eventTitle || "Event";
            eventBookingMap[title] = (eventBookingMap[title] || 0) + (Number(b.seats) || 0);
        });

        const bookingOverview = Object.keys(eventBookingMap).slice(0, 5).map(title => ({
            title,
            tickets: eventBookingMap[title]
        }));

        // Generate Recent Activity feed
        const recentActivity = [];

        // Add user/all booking activities
        displayedBookings.slice(0, 5).forEach(b => {
            recentActivity.push({
                type: "booking",
                icon: "bi-ticket-perforated",
                text: b.activityText || `Booking confirmed for ${b.eventTitle}`,
                time: new Date(b.createdAt).toLocaleDateString("en-GB")
            });
        });

        // Add recent event creation activities
        upcomingEvents.slice(0, 3).forEach(e => {
            recentActivity.push({
                type: "event",
                icon: "bi-calendar-plus",
                text: `New event listed: ${e.title} at ${e.venue}`,
                time: new Date(e.createdAt).toLocaleDateString("en-GB")
            });
        });

        res.status(200).json({
            stats: {
                totalBookings: totalBookingsCount,
                upcomingEvents: upcomingEventsCount,
                ticketsBooked: totalTicketsBooked,
                totalEvents: totalEventsCount
            },
            upcomingEvents: upcomingEvents.slice(0, 5),
            bookingHistory: displayedBookings.slice(0, 10),
            categoryStats: categoryCounts,
            bookingOverview: bookingOverview,
            recentActivity: recentActivity.slice(0, 6)
        });

    } catch (error) {
        console.error("Dashboard API error:", error);
        res.status(500).json({ message: "Server error while assembling dashboard data" });
    }
});

// 4. Standalone Upcoming Events API (GET /api/dashboard/upcoming-events)
app.get("/api/dashboard/upcoming-events", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database unavailable" });
        }
        const events = await Event.find({ status: { $ne: "Cancelled" } }).sort({ date: 1 }).limit(10);
        res.status(200).json({ upcomingEvents: events });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch upcoming events" });
    }
});

// 5. Standalone Booking History API (GET /api/dashboard/booking-history)
app.get("/api/dashboard/booking-history", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database unavailable" });
        }
        const { email } = req.query;
        let query = {};
        if (email) query.userEmail = email.trim().toLowerCase();

        const bookings = await Booking.find(query).sort({ createdAt: -1 });
        res.status(200).json({ bookings });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch booking history" });
    }
});

// 6. Complete Analytics API (GET /api/analytics)
app.get("/api/analytics", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const [
            totalEvents,
            activeEvents,
            totalBookings,
            allBookings,
            totalUsers,
            allEvents
        ] = await Promise.all([
            Event.countDocuments(),
            Event.countDocuments({ status: "Active" }),
            Booking.countDocuments(),
            Booking.find(),
            User.countDocuments(),
            Event.find()
        ]);

        // Calculate total tickets sold & total revenue
        const ticketsSold = allBookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
        const totalRevenue = allBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

        // Category breakdown
        const categoryMap = {};
        allEvents.forEach(evt => {
            categoryMap[evt.category] = (categoryMap[evt.category] || 0) + 1;
        });

        // User activity logs
        const userActivity = allBookings.slice(0, 10).map(b => ({
            activity: `User ${b.userName} booked ${b.seats} ticket(s) for "${b.eventTitle}"`,
            date: b.createdAt,
            user: b.userName,
            event: b.eventTitle,
            seats: b.seats,
            amount: b.totalAmount
        }));

        res.status(200).json({
            totalEvents,
            activeEvents,
            totalBookings,
            ticketsSold,
            totalRevenue,
            totalUsers,
            categoryDistribution: categoryMap,
            userActivity
        });

    } catch (error) {
        console.error("Analytics API error:", error);
        res.status(500).json({ message: "Server error while calculating analytics" });
    }
});

// 7. Admin Dashboard Stats Endpoint (GET /api/admin/stats)
app.get("/api/admin/stats", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                message: "Database connection unavailable. Please check MongoDB Atlas IP whitelist."
            });
        }

        const [totalEvents, activeEvents, totalUsers, totalBookings, allBookings] = await Promise.all([
            Event.countDocuments(),
            Event.countDocuments({ status: "Active" }),
            User.countDocuments(),
            Booking.countDocuments(),
            Booking.find()
        ]);

        const ticketsSold = allBookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);

        res.status(200).json({
            totalEvents,
            activeEvents,
            totalUsers,
            totalBookings,
            ticketsSold
        });

    } catch (error) {
        console.error("Stats error:", error);
        res.status(500).json({ message: "Server error while fetching stats" });
    }
});

// =====================================================
// MODULE 5: BOOKING CONFIRMATION, EVENT REPORTS & REGISTRATION SUMMARY APIS
// =====================================================

// 1. Booking Confirmation API (GET /api/bookings/:id/confirmation)
app.get("/api/bookings/:id/confirmation", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database connection unavailable. Please check MongoDB connection." });
        }

        const { id } = req.params;
        let booking = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            booking = await Booking.findById(id).populate("event").populate("user", "name email");
        }

        // If not found by ObjectId, lookup by confirmationCode
        if (!booking) {
            booking = await Booking.findOne({ confirmationCode: id.trim() }).populate("event").populate("user", "name email");
        }

        if (!booking) {
            return res.status(404).json({
                status: "error",
                message: "Booking confirmation not found. Please verify the booking reference ID."
            });
        }

        const formattedTotal = booking.totalAmount > 0 ? `₹${booking.totalAmount}` : "Free";
        const code = booking.confirmationCode || `CONF-${String(booking._id).slice(-8).toUpperCase()}`;
        const confirmationMsg = booking.confirmationMessage ||
            `Dear ${booking.userName}, your booking for "${booking.eventTitle}" on ${booking.eventDate || "Upcoming"} at ${booking.eventVenue || "Main Venue"} is confirmed! Confirmation Code: ${code}. Reserved ${booking.seats} seat(s). Total Amount: ${formattedTotal}.`;

        const verificationToken = Buffer.from(
            JSON.stringify({
                bookingId: booking._id,
                confirmationCode: code,
                seats: booking.seats,
                userEmail: booking.userEmail,
                bookedAt: booking.createdAt
            })
        ).toString("base64");

        res.status(200).json({
            status: "success",
            confirmationCode: code,
            confirmationMessage: confirmationMsg,
            booking: {
                id: booking._id,
                eventTitle: booking.eventTitle,
                eventDate: booking.eventDate,
                eventVenue: booking.eventVenue,
                userName: booking.userName,
                userEmail: booking.userEmail,
                seats: booking.seats,
                totalAmount: booking.totalAmount,
                formattedTotal: formattedTotal,
                status: booking.status,
                bookedAt: booking.createdAt
            },
            ticketReceipt: {
                ticketNumber: code,
                event: booking.eventTitle,
                dateAndVenue: `${booking.eventDate || 'Upcoming'} • ${booking.eventVenue || 'Main Hall'}`,
                ticketHolder: booking.userName,
                holderEmail: booking.userEmail,
                ticketCount: booking.seats,
                pricePaid: formattedTotal,
                verificationToken: verificationToken,
                issuedAt: new Date(booking.createdAt).toLocaleString()
            }
        });

    } catch (error) {
        console.error("Booking confirmation API error:", error);
        res.status(500).json({ message: "Server error while generating booking confirmation" });
    }
});

// 2. Event Reports API (GET /api/reports/events)
app.get("/api/reports/events", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database connection unavailable. Please check MongoDB connection." });
        }

        const { format, category, status } = req.query;

        let eventQuery = {};
        if (category && category !== "All") eventQuery.category = new RegExp(`^${category}$`, "i");
        if (status && status !== "All") eventQuery.status = status;

        const [events, allBookings] = await Promise.all([
            Event.find(eventQuery).sort({ date: 1, createdAt: -1 }),
            Booking.find().sort({ createdAt: -1 })
        ]);

        let totalRevenue = 0;
        let totalSeatsBooked = 0;
        let totalCapacityAcrossEvents = 0;

        const eventReports = events.map(evt => {
            const matchedBookings = allBookings.filter(b => {
                const byId = b.event && String(b.event) === String(evt._id);
                const byTitle = b.eventTitle && b.eventTitle.trim().toLowerCase() === evt.title.trim().toLowerCase();
                return byId || byTitle;
            });

            const seatsBooked = matchedBookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
            const revenue = matchedBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
            const capacity = (evt.availableSeats || 0) + seatsBooked;
            const occupancyRate = capacity > 0 ? ((seatsBooked / capacity) * 100).toFixed(1) : "0.0";

            totalRevenue += revenue;
            totalSeatsBooked += seatsBooked;
            totalCapacityAcrossEvents += capacity;

            return {
                eventId: evt._id,
                title: evt.title,
                category: evt.category,
                date: evt.date,
                time: evt.time,
                venue: evt.venue,
                status: evt.status,
                ticketPrice: evt.price || 0,
                totalCapacity: capacity,
                seatsBooked: seatsBooked,
                seatsAvailable: evt.availableSeats,
                occupancyRate: `${occupancyRate}%`,
                revenueGenerated: revenue,
                bookingTransactions: matchedBookings.length,
                attendees: matchedBookings.map(b => ({
                    bookingId: b._id,
                    confirmationCode: b.confirmationCode || `CONF-${String(b._id).slice(-8).toUpperCase()}`,
                    userName: b.userName,
                    userEmail: b.userEmail,
                    seats: b.seats,
                    totalAmount: b.totalAmount,
                    status: b.status,
                    bookedAt: b.createdAt
                }))
            };
        });

        const overallOccupancy = totalCapacityAcrossEvents > 0
            ? ((totalSeatsBooked / totalCapacityAcrossEvents) * 100).toFixed(1) + "%"
            : "0.0%";

        // CSV export support
        if (format === "csv") {
            let csv = "Event ID,Title,Category,Date,Time,Venue,Total Capacity,Seats Booked,Seats Available,Occupancy Rate,Revenue (INR),Transactions,Status\r\n";
            eventReports.forEach(e => {
                csv += `"${e.eventId}","${(e.title || '').replace(/"/g, '""')}","${e.category || ''}","${e.date || ''}","${e.time || ''}","${(e.venue || '').replace(/"/g, '""')}",${e.totalCapacity},${e.seatsBooked},${e.seatsAvailable},"${e.occupancyRate}",${e.revenueGenerated},${e.bookingTransactions},"${e.status}"\r\n`;
            });

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="event_reports_${Date.now()}.csv"`);
            return res.status(200).send(csv);
        }

        res.status(200).json({
            summary: {
                totalEventsReported: eventReports.length,
                activeEvents: events.filter(e => e.status === "Active").length,
                totalCapacityAcrossEvents,
                totalSeatsBooked,
                totalRevenue,
                overallOccupancyRate: overallOccupancy
            },
            events: eventReports
        });

    } catch (error) {
        console.error("Event Reports API error:", error);
        res.status(500).json({ message: "Server error while generating event reports" });
    }
});

// Single Event Report API (GET /api/reports/events/:id)
app.get("/api/reports/events/:id", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database connection unavailable." });
        }

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid event ID format" });
        }

        const event = await Event.findById(id);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        const bookings = await Booking.find({
            $or: [
                { event: event._id },
                { eventTitle: new RegExp(`^${event.title.trim()}$`, "i") }
            ]
        }).sort({ createdAt: -1 });

        const seatsBooked = bookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
        const revenueGenerated = bookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
        const totalCapacity = (event.availableSeats || 0) + seatsBooked;
        const occupancyRate = totalCapacity > 0 ? ((seatsBooked / totalCapacity) * 100).toFixed(1) + "%" : "0.0%";

        res.status(200).json({
            event: {
                id: event._id,
                title: event.title,
                category: event.category,
                date: event.date,
                time: event.time,
                venue: event.venue,
                status: event.status,
                ticketPrice: event.price || 0,
                totalCapacity,
                seatsBooked,
                seatsAvailable: event.availableSeats,
                occupancyRate,
                revenueGenerated,
                totalBookings: bookings.length
            },
            attendees: bookings.map(b => ({
                bookingId: b._id,
                confirmationCode: b.confirmationCode || `CONF-${String(b._id).slice(-8).toUpperCase()}`,
                userName: b.userName,
                userEmail: b.userEmail,
                seats: b.seats,
                totalAmount: b.totalAmount,
                status: b.status,
                bookedAt: b.createdAt
            }))
        });

    } catch (error) {
        console.error("Single event report error:", error);
        res.status(500).json({ message: "Server error while fetching single event report" });
    }
});

// 3. Registration Summary API (GET /api/reports/registration-summary)
app.get("/api/reports/registration-summary", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ message: "Database connection unavailable." });
        }

        const [users, bookings] = await Promise.all([
            User.find().select("-password").sort({ createdAt: -1 }),
            Booking.find().sort({ createdAt: -1 })
        ]);

        let totalTicketsSold = 0;
        let totalRevenueContributed = 0;

        const userSummaries = users.map(user => {
            const userEmail = (user.email || "").trim().toLowerCase();
            const userBookings = bookings.filter(b => {
                const byId = b.user && String(b.user) === String(user._id);
                const byEmail = b.userEmail && b.userEmail.trim().toLowerCase() === userEmail;
                return byId || byEmail;
            });

            const bookingsCount = userBookings.length;
            const tickets = userBookings.reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
            const spent = userBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

            totalTicketsSold += tickets;
            totalRevenueContributed += spent;

            const eventsAttended = [...new Set(userBookings.map(b => b.eventTitle))];
            const lastActive = userBookings.length > 0 ? userBookings[0].createdAt : user.createdAt;

            return {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                joinedDate: user.createdAt,
                bookingsCount: bookingsCount,
                totalTickets: tickets,
                totalSpent: spent,
                eventsAttended: eventsAttended,
                lastActiveDate: lastActive,
                status: bookingsCount > 0 ? "Active" : "Registered"
            };
        });

        const activeUsersCount = userSummaries.filter(u => u.bookingsCount > 0).length;
        const idleUsersCount = userSummaries.length - activeUsersCount;

        // User Activity Feed
        const userActivityFeed = [];
        bookings.slice(0, 15).forEach(b => {
            userActivityFeed.push({
                type: "ticket_booking",
                icon: "bi-ticket-perforated",
                user: b.userName,
                email: b.userEmail,
                event: b.eventTitle,
                description: `${b.userName} booked ${b.seats} ticket(s) for "${b.eventTitle}"`,
                amount: b.totalAmount,
                date: b.createdAt
            });
        });

        users.slice(0, 10).forEach(u => {
            userActivityFeed.push({
                type: "user_registration",
                icon: "bi-person-plus",
                user: u.name,
                email: u.email,
                event: null,
                description: `${u.name} registered a new account`,
                amount: 0,
                date: u.createdAt
            });
        });

        userActivityFeed.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            summary: {
                totalRegisteredUsers: users.length,
                activeUsers: activeUsersCount,
                idleUsers: idleUsersCount,
                totalBookings: bookings.length,
                totalTicketsPurchased: totalTicketsSold,
                totalRevenueContributed: totalRevenueContributed,
                averageTicketsPerActiveUser: activeUsersCount > 0 ? (totalTicketsSold / activeUsersCount).toFixed(1) : "0"
            },
            userSummaries: userSummaries,
            recentUserActivity: userActivityFeed.slice(0, 20)
        });

    } catch (error) {
        console.error("Registration Summary API error:", error);
        res.status(500).json({ message: "Server error while generating registration summary" });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const activityRoutes = require("./routes/activity");
const userRoutes = require("./routes/user");
const roomRoutes = require("./routes/room");
const authRoutes = require("./routes/auth");
const configRoutes = require("./routes/config");
const routineRoutes = require("./routes/routine");

app.use("/api/activity", activityRoutes);
app.use("/api/user", userRoutes);
app.use("/api/room", roomRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/config", configRoutes);
app.use("/api/routine", routineRoutes);

// Test Route
app.get("/", (req, res) => {
    res.send("🚀 TrackMe API is running...");
});

// MongoDB URI
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://weteglobal:Ironman@wetesolutions-eduon-fre.5n77q.mongodb.net/FocusFlow?retryWrites=true&w=majority';
console.log("URI:", process.env.MONGO_URI);
console.log("🔄 Connecting to MongoDB...");

// MongoDB Connection
mongoose
    .connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");

        // Start server only after DB connects
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}. Join TrackMe today!`);
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB Connection Failed:", err.message);
        process.exit(1);
    });

// Additional Mongoose Connection Logs
mongoose.connection.on("connected", () => {
    console.log("📦 Mongoose connected to DB");
});

mongoose.connection.on("error", (err) => {
    console.error("⚠️ Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
    console.log("🔌 Mongoose disconnected from DB");
});

/**
 * Render Free Tier Self-Ping (Heartbeat)
 * Prevents the application from spinning down after 15 minutes of inactivity.
 * It pings itself every 14 minutes.
 */
const https = require('https');
const SELF_URL = 'https://track-me-1-frbt.onrender.com';

setInterval(() => {
    https.get(SELF_URL, (res) => {
        console.log(`💓 Heartbeat: ${res.statusCode === 200 ? 'SUCCESS' : 'FAILURE'}`);
    }).on('error', (err) => {
        console.error('❌ Heartbeat Error:', err.message);
    });
}, 14 * 60 * 1000); // 14 minutes in milliseconds

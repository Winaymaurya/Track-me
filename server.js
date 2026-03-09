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

app.use("/api/activity", activityRoutes);
app.use("/api/user", userRoutes);
app.use("/api/room", roomRoutes);
app.use("/api/auth", authRoutes);

// Test Route
app.get("/", (req, res) => {
    res.send("🚀 StudyFlow API is running...");
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
            console.log(`🚀 Server running on port ${PORT}`);
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
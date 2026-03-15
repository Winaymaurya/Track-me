const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const User = require('../models/User');

// ──────────────────────────────────────────────
// GET /  — All sessions for a user (paginated)
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { userId, page = 1, limit = 20 } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId is required' });

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const activities = await Activity.find({ userId })
            .sort({ startTime: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Activity.countDocuments({ userId });

        res.json({
            sessions: activities,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /  — Save a session with full detail
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        userId, type, topic, duration,
        flowStateAchieved, startTime, endTime,
        pauseEvents, totalPauseDuration, pauseCount,
    } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    // Calculate total elapsed (wall-clock) time
    const start = new Date(startTime);
    const end = new Date(endTime);
    const totalElapsed = Math.floor((end - start) / 1000);

    // Calculate focus score: ratio of active time to total elapsed
    const focusScore = totalElapsed > 0
        ? Math.min(100, Math.round((duration / totalElapsed) * 100))
        : 100;

    const activity = new Activity({
        userId,
        type,
        topic,
        duration,
        totalElapsed,
        focusScore,
        flowStateAchieved,
        startTime: start,
        endTime: end,
        pauseEvents: pauseEvents || [],
        totalPauseDuration: totalPauseDuration || 0,
        pauseCount: pauseCount || 0,
        date: start, // date is the day the session started
    });

    try {
        const newActivity = await activity.save();

        // Update user stats
        const user = await User.findById(userId);
        if (user) {
            // Update core stats
            user.totalFocusTime += duration;
            user.totalSessions = (user.totalSessions || 0) + 1;
            if (flowStateAchieved) {
                user.totalFlowSessions = (user.totalFlowSessions || 0) + 1;
            }
            
            user.level = Math.floor(user.totalFocusTime / 3600) + 1;
            user.isFocusing = false;

            // Define achievement map with updated metrics
            const achievementSync = [
                { title: "First Step", progress: user.totalSessions },
                { title: "Focus Novice", progress: Math.floor(user.totalFocusTime / 3600) },
                { title: "Flow Finder", progress: user.totalFlowSessions },
                { title: "Persistence", progress: user.totalSessions },
                { title: "Focus Master", progress: Math.floor(user.totalFocusTime / 3600) },
                { title: "Elite Runner", progress: user.totalSessions },
                { title: "Flow Master", progress: user.totalFlowSessions },
                { title: "Focus Legend", progress: Math.floor(user.totalFocusTime / 3600) },
                { title: "Marathoner", progress: user.totalSessions }
            ];

            const defaultAchievements = [
                { title: "First Step", maxProgress: 1, iconType: "footsteps" },
                { title: "Focus Novice", maxProgress: 5, iconType: "timer" },
                { title: "Flow Finder", maxProgress: 5, iconType: "water" },
                { title: "Persistence", maxProgress: 10, iconType: "trophy" },
                { title: "Focus Master", maxProgress: 50, iconType: "medal" },
                { title: "Elite Runner", maxProgress: 100, iconType: "speedometer" },
                { title: "Flow Master", maxProgress: 50, iconType: "flash" },
                { title: "Focus Legend", maxProgress: 500, iconType: "ribbon" },
                { title: "Marathoner", maxProgress: 300, iconType: "fitness" }
            ];

            if (!user.achievements) user.achievements = [];

            // Add missing achievements safely
            defaultAchievements.forEach(def => {
                const found = user.achievements.find(a => a.title === def.title);
                if (!found) {
                    user.achievements.push({
                        title: def.title,
                        completed: false,
                        progress: 0,
                        maxProgress: def.maxProgress,
                        iconType: def.iconType
                    });
                }
            });

            // Update progress and completion status
            achievementSync.forEach(sync => {
                const ach = user.achievements.find(a => a.title === sync.title);
                if (ach && !ach.completed) {
                    ach.progress = Math.min(sync.progress, ach.maxProgress);
                    if (ach.progress >= ach.maxProgress) {
                        ach.completed = true;
                    }
                }
            });

            await user.save();
        }

        res.status(201).json(newActivity);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /analytics  — Full dashboard data
// ──────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId is required' });

        const uid = new mongoose.Types.ObjectId(userId);

        // 1) Summary by topic
        const topicBreakdown = await Activity.aggregate([
            { $match: { userId: uid } },
            {
                $group: {
                    _id: '$topic',
                    totalDuration: { $sum: '$duration' },
                    avgFocusScore: { $avg: '$focusScore' },
                    type: { $first: '$type' },
                    count: { $sum: 1 },
                    flowCount: {
                        $sum: { $cond: [{ $eq: ['$flowStateAchieved', true] }, 1, 0] },
                    },
                },
            },
            { $sort: { totalDuration: -1 } },
        ]);

        // 2) Daily breakdown for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyData = await Activity.aggregate([
            { $match: { userId: uid, startTime: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' },
                    },
                    totalDuration: { $sum: '$duration' },
                    totalPause: { $sum: '$totalPauseDuration' },
                    sessionCount: { $sum: 1 },
                    avgFocusScore: { $avg: '$focusScore' },
                    flowCount: {
                        $sum: { $cond: [{ $eq: ['$flowStateAchieved', true] }, 1, 0] },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // 3) Weekly summary (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const weeklyData = await Activity.aggregate([
            { $match: { userId: uid, startTime: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: {
                        dayOfWeek: { $dayOfWeek: { date: '$startTime', timezone: 'Asia/Kolkata' } },
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                    },
                    totalDuration: { $sum: '$duration' },
                    sessionCount: { $sum: 1 },
                },
            },
            { $sort: { '_id.date': 1 } },
        ]);

        // 4) Overall stats
        const overallStats = await Activity.aggregate([
            { $match: { userId: uid } },
            {
                $group: {
                    _id: null,
                    totalDuration: { $sum: '$duration' },
                    totalSessions: { $sum: 1 },
                    totalPauseDuration: { $sum: '$totalPauseDuration' },
                    avgFocusScore: { $avg: '$focusScore' },
                    avgSessionDuration: { $avg: '$duration' },
                    longestSession: { $max: '$duration' },
                    totalFlowSessions: {
                        $sum: { $cond: [{ $eq: ['$flowStateAchieved', true] }, 1, 0] },
                    },
                },
            },
        ]);

        // 5) Today's stats
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayStats = await Activity.aggregate([
            { $match: { userId: uid, startTime: { $gte: todayStart } } },
            {
                $group: {
                    _id: null,
                    totalDuration: { $sum: '$duration' },
                    sessionCount: { $sum: 1 },
                    avgFocusScore: { $avg: '$focusScore' },
                },
            },
        ]);

        // 6) Current streak (consecutive days with activity)
        const allDays = await Activity.aggregate([
            { $match: { userId: uid } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                },
            },
            { $sort: { _id: -1 } },
        ]);

        let streak = 0;
        const istOffset = 5.5 * 60 * 60 * 1000;

        for (let i = 0; i < allDays.length + 1; i++) {
            const checkDate = new Date(Date.now() + istOffset);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            
            if (allDays.some(d => d._id === dateStr)) {
                streak++;
            } else {
                if (i === 0) continue; 
                break;
            }
        }

        res.json({
            topicBreakdown,
            dailyData,
            weeklyData,
            overall: overallStats[0] || {
                totalDuration: 0,
                totalSessions: 0,
                totalPauseDuration: 0,
                avgFocusScore: 0,
                avgSessionDuration: 0,
                longestSession: 0,
                totalFlowSessions: 0,
            },
            today: todayStats[0] || { totalDuration: 0, sessionCount: 0, avgFocusScore: 0 },
            streak,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /analytics/calendar  — Calendar heatmap data
// ──────────────────────────────────────────────
router.get('/analytics/calendar', async (req, res) => {
    try {
        const { userId, year, month } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId is required' });

        const uid = new mongoose.Types.ObjectId(userId);

        // Default to current month if not provided
        const y = parseInt(year) || new Date().getFullYear();
        const m = parseInt(month) || new Date().getMonth() + 1;

        const startDate = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00.000+05:30`);
        const endDate = new Date(y, m, 0); // Get last day of month
        endDate.setHours(23, 59, 59, 999);
        // Correct timezone string for boundary
        const endDateIST = new Date(`${y}-${String(m).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59.999+05:30`);

        const calendarData = await Activity.aggregate([
            {
                $match: {
                    userId: uid,
                    startTime: { $gte: startDate, $lte: endDateIST },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                    totalDuration: { $sum: '$duration' },
                    sessionCount: { $sum: 1 },
                    topics: { $addToSet: '$topic' },
                    avgFocusScore: { $avg: '$focusScore' },
                    flowCount: {
                        $sum: { $cond: [{ $eq: ['$flowStateAchieved', true] }, 1, 0] },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({ year: y, month: m, days: calendarData });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /analytics/day  — Detailed sessions for a day
// ──────────────────────────────────────────────
router.get('/analytics/day', async (req, res) => {
    try {
        const { userId, date } = req.query;
        if (!userId || !date) return res.status(400).json({ message: 'userId and date required' });

        const uid = new mongoose.Types.ObjectId(userId);

        // Use exact local timezone start and end of day boundaries
        const dayStart = new Date(date + "T00:00:00.000+05:30");
        const dayEnd = new Date(date + "T23:59:59.999+05:30");

        const sessions = await Activity.find({
            userId: uid,
            startTime: { $gte: dayStart, $lte: dayEnd },
        }).sort({ startTime: -1 });

        const summary = await Activity.aggregate([
            { $match: { userId: uid, startTime: { $gte: dayStart, $lte: dayEnd } } },
            {
                $group: {
                    _id: null,
                    totalDuration: { $sum: '$duration' },
                    sessionCount: { $sum: 1 },
                    avgFocusScore: { $avg: '$focusScore' },
                    topics: { $addToSet: '$topic' },
                },
            },
        ]);

        res.json({
            date,
            sessions,
            summary: summary[0] || { totalDuration: 0, sessionCount: 0, avgFocusScore: 0, topics: [] },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');

// Get all study sessions
router.get('/', async (req, res) => {
    try {
        const sessions = await StudySession.find().sort({ date: -1 });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add a new study session
router.post('/', async (req, res) => {
    const session = new StudySession({
        subject: req.body.subject,
        duration: req.body.duration,
        focusScore: req.body.focusScore,
    });

    try {
        const newSession = await session.save();
        res.status(201).json(newSession);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get analytics data (aggregated by subject)
router.get('/analytics', async (req, res) => {
    try {
        const analytics = await StudySession.aggregate([
            {
                $group: {
                    _id: '$subject',
                    totalDuration: { $sum: '$duration' },
                    avgFocusScore: { $avg: '$focusScore' },
                },
            },
        ]);
        res.json(analytics);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

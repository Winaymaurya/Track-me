const express = require('express');
const router = express.Router();
const Routine = require('../models/Routine');
const mongoose = require('mongoose');

// ──────────────────────────────────────────────
// 1. GET /  — Fetch Routine for User
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'userId is required' });

        const routines = await Routine.find({ userId: new mongoose.Types.ObjectId(userId) })
            .sort({ dayOfWeek: 1 }); // Sort Sunday (0) to Saturday (6)

        // Cleanup entries older than 7 days from completedOn
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let needsSave = false;
        routines.forEach(r => {
            r.slots.forEach(s => {
                if (s.completedOn && s.completedOn.length > 0) {
                    const originalLength = s.completedOn.length;
                    s.completedOn = s.completedOn.filter(d => new Date(d) >= sevenDaysAgo);
                    if (s.completedOn.length !== originalLength) {
                        needsSave = true;
                    }
                }
            });
            if (needsSave) {
                 r.save().catch(e => console.log("Cleaned Save Error:", e));
            }
        });

        res.json(routines);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// 2. POST /slot  — Add a slot to multiple days
// ──────────────────────────────────────────────
router.post('/slot', async (req, res) => {
    try {
        const { userId, daysOfWeek, topic, startTime, endTime, color } = req.body;

        if (!userId || !daysOfWeek || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0 || !topic || !startTime || !endTime) {
            return res.status(400).json({ message: 'Missing required slot details (daysOfWeek must be an array)' });
        }

        const responses = [];

        for (const day of daysOfWeek) {
            let routine = await Routine.findOne({ 
                userId: new mongoose.Types.ObjectId(userId), 
                dayOfWeek: day 
            });

            if (!routine) {
                routine = new Routine({
                    userId: new mongoose.Types.ObjectId(userId),
                    dayOfWeek: day,
                    slots: []
                });
            }

            // Add slot
            routine.slots.push({
                topic,
                startTime,
                color: color || '#6366f1',
                endTime,
                completedOn: []
            });

            // Sort slots by start time
            routine.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

            await routine.save();
            responses.push(routine);
        }

        res.status(201).json(responses);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// 3. DELETE /slot — Delete a slot
// ──────────────────────────────────────────────
router.delete('/slot', async (req, res) => {
    try {
        const { userId, dayOfWeek, slotId } = req.body;

        if (!userId || dayOfWeek === undefined || !slotId) {
            return res.status(400).json({ message: 'Missing userId, dayOfWeek, or slotId' });
        }

        const routine = await Routine.findOne({ 
            userId: new mongoose.Types.ObjectId(userId), 
            dayOfWeek 
        });

        if (!routine) return res.status(404).json({ message: 'Routine day not found' });

        routine.slots = routine.slots.filter(s => s._id.toString() !== slotId);

        await routine.save();
        res.json(routine);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ──────────────────────────────────────────────
// 4. POST /toggle-complete — Mark a slot completed today
// ──────────────────────────────────────────────
router.post('/toggle-complete', async (req, res) => {
    try {
        const { userId, dayOfWeek, slotId, dateStr } = req.body; // dateStr: "2026-03-15" (IST preferred)

        const routine = await Routine.findOne({ 
            userId: new mongoose.Types.ObjectId(userId), 
            dayOfWeek 
        });

        if (!routine) return res.status(404).json({ message: 'Routine day not found' });

        const slot = routine.slots.id(slotId);
        if (!slot) return res.status(404).json({ message: 'Task slot not found' });

        // Convert the date string to a Date object at start of day
        const targetDate = new Date(dateStr + 'T00:00:00.000Z');

        const index = slot.completedOn.findIndex(d => d.toISOString().split('T')[0] === dateStr);

        if (index > -1) {
            // Uncheck
            slot.completedOn.splice(index, 1);
        } else {
            // Check
            slot.completedOn.push(targetDate);
        }

        await routine.save();
        res.json(routine);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

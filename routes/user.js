const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get current user profile 
router.get('/', async (req, res) => {
    try {
        const userId = req.query.id;

        let user;
        if (userId) {
            user = await User.findById(userId);
        } else {
            user = await User.findOne(); // Fallback for debugging
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Assign random avatar if current is default or missing
        if (!user.avatar || user.avatar === 'avatar1') {
            user.avatar = `avatar${Math.floor(Math.random() * 10) + 1}`;
            await user.save();
        }

        res.json(user);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
});

// Update user profile
router.put('/', async (req, res) => {
    try {
        const { id, name, bio, goal, avatar, username, reminders } = req.body;
        if (!id) return res.status(400).json({ message: 'User ID is required' });

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name) user.name = name;
        if (bio !== undefined) user.bio = bio;
        if (goal) user.goal = goal;
        if (avatar) user.avatar = avatar;
        if (reminders) user.reminders = reminders;
        if (username) {
            // Check if username is taken by another user
            const existing = await User.findOne({ username, _id: { $ne: id } });
            if (existing) return res.status(400).json({ message: 'Username already taken' });
            user.username = username;
        }

        await user.save();
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

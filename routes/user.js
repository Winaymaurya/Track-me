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

        // If no user exists, let's create a mocked user for demo purposes!
        if (!user) {
            user = new User({
                name: 'Vinay',
                title: 'Level 12 Scholar',
                totalFocusTime: 45000, // starting focus time
                achievements: [
                    { title: "7 Day Focus", completed: true, progress: 7, maxProgress: 7, iconType: "star" },
                    { title: "100 Hours", completed: false, progress: 82, maxProgress: 100, iconType: "book" }
                ],
            });
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
        const { id, name, bio, goal, avatar, username } = req.body;
        if (!id) return res.status(400).json({ message: 'User ID is required' });

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name) user.name = name;
        if (bio !== undefined) user.bio = bio;
        if (goal) user.goal = goal;
        if (avatar) user.avatar = avatar;
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

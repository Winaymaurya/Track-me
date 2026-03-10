const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Change this to use environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'this_is_a_very_secret_key_for_studyflow';

// @route   POST /api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
    try {
        const { name, username, password, goal } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }

        // Check for existing user
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const randomAvatarId = `avatar${Math.floor(Math.random() * 10) + 1}`;

        user = new User({
            name,
            username,
            password,
            avatar: randomAvatarId,
            goal: goal || 'Academics',
            // default stats
            totalFocusTime: 0,
            achievements: [
                { title: "7 Day Focus", completed: false, progress: 0, maxProgress: 7, iconType: "star" },
                { title: "100 Hours", completed: false, progress: 0, maxProgress: 100, iconType: "book" }
            ],
        });

        await user.save();

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                level: user.level,
                avatar: user.avatar,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// @route   POST /api/auth/login
// @desc    Login user
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }

        // Check for existing user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                level: user.level,
                avatar: user.avatar,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

module.exports = router;

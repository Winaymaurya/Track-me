const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendPushNotification = require('../utils/notifier');

// Change this to use environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'this_is_a_very_secret_key_for_studyflow';

// @route   POST /api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
    try {
        const { name, username, password, goal, referralCode } = req.body;

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
            totalSessions: 0,
            totalFlowSessions: 0,
            achievements: [
                { title: "First Step", completed: false, progress: 0, maxProgress: 1, iconType: "footsteps" },
                { title: "Focus Novice", completed: false, progress: 0, maxProgress: 5, iconType: "timer" },
                { title: "Flow Finder", completed: false, progress: 0, maxProgress: 5, iconType: "water" },
                { title: "Persistence", completed: false, progress: 0, maxProgress: 10, iconType: "trophy" },
                { title: "Focus Master", completed: false, progress: 0, maxProgress: 50, iconType: "medal" },
                { title: "Elite Runner", completed: false, progress: 0, maxProgress: 100, iconType: "speedometer" },
                { title: "Flow Master", completed: false, progress: 0, maxProgress: 50, iconType: "flash" },
                { title: "Focus Legend", completed: false, progress: 0, maxProgress: 500, iconType: "ribbon" },
                { title: "Marathoner", completed: false, progress: 0, maxProgress: 300, iconType: "fitness" }
            ],
        });

        // 1. Referral Logic
        if (referralCode) {
            const referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });
            if (referrer) {
                user.referredBy = referrer._id;
                referrer.referrals.push({ user: user._id, date: Date.now() });
                await referrer.save();

                // Send push notification to referrer
                if (referrer.pushToken) {
                    await sendPushNotification(
                        referrer.pushToken,
                        'New Referral Unlocked! 🎁',
                        `${name} joined TrackMe using your code! "The Recruiter" Avatar unlocked 🦸‍♂️`,
                        { type: 'referral', user: user._id }
                    );
                }
            }
        }

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

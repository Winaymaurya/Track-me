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

        // 2. Safe-Sync Missing Achievements (For existing users)
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

        let needsSave = false;
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
                needsSave = true;
            }
        });

        // 3. Optional update logic
        const achievementSync = [
            { title: "Elite Runner", progress: user.totalSessions || 0 },
            { title: "Flow Master", progress: user.totalFlowSessions || 0 },
            { title: "Focus Legend", progress: Math.floor((user.totalFocusTime || 0) / 3600) },
            { title: "Marathoner", progress: user.totalSessions || 0 }
        ];

        achievementSync.forEach(sync => {
            const ach = user.achievements.find(a => a.title === sync.title);
            if (ach && !ach.completed) {
                const newProgress = Math.min(sync.progress, ach.maxProgress);
                if (newProgress !== ach.progress) {
                    ach.progress = newProgress;
                    needsSave = true;
                }
                if (ach.progress >= ach.maxProgress) {
                    ach.completed = true;
                }
            }
        });

        // Restore random avatar allocation if missing
        if (!user.avatar || user.avatar === 'avatar1') {
            user.avatar = `avatar${Math.floor(Math.random() * 10) + 1}`;
            needsSave = true;
        }

        if (needsSave) {
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

// Update push token
router.put('/push-token', async (req, res) => {
    const { userId, pushToken } = req.body;
    try {
        await User.findByIdAndUpdate(userId, { pushToken });
        res.json({ message: 'Push token updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get referral details of a user
router.get('/referrals', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await User.findById(userId).populate('referrals.user', 'name username avatar level');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Fix for existing users who do not have a referral code initially
        if (!user.referralCode) {
            const generateCode = () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let code = 'TM-';
                for (let i = 0; i < 4; i++) {
                    code += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return code;
            };
            user.referralCode = generateCode();
            await user.save();
        }

        res.json({
            referralCode: user.referralCode,
            referredBy: user.referredBy,
            referrals: user.referrals,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

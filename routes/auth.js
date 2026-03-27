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
        const { name, username, email, password, goal, referralCode } = req.body;

        if (!name || !username || !password || !email) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }

        // Check for existing user
        let user = await User.findOne({ $or: [{ username }, { email: email.toLowerCase() }] });
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

const nodemailer = require('nodemailer');

// ──────────────────────────────────────────────
// POST /forgot-password — Send OTP to email
// ──────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    try {
        const { identity } = req.body;
        if (!identity) return res.status(400).json({ message: 'Email or Username is required' });

        const user = await User.findOne({
            $or: [
                { email: identity.toLowerCase() },
                { username: identity }
            ]
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.email) {
            return res.status(400).json({ message: 'No email associated with this account. Cannot reset password.' });
        }

        // 1. Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordOTP = otp;
        user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
        await user.save();

        // 2. Setup Nodemailer
        // SETUP SMTP CREDENTIALS IN YOUR .ENV!
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'your_email@gmail.com', 
                pass: process.env.EMAIL_PASS || 'your_app_password', 
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER || 'your_email@gmail.com',
            to: user.email,
            subject: 'TrackMe - Password Reset Code',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #6366f1;">Reset Your Password</h2>
                    <p>You requested to reset your password for the TrackMe app.</p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 10px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1e1b4b;">${otp}</span>
                    </div>
                    <p>This code is valid for 10 minutes. If you did not make this request, you can safely ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'OTP sent to your email address' });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Failed to send reset email. Setup your EMAIL_USER and EMAIL_PASS in .env' });
    }
});

// ──────────────────────────────────────────────
// POST /reset-password — Verify OTP & Set Password
// ──────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Please provide email, OTP, and new password' });
        }

        const user = await User.findOne({ 
            email: email.toLowerCase(),
            resetPasswordOTP: otp,
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP code' });
        }

        user.password = newPassword;
        user.resetPasswordOTP = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: 'Password has been reset successfully' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;


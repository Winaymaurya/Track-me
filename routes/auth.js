const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const sendPushNotification = require('../utils/notifier');

// Always load JWT secret from ENV
const JWT_SECRET = process.env.JWT_SECRET || 'this_is_a_very_secret_key_for_studyflow';

// ──────────────────────────────────────────────────────────────
// In-memory rate limiter for OTP requests
// Max 3 OTP requests per IP per 15-minute window
// ──────────────────────────────────────────────────────────────
const otpRateLimitMap = new Map(); // ip => { count, firstRequest }
const OTP_LIMIT = 3;
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isOtpRateLimited(ip) {
    const now = Date.now();
    const entry = otpRateLimitMap.get(ip);
    if (!entry || now - entry.firstRequest > OTP_WINDOW_MS) {
        otpRateLimitMap.set(ip, { count: 1, firstRequest: now });
        return false;
    }
    if (entry.count >= OTP_LIMIT) return true;
    entry.count += 1;
    return false;
}

// ──────────────────────────────────────────────────────────────
// Reusable Nodemailer transporter
// ──────────────────────────────────────────────────────────────
function createMailTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────
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
            email: email.toLowerCase(),
            password,
            avatar: randomAvatarId,
            goal: goal || 'Academics',
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

        // Referral Logic
        if (referralCode) {
            const referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });
            if (referrer) {
                user.referredBy = referrer._id;
                referrer.referrals.push({ user: user._id, date: Date.now() });
                await referrer.save();

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

        // ── Welcome email (fire-and-forget — never blocks the response) ──
        setImmediate(async () => {
            try {
                const transporter = createMailTransporter();
                await transporter.sendMail({
                    from: `"TrackMe 🎯" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: `Welcome to TrackMe, ${user.name.split(' ')[0]}! 🎉`,
                    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1e293b;border-radius:24px;overflow:hidden;border:1px solid #334155;">

        <!-- Hero Banner -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#ec4899 100%);padding:48px 32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🎯</div>
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">TrackMe</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:500;">Focus. Grow. Achieve.</p>
          </td>
        </tr>

        <!-- Main Content -->
        <tr>
          <td style="padding:36px 32px 24px;">
            <h2 style="margin:0 0 12px;color:#f8fafc;font-size:22px;font-weight:700;">
              Hey ${user.name.split(' ')[0]}, welcome aboard! 🙌
            </h2>
            <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.7;">
              You've just taken your first step toward a more focused, productive life. 
              We're genuinely excited to have you in the TrackMe family!
            </p>

            <!-- Stats Row -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="width:33%;padding:4px;">
                  <div style="background:#0f172a;border-radius:14px;padding:16px 8px;text-align:center;border:1px solid #334155;">
                    <div style="font-size:24px;margin-bottom:4px;">⏱️</div>
                    <div style="color:#6366f1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Focus Timer</div>
                  </div>
                </td>
                <td style="width:33%;padding:4px;">
                  <div style="background:#0f172a;border-radius:14px;padding:16px 8px;text-align:center;border:1px solid #334155;">
                    <div style="font-size:24px;margin-bottom:4px;">📊</div>
                    <div style="color:#8b5cf6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Analytics</div>
                  </div>
                </td>
                <td style="width:33%;padding:4px;">
                  <div style="background:#0f172a;border-radius:14px;padding:16px 8px;text-align:center;border:1px solid #334155;">
                    <div style="font-size:24px;margin-bottom:4px;">🏆</div>
                    <div style="color:#ec4899;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Achievements</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Tip Box -->
            <div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15));border:1px solid rgba(99,102,241,0.3);border-radius:14px;padding:20px 22px;margin-bottom:28px;">
              <p style="margin:0 0 6px;color:#a5b4fc;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">💡 Quick Start Tip</p>
              <p style="margin:0;color:#c7d2fe;font-size:14px;line-height:1.6;">
                Start your first focus session today! Even just <strong>25 minutes</strong> of deep work can build a streak and unlock your first achievement. 🔥
              </p>
            </div>

            <!-- Your Account -->
            <div style="background:#0f172a;border-radius:14px;padding:18px 20px;margin-bottom:28px;border:1px solid #334155;">
              <p style="margin:0 0 10px;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Account</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:4px 0;">Name</td>
                  <td style="color:#e2e8f0;font-size:13px;font-weight:600;text-align:right;">${user.name}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:4px 0;">Username</td>
                  <td style="color:#e2e8f0;font-size:13px;font-weight:600;text-align:right;">@${user.username}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;padding:4px 0;">Goal</td>
                  <td style="color:#e2e8f0;font-size:13px;font-weight:600;text-align:right;">${user.goal}</td>
                </tr>
              </table>
            </div>

            <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;text-align:center;">
              Ready to crush your goals? Open the app and start your first session. We're rooting for you! 💪
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;text-align:center;">
            <p style="margin:0 0 6px;color:#a5b4fc;font-size:13px;font-weight:700;">TrackMe 🎯</p>
            <p style="margin:0;color:#475569;font-size:11px;">Focus. Grow. Achieve. · You're receiving this because you just registered.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
                    `
                });
                console.log(`✅ Welcome email sent to ${user.email}`);
            } catch (emailErr) {
                // Email failure should never affect registration success
                console.error('⚠️  Welcome email failed (non-critical):', emailErr.message);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Please enter all fields' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

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

// ──────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Security: rate limiting + OTP stored as bcrypt hash
// ──────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    try {
        // 1. Rate limit by IP
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
        if (isOtpRateLimited(clientIp)) {
            return res.status(429).json({
                message: 'Too many reset requests. Please wait 15 minutes before trying again.'
            });
        }

        const { identity } = req.body;
        if (!identity || typeof identity !== 'string') {
            return res.status(400).json({ message: 'Email or Username is required' });
        }

        const sanitised = identity.trim();

        // 2. Find user by email OR username
        const user = await User.findOne({
            $or: [
                { email: sanitised.toLowerCase() },
                { username: sanitised }
            ]
        });

        // Generic message to prevent user enumeration
        if (!user || !user.email) {
            return res.json({
                success: true,
                message: 'If an account with that email/username exists, a reset code has been sent.'
            });
        }

        // 3. Generate cryptographically secure 6-digit OTP
        const rawOtp = crypto.randomInt(100000, 999999).toString();

        // 4. Hash the OTP before storing (never store plaintext OTP)
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(rawOtp, salt);

        user.resetPasswordOTP = hashedOtp;
        user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
        await user.save();

        // 5. Send email with the RAW (unhashed) OTP
        const transporter = createMailTransporter();
        await transporter.sendMail({
            from: `"TrackMe App" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'TrackMe — Your Password Reset Code',
            html: `
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; color: #fff; letter-spacing: -0.5px;">TrackMe 🎯</h1>
                    </div>
                    <div style="padding: 32px;">
                        <h2 style="color: #f8fafc; font-size: 20px; margin-top: 0;">Password Reset Request</h2>
                        <p style="color: #94a3b8; line-height: 1.6;">
                            Hi <strong style="color: #e2e8f0;">${user.name}</strong>, we received a request to reset your TrackMe password.
                            Use the code below — it expires in <strong style="color: #f59e0b;">10 minutes</strong>.
                        </p>
                        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                            <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #6366f1; font-family: monospace;">${rawOtp}</span>
                        </div>
                        <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
                            If you did not request a password reset, you can safely ignore this email. Your password will not change.
                        </p>
                        <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
                        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">© 2026 TrackMe · Focus. Grow. Achieve.</p>
                    </div>
                </div>
            `
        });

        res.json({
            success: true,
            // Return masked email so frontend can display it
            maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
            message: 'Reset code sent to your email.'
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Security: compare against hashed OTP, enforce expiry
// ──────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Please provide email, OTP, and new password' });
        }

        if (typeof otp !== 'string' || otp.trim().length !== 6) {
            return res.status(400).json({ message: 'OTP must be a 6-digit code' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const sanitised = email.trim();

        // Find user by email OR username (matches what forgot-password used)
        const user = await User.findOne({
            $or: [
                { email: sanitised.toLowerCase() },
                { username: sanitised }
            ],
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user || !user.resetPasswordOTP) {
            return res.status(400).json({ message: 'Invalid or expired reset code' });
        }

        // Verify OTP against stored bcrypt hash
        const isOtpValid = await bcrypt.compare(otp.trim(), user.resetPasswordOTP);
        if (!isOtpValid) {
            return res.status(400).json({ message: 'Invalid or expired reset code' });
        }

        // Set new password (pre-save hook will hash it)
        user.password = newPassword;
        user.resetPasswordOTP = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: 'Password reset successfully! You can now log in.' });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/unlock-avatar
// Unlock a random avatar after watching a rewarded ad (max 3/day)
// ──────────────────────────────────────────────────────────────
router.post('/unlock-avatar', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const today = new Date().toISOString().split('T')[0];

        // Reset counter if it's a new day
        if (user.lastAvatarUnlockDate !== today) {
            user.avatarUnlocksToday = 0;
            user.lastAvatarUnlockDate = today;
        }

        // Check limit
        if (user.avatarUnlocksToday >= 3) {
            return res.status(400).json({ 
                message: 'Daily limit reached! You can unlock 3 avatars per day. Come back tomorrow! 🎯' 
            });
        }

        // Find all lockable avatars that the user hasn't unlocked yet
        // We exclude referral-only avatars and level-based avatars that are already high level
        const AVATARS = [
            'avatar4', 'avatar5', 'avatar6', 'avatar7', 'avatar8', 'avatar9',
            'avatar13', 'avatar14', 'avatar15', 'avatar16', 'avatar17', 'avatar18',
            'avatar19', 'avatar20', 'avatar21', 'avatar22', 'avatar23', 'avatar24',
            'avatar25', 'avatar26', 'avatar27'
        ];

        const lockedAvatars = AVATARS.filter(id => !user.unlockedAvatars.includes(id));

        if (lockedAvatars.length === 0) {
            return res.status(400).json({ message: 'Wow! You have unlocked all available mystery avatars! 🏆' });
        }

        // Pick one randomly
        const randomIndex = Math.floor(Math.random() * lockedAvatars.length);
        const unlockedId = lockedAvatars[randomIndex];

        user.unlockedAvatars.push(unlockedId);
        user.avatarUnlocksToday += 1;
        await user.save();

        res.json({ 
            success: true, 
            unlockedId, 
            unlocksToday: user.avatarUnlocksToday,
            message: `New avatar unlocked: ${unlockedId}! 🎁` 
        });

    } catch (err) {
        console.error('Unlock avatar error:', err);
        res.status(500).json({ message: 'Failed to unlock avatar. Please try again.' });
    }
});

module.exports = router;

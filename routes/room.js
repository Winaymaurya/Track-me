const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');
const mongoose = require('mongoose');
const sendPushNotification = require('../utils/notifier');

// Search users by username
router.get('/search', async (req, res) => {
    try {
        const { q, userId } = req.query;
        if (!q) return res.json([]);

        const currentUser = await User.findById(userId);
        if (!currentUser) return res.status(404).json({ message: 'User not found' });

        const users = await User.find({
            username: { $regex: q, $options: 'i' },
            _id: { $ne: userId } // exclude self
        }).select('name username avatar _id friends friendRequests').limit(10);

        const results = users.map(u => {
            let status = 'none';
            if (currentUser.friends.includes(u._id)) {
                status = 'friend';
            } else if (u.friendRequests.some(r => r.from.toString() === userId && r.status === 'pending')) {
                status = 'pending';
            } else if (currentUser.friendRequests.some(r => r.from.toString() === u._id.toString() && r.status === 'pending')) {
                status = 'received';
            }

            return {
                _id: u._id,
                name: u.name,
                username: u.username,
                avatar: u.avatar,
                status: status
            };
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Send a friend request (with notification)
router.post('/friend-request', async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;

        if (fromUserId === toUserId) {
            return res.status(400).json({ message: "You can't add yourself" });
        }

        const fromUser = await User.findById(fromUserId);
        const toUser = await User.findById(toUserId);

        if (!fromUser || !toUser) return res.status(404).json({ message: 'User not found' });

        // Check if already friends
        if (toUser.friends.includes(fromUserId)) {
            return res.status(400).json({ message: 'Already friends' });
        }

        // Add to recipient's requests
        const alreadyRequested = toUser.friendRequests.some(r => r.from.toString() === fromUserId && r.status === 'pending');
        if (alreadyRequested) return res.status(400).json({ message: 'Request already pending' });

        toUser.friendRequests.push({ from: fromUserId, status: 'pending' });
        await toUser.save();

        // Send Push Notification
        if (toUser.pushToken) {
            await sendPushNotification(
                toUser.pushToken,
                'New Friend Request! 🤝',
                `${fromUser.name} (@${fromUser.username}) wants to be your study buddy!`,
                { type: 'friend_request', fromId: fromUserId }
            );
        }

        res.json({ message: 'Request sent' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get pending friend requests for a user
router.get('/friend-requests', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await User.findById(userId).populate('friendRequests.from', 'name username avatar');

        if (!user) return res.status(404).json({ message: 'User not found' });

        const pending = user.friendRequests.filter(r => r.status === 'pending');
        res.json(pending);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Accept or reject friend request
router.post('/friend-request/respond', async (req, res) => {
    try {
        const { userId, requestId, action } = req.body; // action: 'accept' or 'reject'

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const request = user.friendRequests.id(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        if (action === 'accept') {
            request.status = 'accepted';

            // Add each other as friends
            if (!user.friends.includes(request.from)) {
                user.friends.push(request.from);
            }
            await user.save();

            // Add reverse friendship
            const fromUser = await User.findById(request.from);
            if (fromUser && !fromUser.friends.includes(userId)) {
                fromUser.friends.push(userId);
                await fromUser.save();
            }

            res.json({ message: 'Friend request accepted!' });
        } else {
            request.status = 'rejected';
            await user.save();
            res.json({ message: 'Friend request rejected' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get friends list
router.get('/friends', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await User.findById(userId).populate('friends', 'name username totalFocusTime level avatar isFocusing');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json(user.friends);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update live focus status
router.post('/status', async (req, res) => {
    try {
        const { userId, isFocusing } = req.body;
        if (!userId) return res.status(400).json({ message: 'UserId is required' });
        
        await User.findByIdAndUpdate(userId, { isFocusing });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Helper: Calculate Streak for a User ID
const calculateUserStreak = async (userId) => {
    try {
        const allDays = await Activity.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                },
            },
            { $sort: { _id: -1 } },
        ]);

        let streak = 0;
        // Current IST date string
        const istOffset = 5.5 * 60 * 60 * 1000;
        const todayStr = new Date(Date.now() + istOffset).toISOString().split('T')[0];

        // This is a simple linear scan, could be optimized but works for now
        for (let i = 0; i < allDays.length + 1; i++) {
            const checkDate = new Date(Date.now() + istOffset);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            
            if (allDays.some(d => d._id === dateStr)) {
                streak++;
            } else {
                // If today is empty, skip and check yesterday
                if (i === 0) continue; 
                break;
            }
        }
        return streak;
    } catch (e) {
        return 0;
    }
};

// Real leaderboard based on friends
router.get('/leaderboard', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.json([]);
        }

        const user = await User.findById(userId).populate('friends', 'name username totalFocusTime level avatar isFocusing');

        if (!user) return res.json([]);

        // Build leaderboard from user + friends
        const participants = [
            { _id: user._id, name: user.name, totalFocusTime: user.totalFocusTime, level: user.level, avatar: user.avatar, isYou: true, isFocusing: user.isFocusing },
            ...user.friends.map(f => ({
                _id: f._id, name: f.name, totalFocusTime: f.totalFocusTime, level: f.level, avatar: f.avatar, isYou: false, isFocusing: f.isFocusing
            }))
        ];


        // Sort by totalFocusTime descending
        participants.sort((a, b) => b.totalFocusTime - a.totalFocusTime);

        // Add rank, format hours AND FETCH STREAK
        const leaderboard = await Promise.all(participants.map(async (p, idx) => {
            const streak = await calculateUserStreak(p._id);
            return {
                _id: p._id,
                name: p.isYou ? `${p.name} (You)` : p.name,
                hours: `${(p.totalDuration || p.totalFocusTime / 3600).toFixed(1)}h`,
                totalFocusTime: p.totalFocusTime,
                rank: idx + 1,
                level: p.level,
                color: idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-700' : 'text-gray-500',
                isYou: p.isYou,
                avatar: p.avatar,
                streak: streak,
                isFocusing: p.isFocusing
            };
        }));


        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get a friend's analytics
router.get('/friend-analytics', async (req, res) => {
    try {
        const { userId, friendId, month, year, date } = req.query;

        // Verify they are actually friends
        const user = await User.findById(userId);
        if (!user || (!user.friends.includes(friendId) && friendId.toString() !== userId.toString())) {
            return res.status(403).json({ message: 'Not friends with this user' });
        }

        const fid = new mongoose.Types.ObjectId(String(friendId));
        const friend = await User.findById(friendId).select('name username totalFocusTime level avatar bio goal joinDate isFocusing');

        // If 'date' is provided, we only want detail for that specific day
        if (date) {
            const sessions = await Activity.find({
                userId: fid,
                startTime: {
                    $gte: new Date(date + 'T00:00:00'),
                    $lte: new Date(date + 'T23:59:59')
                }
            }).sort({ startTime: -1 });

            // Summary for that day
            const summary = await Activity.aggregate([
                {
                    $match: {
                        userId: fid,
                        startTime: {
                            $gte: new Date(date + 'T00:00:00'),
                            $lte: new Date(date + 'T23:59:59')
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalDuration: { $sum: '$duration' },
                        sessionCount: { $sum: 1 },
                        avgFocusScore: { $avg: '$focusScore' }
                    }
                }
            ]);

            return res.json({ sessions, summary: summary[0] || { totalDuration: 0, sessionCount: 0, avgFocusScore: 0 } });
        }

        // Otherwise return month-wise summary for calendar
        let dateQuery = { userId: fid };
        if (month && year) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59);
            dateQuery.startTime = { $gte: start, $lte: end };
        }

        const dailyAnalytics = await Activity.aggregate([
            { $match: dateQuery },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                    totalDuration: { $sum: '$duration' },
                    count: { $sum: 1 },
                }
            },
            { $sort: { _id: -1 } }
        ]);

        const sessionCount = await Activity.countDocuments({ userId: fid });

        const streak = await calculateUserStreak(friendId);

        const recentSessions = await Activity.find({ userId: fid }).sort({ startTime: -1 }).limit(5);

        res.json({
            friend,
            dailyAnalytics,
            sessionCount,
            recentSessions,
            streak
        });


    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// Poke/Nudge a friend
router.post('/nudge', async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;
        const fromUser = await User.findById(fromUserId);
        const toUser = await User.findById(toUserId);

        if (!fromUser || !toUser) return res.status(404).json({ message: 'User not found' });

        // Verify they are friends
        if (!toUser.friends.includes(fromUserId)) {
            return res.status(403).json({ message: 'Only friends can nudge each other' });
        }

        // Rate limiting: 1 nudge per hour per friend
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentNudge = (toUser.lastNudges || []).find(
            n => n.from.toString() === fromUserId && n.date > oneHourAgo
        );

        if (recentNudge) {
            const minutesLeft = Math.ceil((new Date(recentNudge.date).getTime() + 60 * 60 * 1000 - Date.now()) / (60 * 1000));
            return res.status(429).json({ message: `Please wait ${minutesLeft} minutes before nudging again.` });
        }

        // Send Push Notification
        if (toUser.pushToken) {
            await sendPushNotification(
                toUser.pushToken,
                'Focus Ping! 🎯',
                `${fromUser.name} is calling you to focus! 💪`,
                {
                    type: 'nudge',
                    fromId: fromUserId,
                    fromAvatar: fromUser.avatar,
                    fromName: fromUser.name
                }
            );

            // Update nudge history (with cleanup)
            toUser.lastNudges = (toUser.lastNudges || []).filter(n => n.date > oneHourAgo);
            toUser.lastNudges.push({ from: fromUserId, date: new Date() });
            await toUser.save();

            res.json({ message: 'Ping sent!' });
        } else {
            res.status(400).json({ message: 'User has notifications disabled' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Unfriend a user
router.post('/unfriend', async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) return res.status(404).json({ message: 'User not found' });

        user.friends = user.friends.filter(f => f.toString() !== friendId);
        friend.friends = friend.friends.filter(f => f.toString() !== userId);

        await Promise.all([user.save(), friend.save()]);
        res.json({ message: 'Unfriended successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

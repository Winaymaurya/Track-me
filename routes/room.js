const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');
const mongoose = require('mongoose');

// Search users by username
router.get('/search', async (req, res) => {
    try {
        const { q, userId } = req.query;
        if (!q) return res.json([]);

        const users = await User.find({
            username: { $regex: q, $options: 'i' },
            _id: { $ne: userId } // exclude self
        }).select('name username avatar _id').limit(10);


        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Send friend request
router.post('/friend-request', async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;

        if (fromUserId === toUserId) {
            return res.status(400).json({ message: "You can't add yourself" });
        }

        const toUser = await User.findById(toUserId);
        if (!toUser) return res.status(404).json({ message: 'User not found' });

        // Check if already friends
        if (toUser.friends.includes(fromUserId)) {
            return res.status(400).json({ message: 'Already friends' });
        }

        // Check if request already sent
        const existing = toUser.friendRequests.find(
            r => r.from.toString() === fromUserId && r.status === 'pending'
        );
        if (existing) {
            return res.status(400).json({ message: 'Request already sent' });
        }

        toUser.friendRequests.push({ from: fromUserId, status: 'pending' });
        await toUser.save();

        res.json({ message: 'Friend request sent!' });
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
        const user = await User.findById(userId).populate('friends', 'name username totalFocusTime level avatar');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json(user.friends);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Real leaderboard based on friends
router.get('/leaderboard', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.json([]);
        }

        const user = await User.findById(userId).populate('friends', 'name username totalFocusTime level avatar');

        if (!user) return res.json([]);

        // Build leaderboard from user + friends
        const participants = [
            { _id: user._id, name: user.name, totalFocusTime: user.totalFocusTime, level: user.level, avatar: user.avatar, isYou: true },
            ...user.friends.map(f => ({
                _id: f._id, name: f.name, totalFocusTime: f.totalFocusTime, level: f.level, avatar: f.avatar, isYou: false
            }))
        ];


        // Sort by totalFocusTime descending
        participants.sort((a, b) => b.totalFocusTime - a.totalFocusTime);

        // Add rank and format hours
        const leaderboard = participants.map((p, idx) => ({
            _id: p._id,
            name: p.isYou ? `${p.name} (You)` : p.name,
            hours: `${(p.totalFocusTime / 3600).toFixed(1)}h`,
            rank: idx + 1,
            level: p.level,
            color: idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-700' : 'text-gray-500',
            isYou: p.isYou,
            avatar: p.avatar
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
        const friend = await User.findById(friendId).select('name username totalFocusTime level avatar bio goal joinDate');

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

        // Calculate Streak
        const allDays = await Activity.aggregate([
            { $match: { userId: fid } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                },
            },
            { $sort: { _id: -1 } },
        ]);

        let streak = 0;
        const todayStr = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

        for (let i = 0; i < allDays.length; i++) {
            const checkDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];
            if (allDays.some(d => d._id === dateStr)) {
                streak++;
            } else {
                // If today is empty, streak might still be active if yesterday was active
                if (i === 0) continue;
                break;
            }
        }

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

// Helper for Push Notifications via Expo
const https = require('https');
const sendPushNotification = async (token, title, body, data = {}) => {
    if (!token || !token.startsWith('ExponentPushToken')) return;

    const message = {
        to: token,
        title,
        body,
        data,
    };

    const options = {
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
        },
    };

    const req = https.request(options, (res) => {
        res.on('data', () => { }); // Consume data
    });

    req.on('error', (e) => {
        console.error('Push Notification Error:', e);
    });

    req.write(JSON.stringify(message));
    req.end();
};

// Send a friend request (with notification)
router.post('/friend-request', async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;
        const fromUser = await User.findById(fromUserId);
        const toUser = await User.findById(toUserId);

        if (!fromUser || !toUser) return res.status(404).json({ message: 'User not found' });

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

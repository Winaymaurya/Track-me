const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');

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
            // Fallback mock data
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
        const { userId, friendId } = req.query;

        // Verify they are actually friends
        const user = await User.findById(userId);
        if (!user || !user.friends.includes(friendId)) {
            return res.status(403).json({ message: 'Not friends with this user' });
        }

        const friend = await User.findById(friendId).select('name username totalFocusTime level avatar');
        const sessionCount = await Activity.countDocuments({ userId: friendId });

        const analytics = await Activity.aggregate([

            { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(friendId) } },
            {
                $group: {
                    _id: '$topic',
                    totalDuration: { $sum: '$duration' },
                    count: { $sum: 1 },
                    type: { $first: '$type' },
                }
            },
            { $sort: { totalDuration: -1 } }
        ]);

        res.json({ friend, analytics, sessionCount });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

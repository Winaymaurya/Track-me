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

module.exports = router;

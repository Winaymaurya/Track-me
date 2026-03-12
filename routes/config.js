const express = require('express');
const router = express.Router();

// Current active app configuration
// In a real production app, you might store this in MongoDB to change it without redeploying
router.get('/version', (req, res) => {
    res.json({
        latestVersion: '1.0.2', //` Update this when you push a new AAB to Play Store
        minRequiredVersion: '1.0.2', // Users below this will be forced to update
        updateUrl: 'https://play.google.com/store/apps/details?id=com.winaymauryatrackme.app',
        forceUpdate: true,
        message: 'A new version of TrackMe is available with better performance and new features! 🔥'
    });
});

module.exports = router;

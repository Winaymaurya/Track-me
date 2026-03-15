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

module.exports = sendPushNotification;

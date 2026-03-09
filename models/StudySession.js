const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
    },
    duration: {
        type: Number, // in minutes
        required: true,
    },
    focusScore: {
        type: Number, // percentage out of 100
        default: 100,
    },
    date: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('StudySession', StudySessionSchema);

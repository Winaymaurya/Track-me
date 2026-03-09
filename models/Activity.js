const mongoose = require('mongoose');

const PauseEventSchema = new mongoose.Schema({
    pausedAt: { type: Date, required: true },
    resumedAt: { type: Date },
    duration: { type: Number, default: 0 }, // seconds
}, { _id: false });

const ActivitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['Study', 'Task'],
        required: true,
    },
    topic: {
        type: String,
        required: true,
    },
    duration: {
        type: Number, // total active duration in seconds (excluding pauses)
        required: true,
    },
    totalElapsed: {
        type: Number, // total wall-clock time from start to end in seconds
        default: 0,
    },
    focusScore: {
        type: Number, // calculated: (activeDuration / totalElapsed) * 100
        default: 100,
    },
    flowStateAchieved: {
        type: Boolean,
        default: false,
    },
    startTime: {
        type: Date,
        default: Date.now,
    },
    endTime: {
        type: Date,
        default: Date.now,
    },
    pauseEvents: {
        type: [PauseEventSchema],
        default: [],
    },
    totalPauseDuration: {
        type: Number, // total seconds spent paused
        default: 0,
    },
    pauseCount: {
        type: Number,
        default: 0,
    },
    date: {
        type: Date,
        default: Date.now,
    },
});

// Index for efficient date-range queries
ActivitySchema.index({ userId: 1, date: -1 });
ActivitySchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model('Activity', ActivitySchema);

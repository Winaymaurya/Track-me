const mongoose = require('mongoose');

const RoutineSlotSchema = new mongoose.Schema({
    topic: {
        type: String,
        required: true,
        trim: true
    },
    startTime: {
        type: String, // format: "08:30" (24-hour)
        required: true
    },
    endTime: {
        type: String, // format: "09:30" (24-hour)
        required: true
    },
    color: {
        type: String,
        default: '#6366f1' // default purple
    },
    completedOn: [Date] // list of dates this slot was checked off
});

const RoutineSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dayOfWeek: {
        type: Number, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        required: true
    },
    slots: [RoutineSlotSchema]
}, { timestamps: true });

// Prevent duplicate days per user
RoutineSchema.index({ userId: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model('Routine', RoutineSchema);

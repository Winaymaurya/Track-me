const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    pushToken: {
        type: String,
        default: null,
    },
    name: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    level: {
        type: Number,
        default: 1,
    },
    title: {
        type: String,
        default: 'Novice Student',
    },
    goal: {
        type: String,
        default: 'Academics',
    },
    bio: {
        type: String,
        default: 'Dedicated to focused learning and growth.',
    },
    avatar: {
        type: String,
        default: 'avatar1', // Default avatar ID
    },
    totalFocusTime: {
        type: Number, // Total seconds
        default: 0,
    },
    totalSessions: {
        type: Number,
        default: 0,
    },
    totalFlowSessions: {
        type: Number,
        default: 0,
    },
    achievements: [
        {
            title: String,
            completed: Boolean,
            progress: Number,
            maxProgress: Number,
            iconType: String,
        }
    ],
    friends: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    friendRequests: [
        {
            from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
            date: { type: Date, default: Date.now }
        }
    ],
    reminders: [
        {
            id: { type: String, required: true },
            title: { type: String, required: true },
            time: { type: String, required: true }, // Format: "HH:mm"
            date: { type: String }, // Format: "YYYY-MM-DD" for one-time reminders
            enabled: { type: Boolean, default: true },
            repeatDaily: { type: Boolean, default: true }
        }
    ],


    joinDate: {

        type: Date,
        default: Date.now,
    },
    isFocusing: {
        type: Boolean,
        default: false,
    },
    lastNudges: [
        {
            from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: { type: Date, default: Date.now }
        }
    ]
});

// Hash password before saving
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', UserSchema);

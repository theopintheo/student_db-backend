const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../utils/constants');

const attendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    batch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch'
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    },
    date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: Object.values(ATTENDANCE_STATUS),
        required: true,
        default: 'absent'
    },
    checkInTime: Date,
    checkOutTime: Date,
    duration: Number, // in minutes
    remarks: String,
    isApproved: {
        type: Boolean,
        default: false
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    meta: {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Virtual for attendance label
attendanceSchema.virtual('statusLabel').get(function() {
    const labels = {
        'present': 'Present',
        'absent': 'Absent',
        'late': 'Late',
        'leave': 'On Leave'
    };
    return labels[this.status] || this.status;
});

// Virtual for date string
attendanceSchema.virtual('dateString').get(function() {
    return this.date.toISOString().split('T')[0];
});

// Virtual for day of week
attendanceSchema.virtual('dayOfWeek').get(function() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.date.getDay()];
});

// Pre-save middleware to calculate duration
attendanceSchema.pre('save', function(next) {
    if (this.checkInTime && this.checkOutTime) {
        const duration = (this.checkOutTime - this.checkInTime) / (1000 * 60); // Convert to minutes
        this.duration = Math.round(duration);
    }
    next();
});

// Method to approve attendance
attendanceSchema.methods.approve = function(approvedBy) {
    this.isApproved = true;
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.meta.updatedBy = approvedBy;
    this.meta.updatedAt = new Date();
    return this.save();
};

// Method to check if attendance is late
attendanceSchema.methods.isLate = function(expectedTime = '10:00') {
    if (this.status !== 'present' || !this.checkInTime) return false;
    
    const [expectedHour, expectedMinute] = expectedTime.split(':').map(Number);
    const expectedDate = new Date(this.date);
    expectedDate.setHours(expectedHour, expectedMinute, 0, 0);
    
    return this.checkInTime > expectedDate;
};

// Indexes for efficient querying
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ batch: 1, date: 1 });
attendanceSchema.index({ session: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ student: 1, batch: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
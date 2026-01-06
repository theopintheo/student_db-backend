const mongoose = require('mongoose');
const { SESSION_STATUS } = require('../utils/constants');

const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        unique: true,
        required: true
    },
    batch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    topic: {
        type: String,
        required: true
    },
    description: String,
    module: {
        moduleId: mongoose.Schema.Types.ObjectId,
        title: String,
        moduleNumber: Number
    },
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assistantInstructors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    classroom: String,
    status: {
        type: String,
        enum: Object.values(SESSION_STATUS),
        default: 'scheduled'
    },
    attendanceTaken: {
        type: Boolean,
        default: false
    },
    attendanceSummary: {
        totalStudents: Number,
        present: Number,
        absent: Number,
        late: Number,
        leave: Number,
        attendancePercentage: Number
    },
    resources: [{
        type: {
            type: String,
            enum: ['slide', 'video', 'document', 'link', 'code', 'other']
        },
        title: String,
        url: String,
        description: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    assignments: [{
        title: String,
        description: String,
        dueDate: Date,
        maxMarks: Number,
        submissionType: {
            type: String,
            enum: ['individual', 'group', 'optional'],
            default: 'individual'
        },
        attachments: [{
            filename: String,
            url: String,
            size: Number
        }]
    }],
    notes: String,
    recording: {
        url: String,
        duration: Number,
        uploadedAt: Date,
        uploadedBy: mongoose.Schema.Types.ObjectId
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

// Generate session ID before save
sessionSchema.pre('save', async function(next) {
    if (!this.sessionId) {
        const date = new Date(this.date);
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            `session_${dateStr}`,
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.sessionId = `SESS-${dateStr}-${String(counter.seq).padStart(4, '0')}`;
    }
    next();
});

// Virtual for session duration
sessionSchema.virtual('duration').get(function() {
    if (!this.startTime || !this.endTime) return null;
    
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    const start = new Date(this.date);
    start.setHours(startHour, startMinute, 0, 0);
    
    const end = new Date(this.date);
    end.setHours(endHour, endMinute, 0, 0);
    
    return (end - start) / (1000 * 60); // Duration in minutes
});

// Virtual for session date string
sessionSchema.virtual('dateString').get(function() {
    return this.date.toISOString().split('T')[0];
});

// Virtual for day of week
sessionSchema.virtual('dayOfWeek').get(function() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.date.getDay()];
});

// Method to update attendance summary
sessionSchema.methods.updateAttendanceSummary = async function() {
    const Attendance = mongoose.model('Attendance');
    
    const attendanceStats = await Attendance.aggregate([
        { $match: { session: this._id } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }}
    ]);
    
    const summary = {
        totalStudents: 0,
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        attendancePercentage: 0
    };
    
    attendanceStats.forEach(stat => {
        summary.totalStudents += stat.count;
        if (stat._id === 'present') summary.present = stat.count;
        if (stat._id === 'absent') summary.absent = stat.count;
        if (stat._id === 'late') summary.late = stat.count;
        if (stat._id === 'leave') summary.leave = stat.count;
    });
    
    const presentCount = summary.present + summary.late;
    summary.attendancePercentage = summary.totalStudents > 0 
        ? Math.round((presentCount / summary.totalStudents) * 100) 
        : 0;
    
    this.attendanceSummary = summary;
    this.attendanceTaken = summary.totalStudents > 0;
    
    return this.save();
};

// Method to mark session as completed
sessionSchema.methods.markAsCompleted = function() {
    this.status = 'completed';
    this.meta.updatedAt = new Date();
    return this.save();
};

// Method to add resource
sessionSchema.methods.addResource = function(resourceData, uploadedBy) {
    const resource = {
        ...resourceData,
        uploadedBy,
        uploadedAt: new Date()
    };
    
    this.resources.push(resource);
    return this.save();
};

// Method to add assignment
sessionSchema.methods.addAssignment = function(assignmentData) {
    this.assignments.push(assignmentData);
    return this.save();
};

// Indexes
sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ batch: 1, date: 1 });
sessionSchema.index({ course: 1 });
sessionSchema.index({ instructor: 1 });
sessionSchema.index({ date: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ 'meta.createdAt': -1 });

module.exports = mongoose.model('Session', sessionSchema);
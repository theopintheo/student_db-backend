const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    leadId: {
        type: String,
        unique: true,
        required: true
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        sparse: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    source: {
        type: String,
        enum: ['website', 'referral', 'walk_in', 'social_media', 'campaign', 'other'],
        default: 'website'
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'follow_up', 'qualified', 'converted', 'lost', 'not_interested'],
        default: 'new'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    interestedCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    }],
    primaryCourse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    },
    budget: {
        type: Number,
        min: 0
    },
    expectedJoining: Date,
    education: {
        qualification: String,
        stream: String,
        yearOfPassing: Number,
        percentage: Number
    },
    experience: {
        years: Number,
        field: String,
        currentCompany: String
    },
    communications: [{
        type: {
            type: String,
            enum: ['call', 'email', 'meeting', 'message', 'whatsapp'],
            required: true
        },
        subject: String,
        message: String,
        scheduledAt: Date,
        completedAt: Date,
        status: {
            type: String,
            enum: ['scheduled', 'completed', 'missed', 'cancelled'],
            default: 'scheduled'
        },
        outcome: String,
        notes: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    notes: String,
    convertedToStudent: {
        type: Boolean,
        default: false
    },
    convertedDate: Date,
    convertedStudentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
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

// Generate lead ID before save
leadSchema.pre('save', async function(next) {
    if (!this.leadId) {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            'leadId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.leadId = `LEAD${String(counter.seq).padStart(6, '0')}`;
    }
    next();
});

// Virtual for days since created
leadSchema.virtual('daysSinceCreated').get(function() {
    return Math.floor((Date.now() - this.meta.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to add communication
leadSchema.methods.addCommunication = function(communication) {
    this.communications.push(communication);
    return this.save();
};

// Method to convert to student
leadSchema.methods.convertToStudent = function(studentId) {
    this.convertedToStudent = true;
    this.convertedDate = new Date();
    this.convertedStudentId = studentId;
    this.status = 'converted';
    return this.save();
};

// Indexes
leadSchema.index({ phone: 1 }, { unique: true });
leadSchema.index({ email: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ 'meta.createdAt': -1 });

module.exports = mongoose.model('Lead', leadSchema);
const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    courseCode: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: ['technology', 'business', 'design', 'language', 'science', 'arts', 'health', 'other'],
        default: 'technology'
    },
    description: {
        type: String,
        required: true
    },
    shortDescription: {
        type: String,
        maxlength: 200
    },
    duration: {
        value: {
            type: Number,
            required: true,
            min: 1
        },
        unit: {
            type: String,
            enum: ['hours', 'days', 'weeks', 'months'],
            default: 'months'
        }
    },
    fees: {
        regular: {
            type: Number,
            required: true,
            min: 0
        },
        installment: {
            type: Number,
            min: 0
        },
        discount: {
            type: Number,
            min: 0,
            max: 100
        },
        scholarshipAvailable: {
            type: Boolean,
            default: false
        }
    },
    curriculum: [{
        moduleNumber: Number,
        title: {
            type: String,
            required: true
        },
        description: String,
        topics: [String],
        duration: String,
        resources: [{
            type: {
                type: String,
                enum: ['video', 'document', 'link', 'assignment', 'quiz']
            },
            title: String,
            url: String,
            duration: String
        }]
    }],
    prerequisites: [String],
    learningOutcomes: [String],
    targetAudience: [String],
    instructors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        enum: ['active', 'inactive', 'upcoming', 'discontinued'],
        default: 'active'
    },
    enrollmentStats: {
        totalEnrolled: {
            type: Number,
            default: 0
        },
        active: {
            type: Number,
            default: 0
        },
        completed: {
            type: Number,
            default: 0
        },
        dropout: {
            type: Number,
            default: 0
        }
    },
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        },
        reviews: [{
            student: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Student'
            },
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            comment: String,
            date: {
                type: Date,
                default: Date.now
            }
        }]
    },
    batches: [{
        batchId: {
            type: String,
            required: true
        },
        name: String,
        startDate: Date,
        endDate: Date,
        schedule: {
            days: [String],
            time: String,
            duration: String
        },
        maxStudents: Number,
        currentStudents: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
            default: 'upcoming'
        },
        instructor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        classroom: String
    }],
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

// Generate course code before save
courseSchema.pre('save', async function(next) {
    if (!this.courseCode) {
        const prefix = this.name.substring(0, 3).toUpperCase();
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            `${prefix}_course`,
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.courseCode = `${prefix}${String(counter.seq).padStart(4, '0')}`;
    }
    next();
});

// Virtual for available seats in all batches
courseSchema.virtual('availableSeats').get(function() {
    return this.batches.reduce((total, batch) => {
        if (batch.status === 'upcoming' || batch.status === 'ongoing') {
            return total + (batch.maxStudents - batch.currentStudents);
        }
        return total;
    }, 0);
});

// Virtual for next batch start date
courseSchema.virtual('nextBatchStartDate').get(function() {
    const upcomingBatches = this.batches
        .filter(batch => batch.status === 'upcoming' && batch.startDate)
        .sort((a, b) => a.startDate - b.startDate);
    
    return upcomingBatches.length > 0 ? upcomingBatches[0].startDate : null;
});

// Method to add batch
courseSchema.methods.addBatch = function(batchData) {
    if (!batchData.batchId) {
        const batchNumber = this.batches.length + 1;
        batchData.batchId = `${this.courseCode}-B${String(batchNumber).padStart(2, '0')}`;
    }
    
    this.batches.push(batchData);
    return this.save();
};

// Method to update enrollment stats
courseSchema.methods.updateEnrollmentStats = function() {
    const Course = mongoose.model('Course');
    const Enrollment = mongoose.model('Enrollment');
    
    return Enrollment.aggregate([
        { $match: { course: this._id } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }}
    ]).then(results => {
        const stats = {
            totalEnrolled: 0,
            active: 0,
            completed: 0,
            dropout: 0
        };
        
        results.forEach(result => {
            stats.totalEnrolled += result.count;
            if (result._id === 'active') stats.active = result.count;
            if (result._id === 'completed') stats.completed = result.count;
            if (result._id === 'dropped') stats.dropout = result.count;
        });
        
        this.enrollmentStats = stats;
        return this.save();
    });
};

// Indexes
courseSchema.index({ courseCode: 1 }, { unique: true });
courseSchema.index({ name: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ 'fees.regular': 1 });

module.exports = mongoose.model('Course', courseSchema);
const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
    enrollmentId: {
        type: String,
        unique: true,
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    batch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Batch'
    },
    enrollmentDate: {
        type: Date,
        default: Date.now
    },
    enrollmentType: {
        type: String,
        enum: ['regular', 'fast_track', 'weekend', 'online', 'corporate'],
        default: 'regular'
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'dropped', 'suspended', 'transferred'],
        default: 'pending'
    },
    startDate: Date,
    expectedCompletion: Date,
    actualCompletion: Date,
    fees: {
        total: {
            type: Number,
            required: true,
            min: 0
        },
        paid: {
            type: Number,
            default: 0,
            min: 0
        },
        pending: {
            type: Number,
            default: 0,
            min: 0
        },
        discount: {
            amount: Number,
            percentage: Number,
            reason: String
        },
        scholarship: {
            amount: Number,
            percentage: Number,
            type: String
        }
    },
    paymentPlan: [{
        installmentNumber: Number,
        dueDate: Date,
        amount: Number,
        status: {
            type: String,
            enum: ['pending', 'paid', 'overdue', 'waived'],
            default: 'pending'
        },
        paidAmount: Number,
        paidDate: Date,
        receipt: String
    }],
    progress: {
        percentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        completedModules: [{
            moduleId: mongoose.Schema.Types.ObjectId,
            completedAt: Date,
            score: Number
        }],
        assignments: [{
            assignmentId: mongoose.Schema.Types.ObjectId,
            status: String,
            submittedAt: Date,
            score: Number,
            feedback: String
        }],
        assessments: [{
            assessmentId: mongoose.Schema.Types.ObjectId,
            score: Number,
            totalScore: Number,
            date: Date,
            remarks: String
        }],
        lastAccessed: Date
    },
    attendance: [{
        date: Date,
        session: mongoose.Schema.Types.ObjectId,
        status: {
            type: String,
            enum: ['present', 'absent', 'late', 'leave'],
            default: 'absent'
        },
        remarks: String
    }],
    grades: {
        assignments: Number,
        assessments: Number,
        attendance: Number,
        finalExam: Number,
        total: Number,
        grade: String,
        remarks: String
    },
    certificate: {
        issued: Boolean,
        certificateId: String,
        issuedDate: Date,
        issuedBy: mongoose.Schema.Types.ObjectId,
        downloadUrl: String
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

// Generate enrollment ID before save
enrollmentSchema.pre('save', async function(next) {
    if (!this.enrollmentId) {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            'enrollmentId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.enrollmentId = `ENR${String(counter.seq).padStart(8, '0')}`;
    }
    
    // Calculate pending fees
    this.fees.pending = this.fees.total - this.fees.paid;
    
    // Calculate progress percentage
    if (this.progress && this.progress.completedModules) {
        const Course = mongoose.model('Course');
        const course = await Course.findById(this.course);
        if (course && course.curriculum) {
            const totalModules = course.curriculum.length;
            const completedModules = this.progress.completedModules.length;
            this.progress.percentage = totalModules > 0 
                ? Math.round((completedModules / totalModules) * 100) 
                : 0;
        }
    }
    
    next();
});

// Virtual for attendance percentage
enrollmentSchema.virtual('attendancePercentage').get(function() {
    if (!this.attendance || this.attendance.length === 0) return 0;
    
    const presentDays = this.attendance.filter(session => 
        session.status === 'present' || session.status === 'late'
    ).length;
    
    return Math.round((presentDays / this.attendance.length) * 100);
});

// Method to mark attendance
enrollmentSchema.methods.markAttendance = function(date, sessionId, status, remarks = '') {
    const attendanceRecord = {
        date,
        session: sessionId,
        status,
        remarks
    };
    
    // Check if attendance already marked for this session
    const existingIndex = this.attendance.findIndex(
        a => a.session.toString() === sessionId.toString() && 
        a.date.toDateString() === date.toDateString()
    );
    
    if (existingIndex >= 0) {
        this.attendance[existingIndex] = attendanceRecord;
    } else {
        this.attendance.push(attendanceRecord);
    }
    
    return this.save();
};

// Method to update payment
enrollmentSchema.methods.updatePayment = function(amount, installmentNumber = null) {
    this.fees.paid += amount;
    this.fees.pending = this.fees.total - this.fees.paid;
    
    if (installmentNumber !== null && this.paymentPlan[installmentNumber]) {
        const installment = this.paymentPlan[installmentNumber];
        installment.status = 'paid';
        installment.paidAmount = amount;
        installment.paidDate = new Date();
    }
    
    return this.save();
};

// Method to complete module
enrollmentSchema.methods.completeModule = function(moduleId, score = null) {
    const moduleCompletion = {
        moduleId,
        completedAt: new Date(),
        score
    };
    
    // Check if module already completed
    const existingIndex = this.progress.completedModules.findIndex(
        m => m.moduleId.toString() === moduleId.toString()
    );
    
    if (existingIndex >= 0) {
        this.progress.completedModules[existingIndex] = moduleCompletion;
    } else {
        this.progress.completedModules.push(moduleCompletion);
    }
    
    this.progress.lastAccessed = new Date();
    return this.save();
};

// Indexes
enrollmentSchema.index({ enrollmentId: 1 }, { unique: true });
enrollmentSchema.index({ student: 1 });
enrollmentSchema.index({ course: 1 });
enrollmentSchema.index({ batch: 1 });
enrollmentSchema.index({ status: 1 });
enrollmentSchema.index({ enrollmentDate: -1 });
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
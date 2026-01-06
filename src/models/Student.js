const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    studentId: {
        type: String,
        unique: true,
        required: true
    },
    personalDetails: {
        fullName: {
            type: String,
            required: true,
            trim: true
        },
        dateOfBirth: Date,
        gender: {
            type: String,
            enum: ['male', 'female', 'other']
        },
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true
        },
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: String
        },
        guardianDetails: {
            name: String,
            relation: {
                type: String,
                enum: ['father', 'mother', 'spouse', 'sibling', 'other']
            },
            phone: String,
            email: String,
            occupation: String
        },
        emergencyContact: {
            name: String,
            phone: String,
            relation: String
        },
        identification: {
            type: {
                type: String,
                enum: ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license']
            },
            number: String,
            document: String
        }
    },
    admissionDetails: {
        admissionDate: {
            type: Date,
            default: Date.now
        },
        admissionType: {
            type: String,
            enum: ['direct', 'lead_conversion', 'online', 'reference', 'corporate'],
            default: 'direct'
        },
        admissionCounselor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        leadSource: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lead'
        },
        referralStudent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student'
        },
        branch: String,
        remarks: String
    },
    academicBackground: {
        qualification: String,
        specialization: String,
        institute: String,
        university: String,
        yearOfPassing: Number,
        percentage: Number,
        marksheet: String
    },
    enrollments: [{
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
            enum: ['regular', 'fast_track', 'weekend', 'online'],
            default: 'regular'
        },
        status: {
            type: String,
            enum: ['active', 'completed', 'dropped', 'suspended', 'transferred'],
            default: 'active'
        },
        startDate: Date,
        expectedCompletion: Date,
        actualCompletion: Date,
        finalGrade: String,
        remarks: String,
        progress: {
            percentage: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            completedModules: Number,
            totalModules: Number,
            lastAccessed: Date
        }
    }],
    paymentPlan: {
        totalFees: {
            type: Number,
            required: true,
            min: 0
        },
        paidAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        pendingAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        paymentSchedule: [{
            installmentNumber: Number,
            dueDate: Date,
            amount: Number,
            status: {
                type: String,
                enum: ['pending', 'paid', 'overdue', 'waived', 'partial'],
                default: 'pending'
            },
            paidAmount: Number,
            paidDate: Date,
            receipt: String,
            remarks: String
        }],
        discount: {
            amount: Number,
            percentage: Number,
            reason: String,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        },
        scholarship: {
            amount: Number,
            percentage: Number,
            type: String,
            reason: String
        }
    },
    documents: [{
        name: String,
        type: {
            type: String,
            enum: ['photo', 'marksheet', 'id_proof', 'address_proof', 'certificate', 'other']
        },
        url: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        verified: {
            type: Boolean,
            default: false
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        remarks: String
    }],
    loginCredentials: {
        username: {
            type: String,
            unique: true,
            sparse: true
        },
        password: String,
        lastLogin: Date,
        isActive: {
            type: Boolean,
            default: true
        }
    },
    status: {
        type: String,
        enum: ['active', 'alumni', 'dropped', 'suspended', 'transferred', 'probation'],
        default: 'active'
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

// Generate student ID before save
studentSchema.pre('save', async function(next) {
    if (!this.studentId) {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            'studentId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.studentId = `STU${String(counter.seq).padStart(6, '0')}`;
    }
    
    // Calculate pending amount
    if (this.paymentPlan) {
        this.paymentPlan.pendingAmount = this.paymentPlan.totalFees - this.paymentPlan.paidAmount;
    }
    
    next();
});

// Virtual for age
studentSchema.virtual('age').get(function() {
    if (!this.personalDetails.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.personalDetails.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// Virtual for current enrollment
studentSchema.virtual('currentEnrollment').get(function() {
    return this.enrollments.find(enrollment => enrollment.status === 'active');
});

// Method to add enrollment
studentSchema.methods.addEnrollment = function(enrollmentData) {
    this.enrollments.push(enrollmentData);
    return this.save();
};

// Method to update payment
studentSchema.methods.updatePayment = function(amount, installmentNumber = null) {
    this.paymentPlan.paidAmount += amount;
    this.paymentPlan.pendingAmount = this.paymentPlan.totalFees - this.paymentPlan.paidAmount;
    
    if (installmentNumber !== null && this.paymentPlan.paymentSchedule[installmentNumber]) {
        const installment = this.paymentPlan.paymentSchedule[installmentNumber];
        installment.status = 'paid';
        installment.paidAmount = amount;
        installment.paidDate = new Date();
    }
    
    return this.save();
};

// Method to get fee summary
studentSchema.methods.getFeeSummary = function() {
    const totalFees = this.paymentPlan.totalFees || 0;
    const paidAmount = this.paymentPlan.paidAmount || 0;
    const pendingAmount = totalFees - paidAmount;
    const paidPercentage = totalFees > 0 ? (paidAmount / totalFees) * 100 : 0;
    
    return {
        totalFees,
        paidAmount,
        pendingAmount,
        paidPercentage: paidPercentage.toFixed(2),
        installments: this.paymentPlan.paymentSchedule || []
    };
};

// Indexes
studentSchema.index({ studentId: 1 }, { unique: true });
studentSchema.index({ 'personalDetails.phone': 1 }, { unique: true });
studentSchema.index({ 'personalDetails.email': 1 }, { sparse: true });
studentSchema.index({ 'enrollments.status': 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ 'admissionDetails.admissionDate': -1 });

module.exports = mongoose.model('Student', studentSchema);
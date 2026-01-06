const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    paymentId: {
        type: String,
        unique: true,
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    enrollment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Enrollment'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMode: {
        type: String,
        enum: ['cash', 'cheque', 'online', 'card', 'bank_transfer', 'upi', 'other'],
        required: true
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
        default: 'pending'
    },
    transactionDetails: {
        transactionId: String,
        bankName: String,
        chequeNumber: String,
        cardLastFour: String,
        upiId: String,
        bankReference: String,
        remarks: String
    },
    receiptNumber: {
        type: String,
        unique: true
    },
    installmentNumber: Number,
    paymentFor: {
        type: String,
        enum: ['tuition', 'registration', 'exam', 'certificate', 'library', 'other'],
        default: 'tuition'
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verificationDate: Date,
    refundDetails: {
        amount: Number,
        reason: String,
        approvedBy: mongoose.Schema.Types.ObjectId,
        refundDate: Date,
        refundMode: String,
        transactionId: String
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

// Generate payment ID and receipt number before save
paymentSchema.pre('save', async function(next) {
    if (!this.paymentId) {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            'paymentId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.paymentId = `PAY${String(counter.seq).padStart(8, '0')}`;
    }
    
    if (!this.receiptNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            `receipt_${year}${month}`,
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.receiptNumber = `RCPT${year}${month}${String(counter.seq).padStart(4, '0')}`;
    }
    
    next();
});

// Post-save middleware to update student and enrollment
paymentSchema.post('save', async function() {
    try {
        const Student = mongoose.model('Student');
        const Enrollment = mongoose.model('Enrollment');
        
        // Update student's payment plan
        await Student.findByIdAndUpdate(this.student, {
            $inc: { 'paymentPlan.paidAmount': this.amount },
            $set: { 
                'paymentPlan.pendingAmount': {
                    $subtract: ['$paymentPlan.totalFees', { $add: ['$paymentPlan.paidAmount', this.amount] }]
                }
            }
        });
        
        // Update enrollment fees if enrollment exists
        if (this.enrollment) {
            await Enrollment.findByIdAndUpdate(this.enrollment, {
                $inc: { 'fees.paid': this.amount },
                $set: { 'fees.pending': { $subtract: ['$fees.total', { $add: ['$fees.paid', this.amount] }] } }
            });
        }
    } catch (error) {
        console.error('Error updating related documents:', error);
    }
});

// Method to verify payment
paymentSchema.methods.verifyPayment = function(verifiedBy) {
    this.status = 'completed';
    this.verifiedBy = verifiedBy;
    this.verificationDate = new Date();
    return this.save();
};

// Method to generate receipt data
paymentSchema.methods.getReceiptData = async function() {
    const Student = mongoose.model('Student');
    const Enrollment = mongoose.model('Enrollment');
    const User = mongoose.model('User');
    
    const student = await Student.findById(this.student).select('studentId personalDetails.fullName');
    const enrollment = this.enrollment ? await Enrollment.findById(this.enrollment)
        .populate('course', 'name courseCode') : null;
    const receivedByUser = this.receivedBy ? await User.findById(this.receivedBy).select('fullName') : null;
    const verifiedByUser = this.verifiedBy ? await User.findById(this.verifiedBy).select('fullName') : null;
    
    return {
        paymentId: this.paymentId,
        receiptNumber: this.receiptNumber,
        paymentDate: this.paymentDate,
        amount: this.amount,
        paymentMode: this.paymentMode,
        status: this.status,
        student: {
            id: student.studentId,
            name: student.personalDetails.fullName
        },
        enrollment: enrollment ? {
            course: enrollment.course.name,
            courseCode: enrollment.course.courseCode
        } : null,
        receivedBy: receivedByUser ? receivedByUser.fullName : 'N/A',
        verifiedBy: verifiedByUser ? verifiedByUser.fullName : 'N/A',
        transactionDetails: this.transactionDetails
    };
};

// Indexes
paymentSchema.index({ paymentId: 1 }, { unique: true });
paymentSchema.index({ receiptNumber: 1 }, { unique: true });
paymentSchema.index({ student: 1 });
paymentSchema.index({ enrollment: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ 'transactionDetails.transactionId': 1 });

module.exports = mongoose.model('Payment', paymentSchema);
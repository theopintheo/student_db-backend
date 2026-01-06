const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); // Don't forget to add this import

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
        index: true // Keep only one index declaration
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true // Keep only one index declaration
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['admin', 'employee', 'counselor', 'trainer', 'student'],
        default: 'employee'
    },
    profile: {
        firstName: String,
        lastName: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        profileImage: String,
        bio: String,
        designation: String,
        department: String,
        joiningDate: Date
    },
    employeeDetails: {
        employeeId: {
            type: String,
            unique: true,
            sparse: true,
            index: true // Keep only one index declaration
        },
        salary: Number,
        reportingManager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        leaves: {
            total: { type: Number, default: 20 },
            taken: { type: Number, default: 0 },
            remaining: { type: Number, default: 20 }
        },
        workSchedule: {
            startTime: String,
            endTime: String,
            days: [String]
        }
    },
    permissions: [{
        module: {
            type: String,
            enum: [
                'dashboard', 
                'leads', 
                'students', 
                'courses', 
                'enrollments', // ADDED THIS
                'payments', 
                'attendance', 
                'content', 
                'users', 
                'reports'
            ]
        },
        canView: { type: Boolean, default: false },
        canCreate: { type: Boolean, default: false },
        canEdit: { type: Boolean, default: false },
        canDelete: { type: Boolean, default: false }
    }],
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    lastLogin: Date,
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    if (this.profile?.firstName && this.profile?.lastName) {
        return `${this.profile.firstName} ${this.profile.lastName}`;
    }
    return this.username;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Pre-save middleware for employee ID
userSchema.pre('save', async function(next) {
    if (this.role !== 'employee' && this.role !== 'admin') return next();
    if (this.employeeDetails?.employeeId) return next();
    
    // Only create employee details object if it doesn't exist
    if (!this.employeeDetails) {
        this.employeeDetails = {};
    }
    
    try {
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            'employeeId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.employeeDetails.employeeId = `EMP${String(counter.seq).padStart(5, '0')}`;
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    return resetToken;
};

// Method to get user data for dashboard
userSchema.methods.getDashboardData = function() {
    const user = this.toObject();
    
    delete user.password;
    delete user.passwordResetToken;
    delete user.passwordResetExpires;
    delete user.__v;
    
    return {
        ...user,
        fullName: this.fullName
    };
};

// REMOVE THESE DUPLICATE INDEX DECLARATIONS to fix warnings
// The indexes are already defined inline above with `index: true`
// userSchema.index({ email: 1 });
// userSchema.index({ username: 1 });
// userSchema.index({ 'employeeDetails.employeeId': 1 });
userSchema.index({ status: 1 }); // This one is fine since status doesn't have inline index

module.exports = mongoose.model('User', userSchema);
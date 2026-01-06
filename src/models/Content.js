const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['document', 'video', 'link', 'assignment', 'quiz', 'resource'],
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
    module: {
        moduleId: mongoose.Schema.Types.ObjectId,
        title: String,
        moduleNumber: Number
    },
    file: {
        filename: String,
        originalname: String,
        path: String,
        size: Number,
        mimetype: String,
        url: String
    },
    url: {
        type: String,
        trim: true
    },
    content: {
        type: String,
        trim: true
    },
    assignmentDetails: {
        dueDate: Date,
        maxMarks: Number,
        instructions: String,
        submissionType: {
            type: String,
            enum: ['file', 'text', 'both'],
            default: 'file'
        },
        allowedFormats: [String],
        maxFileSize: Number // in MB
    },
    quizDetails: {
        questions: [{
            question: String,
            options: [String],
            correctAnswer: Number,
            marks: Number
        }],
        timeLimit: Number, // in minutes
        passingScore: Number
    },
    access: {
        type: {
            type: String,
            enum: ['public', 'private', 'restricted'],
            default: 'restricted'
        },
        allowedUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        allowedStudents: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student'
        }],
        allowedBatches: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Batch'
        }]
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    metadata: {
        duration: String, // for videos
        pages: Number, // for documents
        format: String,
        language: String,
        tags: [String]
    },
    stats: {
        views: {
            type: Number,
            default: 0
        },
        downloads: {
            type: Number,
            default: 0
        },
        submissions: {
            type: Number,
            default: 0
        },
        avgScore: {
            type: Number,
            default: 0
        }
    },
    submissions: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student'
        },
        submittedAt: {
            type: Date,
            default: Date.now
        },
        file: {
            filename: String,
            path: String,
            size: Number
        },
        textSubmission: String,
        marks: Number,
        feedback: String,
        gradedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        gradedAt: Date,
        status: {
            type: String,
            enum: ['submitted', 'graded', 'late', 'rejected'],
            default: 'submitted'
        }
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

// Virtual for download URL
contentSchema.virtual('downloadUrl').get(function() {
    if (this.file && this.file.path) {
        return `/api/content/${this._id}/download`;
    }
    return null;
});

// Method to check if user can access content
contentSchema.methods.canAccess = function(userId, studentId = null) {
    // Admin and trainers can access all content
    // This check will be done at route level
    
    // Check access type
    if (this.access.type === 'public') {
        return true;
    }
    
    if (this.access.type === 'private') {
        // Check if user is in allowed users
        if (userId && this.access.allowedUsers.includes(userId)) {
            return true;
        }
        
        // Check if student is in allowed students
        if (studentId && this.access.allowedStudents.includes(studentId)) {
            return true;
        }
        
        return false;
    }
    
    // For restricted - check multiple conditions
    if (userId && this.access.allowedUsers.includes(userId)) {
        return true;
    }
    
    if (studentId && this.access.allowedStudents.includes(studentId)) {
        return true;
    }
    
    return false;
};

// Method to submit assignment
contentSchema.methods.submitAssignment = function(studentId, submissionData) {
    if (this.type !== 'assignment') {
        throw new Error('Only assignments can be submitted');
    }
    
    const existingSubmission = this.submissions.find(s => 
        s.student.toString() === studentId
    );
    
    const submission = {
        student: studentId,
        submittedAt: new Date(),
        ...submissionData,
        status: 'submitted'
    };
    
    // Check if late submission
    if (this.assignmentDetails.dueDate && submission.submittedAt > this.assignmentDetails.dueDate) {
        submission.status = 'late';
    }
    
    if (existingSubmission) {
        // Update existing submission
        Object.assign(existingSubmission, submission);
    } else {
        // Add new submission
        this.submissions.push(submission);
        this.stats.submissions += 1;
    }
    
    return this.save();
};

// Method to grade submission
contentSchema.methods.gradeSubmission = function(submissionId, marks, feedback, gradedBy) {
    const submission = this.submissions.id(submissionId);
    
    if (!submission) {
        throw new Error('Submission not found');
    }
    
    submission.marks = marks;
    submission.feedback = feedback;
    submission.gradedBy = gradedBy;
    submission.gradedAt = new Date();
    submission.status = 'graded';
    
    // Update average score
    const gradedSubmissions = this.submissions.filter(s => s.status === 'graded');
    const totalMarks = gradedSubmissions.reduce((sum, s) => sum + (s.marks || 0), 0);
    this.stats.avgScore = gradedSubmissions.length > 0 
        ? Math.round(totalMarks / gradedSubmissions.length) 
        : 0;
    
    return this.save();
};

// Indexes
contentSchema.index({ title: 1 });
contentSchema.index({ course: 1 });
contentSchema.index({ type: 1 });
contentSchema.index({ status: 1 });
contentSchema.index({ 'access.allowedStudents': 1 });
contentSchema.index({ 'meta.createdAt': -1 });

module.exports = mongoose.model('Content', contentSchema);
const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    batchId: {
        type: String,
        unique: true,
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
    startDate: {
        type: Date,
        required: true
    },
    endDate: Date,
    schedule: {
        days: [{
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }],
        time: String,
        duration: String,
        classroom: String
    },
    maxStudents: {
        type: Number,
        required: true,
        min: 1
    },
    currentStudents: {
        type: Number,
        default: 0,
        min: 0
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
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    students: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student'
        },
        enrollmentDate: Date,
        status: {
            type: String,
            enum: ['active', 'completed', 'dropped', 'transferred'],
            default: 'active'
        },
        attendancePercentage: Number,
        performance: String
    }],
    sessions: [{
        date: Date,
        topic: String,
        description: String,
        instructor: mongoose.Schema.Types.ObjectId,
        startTime: String,
        endTime: String,
        status: {
            type: String,
            enum: ['scheduled', 'completed', 'cancelled'],
            default: 'scheduled'
        },
        attendanceTaken: {
            type: Boolean,
            default: false
        },
        resources: [{
            type: {
                type: String,
                enum: ['slide', 'video', 'document', 'link']
            },
            title: String,
            url: String
        }],
        assignments: [{
            title: String,
            description: String,
            dueDate: Date,
            maxMarks: Number
        }]
    }],
    assignments: [{
        title: String,
        description: String,
        dueDate: Date,
        maxMarks: Number,
        submissions: [{
            student: mongoose.Schema.Types.ObjectId,
            submittedAt: Date,
            marks: Number,
            feedback: String,
            fileUrl: String
        }]
    }],
    assessments: [{
        title: String,
        type: {
            type: String,
            enum: ['quiz', 'exam', 'project', 'presentation']
        },
        date: Date,
        maxMarks: Number,
        results: [{
            student: mongoose.Schema.Types.ObjectId,
            marks: Number,
            remarks: String
        }]
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

// Generate batch ID before save
batchSchema.pre('save', async function(next) {
    if (!this.batchId) {
        const Course = mongoose.model('Course');
        const course = await Course.findById(this.course);
        const courseCode = course ? course.courseCode.substring(0, 3) : 'BAT';
        
        const Counter = mongoose.model('Counter');
        const counter = await Counter.findByIdAndUpdate(
            `${courseCode}_batch`,
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.batchId = `${courseCode}-B${String(counter.seq).padStart(3, '0')}`;
    }
    next();
});

// Virtual for available seats
batchSchema.virtual('availableSeats').get(function() {
    return this.maxStudents - this.currentStudents;
});

// Virtual for progress percentage
batchSchema.virtual('progressPercentage').get(function() {
    if (!this.startDate || !this.endDate) return 0;
    
    const totalDuration = this.endDate - this.startDate;
    const elapsedDuration = Date.now() - this.startDate;
    
    if (totalDuration <= 0) return 100;
    if (elapsedDuration <= 0) return 0;
    
    return Math.min(100, Math.round((elapsedDuration / totalDuration) * 100));
});

// Method to add student to batch
batchSchema.methods.addStudent = function(studentId) {
    if (this.currentStudents >= this.maxStudents) {
        throw new Error('Batch is full');
    }
    
    const existingStudent = this.students.find(s => s.student.toString() === studentId.toString());
    if (existingStudent) {
        throw new Error('Student already in batch');
    }
    
    this.students.push({
        student: studentId,
        enrollmentDate: new Date(),
        status: 'active'
    });
    
    this.currentStudents += 1;
    return this.save();
};

// Method to remove student from batch
batchSchema.methods.removeStudent = function(studentId) {
    const studentIndex = this.students.findIndex(s => s.student.toString() === studentId.toString());
    
    if (studentIndex === -1) {
        throw new Error('Student not found in batch');
    }
    
    this.students.splice(studentIndex, 1);
    this.currentStudents -= 1;
    return this.save();
};

// Method to add session
batchSchema.methods.addSession = function(sessionData) {
    this.sessions.push(sessionData);
    return this.save();
};

// Method to mark attendance for session
batchSchema.methods.markAttendance = function(sessionIndex, attendanceRecords) {
    if (sessionIndex < 0 || sessionIndex >= this.sessions.length) {
        throw new Error('Invalid session index');
    }
    
    const session = this.sessions[sessionIndex];
    session.attendanceTaken = true;
    
    // Update attendance in student records
    attendanceRecords.forEach(record => {
        const student = this.students.find(s => s.student.toString() === record.studentId);
        if (student) {
            // Update attendance percentage
            const totalSessions = this.sessions.filter(s => s.attendanceTaken).length;
            const attendedSessions = this.students.filter(s => 
                s.attendanceRecords && 
                s.attendanceRecords[record.studentId] === 'present'
            ).length;
            
            student.attendancePercentage = totalSessions > 0 
                ? Math.round((attendedSessions / totalSessions) * 100) 
                : 0;
        }
    });
    
    return this.save();
};

// Indexes
batchSchema.index({ batchId: 1 }, { unique: true });
batchSchema.index({ course: 1 });
batchSchema.index({ instructor: 1 });
batchSchema.index({ status: 1 });
batchSchema.index({ startDate: 1 });
batchSchema.index({ 'students.student': 1 });

module.exports = mongoose.model('Batch', batchSchema);
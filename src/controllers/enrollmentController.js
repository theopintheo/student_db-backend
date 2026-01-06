const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Batch = require('../models/Batch');
const Content = require('../models/Content');
const { ENROLLMENT_STATUS, ATTENDANCE_STATUS } = require('../utils/constants');

// @desc    Get all enrollments
// @route   GET /api/enrollments
// @access  Private
const getEnrollments = async (req, res) => {
    try {
        const {
            status,
            course,
            student,
            batch,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10,
            sortBy = 'enrollmentDate',
            sortOrder = 'desc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (status) query.status = status;
        if (course) query.course = course;
        if (student) query.student = student;
        if (batch) query.batch = batch;
        
        // Date range filter
        if (startDate || endDate) {
            query.enrollmentDate = {};
            if (startDate) query.enrollmentDate.$gte = new Date(startDate);
            if (endDate) query.enrollmentDate.$lte = new Date(endDate);
        }
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { enrollmentId: searchRegex },
                { 'grades.remarks': searchRegex }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [enrollments, total] = await Promise.all([
            Enrollment.find(query)
                .populate('student', 'studentId personalDetails.fullName personalDetails.phone')
                .populate('course', 'name courseCode')
                .populate('batch', 'batchId name')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Enrollment.countDocuments(query)
        ]);
        
        // Add virtual fields
        enrollments.forEach(enrollment => {
            enrollment.attendancePercentage = calculateAttendancePercentage(enrollment.attendance);
        });
        
        res.json({
            success: true,
            count: enrollments.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: enrollments
        });
    } catch (error) {
        console.error('Get enrollments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Helper function to calculate attendance percentage
const calculateAttendancePercentage = (attendance) => {
    if (!attendance || attendance.length === 0) return 0;
    
    const presentDays = attendance.filter(session => 
        session.status === 'present' || session.status === 'late'
    ).length;
    
    return Math.round((presentDays / attendance.length) * 100);
};

// @desc    Get single enrollment
// @route   GET /api/enrollments/:id
// @access  Private
const getEnrollmentById = async (req, res) => {
    try {
        const enrollment = await Enrollment.findById(req.params.id)
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('course', 'name courseCode description curriculum')
            .populate('batch', 'batchId name schedule instructor')
            .populate('progress.completedModules.moduleId')
            .populate('progress.assignments.assignmentId', 'title maxMarks')
            .populate('progress.assessments.assessmentId', 'title totalScore');
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        // Calculate attendance percentage
        enrollment.attendancePercentage = calculateAttendancePercentage(enrollment.attendance);
        
        res.json({
            success: true,
            data: enrollment
        });
    } catch (error) {
        console.error('Get enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new enrollment
// @route   POST /api/enrollments
// @access  Private
const createEnrollment = async (req, res) => {
    try {
        const enrollmentData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        // Check if student is already enrolled in the course
        const existingEnrollment = await Enrollment.findOne({
            student: enrollmentData.student,
            course: enrollmentData.course,
            status: { $in: ['pending', 'active'] }
        });
        
        if (existingEnrollment) {
            return res.status(400).json({
                success: false,
                message: 'Student is already enrolled or has a pending enrollment for this course'
            });
        }
        
        // If batch is provided, check availability
        if (enrollmentData.batch) {
            const batch = await Batch.findById(enrollmentData.batch);
            if (batch && batch.currentStudents >= batch.maxStudents) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected batch is full'
                });
            }
        }
        
        const enrollment = await Enrollment.create(enrollmentData);
        
        // Update student's enrollments
        await Student.findByIdAndUpdate(enrollmentData.student, {
            $push: { enrollments: enrollment._id }
        });
        
        // Update batch student count if batch is provided
        if (enrollmentData.batch) {
            await Batch.findByIdAndUpdate(enrollmentData.batch, {
                $inc: { currentStudents: 1 }
            });
        }
        
        // Update course enrollment stats
        await updateCourseEnrollmentStats(enrollmentData.course);
        
        // Populate for response
        const populatedEnrollment = await Enrollment.findById(enrollment._id)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('course', 'name courseCode')
            .populate('batch', 'batchId name');
        
        res.status(201).json({
            success: true,
            message: 'Enrollment created successfully',
            data: populatedEnrollment
        });
    } catch (error) {
        console.error('Create enrollment error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Enrollment ID already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Helper function to update course enrollment stats
const updateCourseEnrollmentStats = async (courseId) => {
    const Course = require('../models/Course');
    const Enrollment = require('../models/Enrollment');
    
    const stats = await Enrollment.aggregate([
        { $match: { course: courseId } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }}
    ]);
    
    const enrollmentStats = {
        totalEnrolled: 0,
        active: 0,
        completed: 0,
        dropout: 0
    };
    
    stats.forEach(stat => {
        enrollmentStats.totalEnrolled += stat.count;
        if (stat._id === 'active') enrollmentStats.active = stat.count;
        if (stat._id === 'completed') enrollmentStats.completed = stat.count;
        if (stat._id === 'dropped') enrollmentStats.dropout = stat.count;
    });
    
    await Course.findByIdAndUpdate(courseId, {
        enrollmentStats
    });
};

// @desc    Update enrollment
// @route   PUT /api/enrollments/:id
// @access  Private
const updateEnrollment = async (req, res) => {
    try {
        const enrollment = await Enrollment.findById(req.params.id);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        // Store old batch for updating counts
        const oldBatch = enrollment.batch;
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id' && key !== 'enrollmentId') {
                enrollment[key] = req.body[key];
            }
        });
        
        enrollment.meta.updatedBy = req.user.id;
        enrollment.meta.updatedAt = new Date();
        
        await enrollment.save();
        
        // Update batch counts if batch changed
        if (oldBatch && enrollment.batch && !oldBatch.equals(enrollment.batch)) {
            // Decrement old batch
            await Batch.findByIdAndUpdate(oldBatch, {
                $inc: { currentStudents: -1 }
            });
            
            // Increment new batch
            await Batch.findByIdAndUpdate(enrollment.batch, {
                $inc: { currentStudents: 1 }
            });
        }
        
        // Update course stats if status changed
        if (req.body.status) {
            await updateCourseEnrollmentStats(enrollment.course);
        }
        
        res.json({
            success: true,
            message: 'Enrollment updated successfully',
            data: enrollment
        });
    } catch (error) {
        console.error('Update enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete enrollment
// @route   DELETE /api/enrollments/:id
// @access  Private (Admin only)
const deleteEnrollment = async (req, res) => {
    try {
        const enrollment = await Enrollment.findById(req.params.id);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        // Remove from student's enrollments
        await Student.findByIdAndUpdate(enrollment.student, {
            $pull: { enrollments: enrollment._id }
        });
        
        // Update batch student count
        if (enrollment.batch) {
            await Batch.findByIdAndUpdate(enrollment.batch, {
                $inc: { currentStudents: -1 }
            });
        }
        
        // Update course stats
        await updateCourseEnrollmentStats(enrollment.course);
        
        await enrollment.deleteOne();
        
        res.json({
            success: true,
            message: 'Enrollment deleted successfully'
        });
    } catch (error) {
        console.error('Delete enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get enrollments for specific student
// @route   GET /api/enrollments/student/:studentId
// @access  Private
const getStudentEnrollments = async (req, res) => {
    try {
        const studentId = req.params.studentId;
        
        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        const enrollments = await Enrollment.find({ student: studentId })
            .populate('course', 'name courseCode description duration')
            .populate('batch', 'batchId name schedule')
            .sort({ enrollmentDate: -1 })
            .lean();
        
        // Calculate stats
        const totalEnrollments = enrollments.length;
        const activeEnrollments = enrollments.filter(e => e.status === 'active').length;
        const completedEnrollments = enrollments.filter(e => e.status === 'completed').length;
        
        enrollments.forEach(enrollment => {
            enrollment.attendancePercentage = calculateAttendancePercentage(enrollment.attendance);
        });
        
        res.json({
            success: true,
            data: {
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                },
                enrollments,
                stats: {
                    total: totalEnrollments,
                    active: activeEnrollments,
                    completed: completedEnrollments,
                    dropout: totalEnrollments - activeEnrollments - completedEnrollments
                }
            }
        });
    } catch (error) {
        console.error('Get student enrollments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get enrollments for specific course
// @route   GET /api/enrollments/course/:courseId
// @access  Private
const getCourseEnrollments = async (req, res) => {
    try {
        const courseId = req.params.courseId;
        
        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }
        
        const enrollments = await Enrollment.find({ course: courseId })
            .populate('student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('batch', 'batchId name')
            .sort({ enrollmentDate: -1 })
            .lean();
        
        enrollments.forEach(enrollment => {
            enrollment.attendancePercentage = calculateAttendancePercentage(enrollment.attendance);
        });
        
        res.json({
            success: true,
            data: {
                course: {
                    id: course.courseCode,
                    name: course.name,
                    duration: course.duration
                },
                enrollments,
                stats: {
                    total: enrollments.length,
                    byStatus: enrollments.reduce((acc, enrollment) => {
                        acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
                        return acc;
                    }, {})
                }
            }
        });
    } catch (error) {
        console.error('Get course enrollments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update enrollment progress
// @route   PUT /api/enrollments/:id/progress
// @access  Private (Admin/Trainer)
const updateProgress = async (req, res) => {
    try {
        const { moduleId, score } = req.body;
        
        const enrollment = await Enrollment.findById(req.params.id);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        await enrollment.completeModule(moduleId, score);
        
        res.json({
            success: true,
            message: 'Progress updated successfully',
            data: {
                progress: enrollment.progress.percentage,
                completedModules: enrollment.progress.completedModules.length
            }
        });
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Mark attendance for enrollment
// @route   POST /api/enrollments/:id/attendance
// @access  Private (Admin/Trainer)
const markAttendance = async (req, res) => {
    try {
        const { date, session, status, remarks } = req.body;
        
        const enrollment = await Enrollment.findById(req.params.id);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        await enrollment.markAttendance(new Date(date), session, status, remarks);
        
        res.json({
            success: true,
            message: 'Attendance marked successfully',
            data: {
                attendance: enrollment.attendance,
                attendancePercentage: calculateAttendancePercentage(enrollment.attendance)
            }
        });
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Submit assignment for enrollment
// @route   POST /api/enrollments/:id/assignments/:assignmentId/submit
// @access  Private
const submitAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { submission } = req.body;
        
        const enrollment = await Enrollment.findById(req.params.id);
        const content = await Content.findById(assignmentId);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        if (!content || content.type !== 'assignment') {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }
        
        // Submit assignment via content model
        await content.submitAssignment(enrollment.student, submission);
        
        // Update enrollment progress
        const assignmentProgress = {
            assignmentId,
            status: 'submitted',
            submittedAt: new Date(),
            score: null
        };
        
        const existingAssignment = enrollment.progress.assignments.find(a => 
            a.assignmentId.toString() === assignmentId
        );
        
        if (existingAssignment) {
            Object.assign(existingAssignment, assignmentProgress);
        } else {
            enrollment.progress.assignments.push(assignmentProgress);
        }
        
        await enrollment.save();
        
        res.json({
            success: true,
            message: 'Assignment submitted successfully',
            data: {
                assignmentId,
                submittedAt: new Date(),
                status: 'submitted'
            }
        });
    } catch (error) {
        console.error('Submit assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Grade assignment for enrollment
// @route   PUT /api/enrollments/:id/assignments/:assignmentId/grade
// @access  Private (Admin/Trainer)
const gradeAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { marks, feedback } = req.body;
        
        const enrollment = await Enrollment.findById(req.params.id);
        const content = await Content.findById(assignmentId);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        if (!content || content.type !== 'assignment') {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }
        
        // Find submission
        const submission = content.submissions.find(s => 
            s.student.toString() === enrollment.student.toString()
        );
        
        if (!submission) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }
        
        // Grade submission via content model
        await content.gradeSubmission(submission._id, marks, feedback, req.user.id);
        
        // Update enrollment progress
        const assignmentProgress = enrollment.progress.assignments.find(a => 
            a.assignmentId.toString() === assignmentId
        );
        
        if (assignmentProgress) {
            assignmentProgress.score = marks;
            assignmentProgress.status = 'graded';
        }
        
        await enrollment.save();
        
        res.json({
            success: true,
            message: 'Assignment graded successfully',
            data: {
                assignmentId,
                marks,
                feedback
            }
        });
    } catch (error) {
        console.error('Grade assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Generate certificate for enrollment
// @route   POST /api/enrollments/:id/certificate
// @access  Private (Admin/Trainer)
const generateCertificate = async (req, res) => {
    try {
        const enrollment = await Enrollment.findById(req.params.id)
            .populate('student', 'studentId personalDetails.fullName')
            .populate('course', 'name courseCode duration');
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        // Check if enrollment is completed
        if (enrollment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Certificate can only be generated for completed enrollments'
            });
        }
        
        // Check if certificate already issued
        if (enrollment.certificate.issued) {
            return res.status(400).json({
                success: false,
                message: 'Certificate already issued for this enrollment'
            });
        }
        
        // Generate certificate ID
        const certificateId = `CERT-${enrollment.enrollmentId}-${Date.now().toString().slice(-6)}`;
        
        // Update enrollment with certificate details
        enrollment.certificate = {
            issued: true,
            certificateId,
            issuedDate: new Date(),
            issuedBy: req.user.id,
            downloadUrl: `/api/enrollments/${enrollment._id}/certificate/download`
        };
        
        await enrollment.save();
        
        res.json({
            success: true,
            message: 'Certificate generated successfully',
            data: {
                certificateId,
                issuedDate: new Date(),
                student: {
                    name: enrollment.student.personalDetails.fullName,
                    id: enrollment.student.studentId
                },
                course: {
                    name: enrollment.course.name,
                    code: enrollment.course.courseCode
                },
                downloadUrl: enrollment.certificate.downloadUrl
            }
        });
    } catch (error) {
        console.error('Generate certificate error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get enrollment statistics
// @route   GET /api/enrollments/stats
// @access  Private (Admin/Trainer)
const getEnrollmentStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.enrollmentDate = {};
            if (startDate) dateFilter.enrollmentDate.$gte = new Date(startDate);
            if (endDate) dateFilter.enrollmentDate.$lte = new Date(endDate);
        }
        
        // Get total enrollments
        const totalEnrollments = await Enrollment.countDocuments(dateFilter);
        
        // Get enrollments by status
        const enrollmentsByStatus = await Enrollment.aggregate([
            { $match: dateFilter },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);
        
        // Get enrollments by month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const enrollmentsByMonth = await Enrollment.aggregate([
            {
                $match: {
                    ...dateFilter,
                    enrollmentDate: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$enrollmentDate' },
                        month: { $month: '$enrollmentDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            },
            {
                $limit: 6
            }
        ]);
        
        // Format monthly data
        const monthlyData = enrollmentsByMonth.map(item => ({
            month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
            count: item.count
        }));
        
        // Get today's enrollments
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaysEnrollments = await Enrollment.countDocuments({
            enrollmentDate: { $gte: today, $lt: tomorrow }
        });
        
        res.json({
            success: true,
            data: {
                totalEnrollments,
                todaysEnrollments,
                byStatus: enrollmentsByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                monthlyTrend: monthlyData
            }
        });
    } catch (error) {
        console.error('Get enrollment stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getEnrollments,
    getEnrollmentById,
    createEnrollment,
    updateEnrollment,
    deleteEnrollment,
    getStudentEnrollments,
    getCourseEnrollments,
    updateProgress,
    markAttendance,
    submitAssignment,
    gradeAssignment,
    generateCertificate,
    getEnrollmentStats
};
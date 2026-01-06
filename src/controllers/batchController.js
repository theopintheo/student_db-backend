const Batch = require('../models/Batch');
const Course = require('../models/Course');
const Student = require('../models/Student');
const User = require('../models/User');
const { BATCH_STATUS, ATTENDANCE_STATUS } = require('../utils/constants');

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private
const getBatches = async (req, res) => {
    try {
        const {
            course,
            instructor,
            status,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10,
            sortBy = 'startDate',
            sortOrder = 'asc'
        } = req.query;
        
        // Build query
        const query = {};
        
        if (course) query.course = course;
        if (instructor) query.instructor = instructor;
        if (status) query.status = status;
        
        // Date range filter
        if (startDate || endDate) {
            query.startDate = {};
            if (startDate) query.startDate.$gte = new Date(startDate);
            if (endDate) query.startDate.$lte = new Date(endDate);
        }
        
        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { batchId: searchRegex },
                { name: searchRegex },
                { description: searchRegex },
                { 'schedule.classroom': searchRegex }
            ];
        }
        
        // Sort
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        
        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [batches, total] = await Promise.all([
            Batch.find(query)
                .populate('course', 'name courseCode')
                .populate('instructor', 'username profile.firstName profile.lastName profile.designation')
                .populate('assistantInstructors', 'username profile.firstName profile.lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Batch.countDocuments(query)
        ]);
        
        // Add virtual fields
        batches.forEach(batch => {
            batch.availableSeats = batch.maxStudents - batch.currentStudents;
            batch.progressPercentage = calculateBatchProgress(batch);
        });
        
        res.json({
            success: true,
            count: batches.length,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            data: batches
        });
    } catch (error) {
        console.error('Get batches error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Helper function to calculate batch progress
const calculateBatchProgress = (batch) => {
    if (!batch.startDate || !batch.endDate) return 0;
    
    const totalDuration = batch.endDate - batch.startDate;
    const elapsedDuration = Date.now() - batch.startDate;
    
    if (totalDuration <= 0) return 100;
    if (elapsedDuration <= 0) return 0;
    
    return Math.min(100, Math.round((elapsedDuration / totalDuration) * 100));
};

// @desc    Get single batch
// @route   GET /api/batches/:id
// @access  Private
const getBatchById = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate('course', 'name courseCode description duration fees')
            .populate('instructor', 'username profile.firstName profile.lastName profile.designation profile.email profile.phone')
            .populate('assistantInstructors', 'username profile.firstName profile.lastName profile.designation')
            .populate('students.student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .populate('sessions.instructor', 'username profile.firstName profile.lastName');
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        // Add virtual fields
        batch.availableSeats = batch.maxStudents - batch.currentStudents;
        batch.progressPercentage = calculateBatchProgress(batch);
        
        res.json({
            success: true,
            data: batch
        });
    } catch (error) {
        console.error('Get batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Create new batch
// @route   POST /api/batches
// @access  Private (Admin/Trainer)
const createBatch = async (req, res) => {
    try {
        const batchData = {
            ...req.body,
            meta: {
                createdBy: req.user.id,
                updatedBy: req.user.id
            }
        };
        
        const batch = await Batch.create(batchData);
        
        // Add batch to course
        await Course.findByIdAndUpdate(batch.course, {
            $push: { batches: batch._id }
        });
        
        // Populate for response
        const populatedBatch = await Batch.findById(batch._id)
            .populate('course', 'name courseCode')
            .populate('instructor', 'username profile.firstName profile.lastName');
        
        res.status(201).json({
            success: true,
            message: 'Batch created successfully',
            data: populatedBatch
        });
    } catch (error) {
        console.error('Create batch error:', error);
        
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
                message: 'Batch ID already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Update batch
// @route   PUT /api/batches/:id
// @access  Private (Admin/Trainer)
const updateBatch = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        // Cannot update if batch is completed
        if (batch.status === 'completed' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot update completed batch'
            });
        }
        
        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'meta' && key !== '_id' && key !== 'batchId') {
                batch[key] = req.body[key];
            }
        });
        
        batch.meta.updatedBy = req.user.id;
        batch.meta.updatedAt = new Date();
        
        await batch.save();
        
        res.json({
            success: true,
            message: 'Batch updated successfully',
            data: batch
        });
    } catch (error) {
        console.error('Update batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Delete batch
// @route   DELETE /api/batches/:id
// @access  Private (Admin only)
const deleteBatch = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        // Cannot delete if batch has students
        if (batch.currentStudents > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete batch with enrolled students'
            });
        }
        
        // Remove batch from course
        await Course.findByIdAndUpdate(batch.course, {
            $pull: { batches: batch._id }
        });
        
        await batch.deleteOne();
        
        res.json({
            success: true,
            message: 'Batch deleted successfully'
        });
    } catch (error) {
        console.error('Delete batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Add student to batch
// @route   POST /api/batches/:id/students
// @access  Private (Admin/Trainer/Employee)
const addStudentToBatch = async (req, res) => {
    try {
        const { studentId } = req.body;
        
        const batch = await Batch.findById(req.params.id);
        const student = await Student.findById(studentId);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }
        
        // Check if batch is full
        if (batch.currentStudents >= batch.maxStudents) {
            return res.status(400).json({
                success: false,
                message: 'Batch is full'
            });
        }
        
        // Check if student already in batch
        const existingStudent = batch.students.find(s => 
            s.student.toString() === studentId
        );
        
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: 'Student already enrolled in this batch'
            });
        }
        
        // Add student to batch
        batch.students.push({
            student: studentId,
            enrollmentDate: new Date(),
            status: 'active'
        });
        
        batch.currentStudents += 1;
        batch.meta.updatedBy = req.user.id;
        batch.meta.updatedAt = new Date();
        
        await batch.save();
        
        res.json({
            success: true,
            message: 'Student added to batch successfully',
            data: {
                batchId: batch.batchId,
                student: {
                    id: student.studentId,
                    name: student.personalDetails.fullName
                }
            }
        });
    } catch (error) {
        console.error('Add student to batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Remove student from batch
// @route   DELETE /api/batches/:id/students/:studentId
// @access  Private (Admin/Trainer)
const removeStudentFromBatch = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        // Find student in batch
        const studentIndex = batch.students.findIndex(s => 
            s.student.toString() === req.params.studentId
        );
        
        if (studentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Student not found in this batch'
            });
        }
        
        // Remove student
        batch.students.splice(studentIndex, 1);
        batch.currentStudents = Math.max(0, batch.currentStudents - 1);
        batch.meta.updatedBy = req.user.id;
        batch.meta.updatedAt = new Date();
        
        await batch.save();
        
        res.json({
            success: true,
            message: 'Student removed from batch successfully'
        });
    } catch (error) {
        console.error('Remove student from batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Add session to batch
// @route   POST /api/batches/:id/sessions
// @access  Private (Admin/Trainer)
const addSession = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        const sessionData = {
            ...req.body,
            instructor: req.body.instructor || req.user.id,
            status: 'scheduled'
        };
        
        batch.sessions.push(sessionData);
        batch.meta.updatedBy = req.user.id;
        batch.meta.updatedAt = new Date();
        
        await batch.save();
        
        res.json({
            success: true,
            message: 'Session added successfully',
            data: batch.sessions
        });
    } catch (error) {
        console.error('Add session error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Mark attendance for session
// @route   POST /api/batches/:id/sessions/:sessionIndex/attendance
// @access  Private (Admin/Trainer)
const markAttendance = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        const sessionIndex = parseInt(req.params.sessionIndex);
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        if (sessionIndex < 0 || sessionIndex >= batch.sessions.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session index'
            });
        }
        
        const { attendance } = req.body;
        const session = batch.sessions[sessionIndex];
        
        // Mark session as completed
        session.status = 'completed';
        session.attendanceTaken = true;
        
        // Update attendance for each student
        attendance.forEach(record => {
            const student = batch.students.find(s => 
                s.student.toString() === record.studentId
            );
            
            if (student) {
                // Store attendance record (simplified)
                student.attendanceRecords = student.attendanceRecords || [];
                student.attendanceRecords.push({
                    session: session._id,
                    date: session.date,
                    status: record.status,
                    remarks: record.remarks
                });
                
                // Calculate attendance percentage
                const totalSessions = batch.sessions.filter(s => s.attendanceTaken).length;
                const attendedSessions = student.attendanceRecords.filter(r => 
                    r.status === 'present' || r.status === 'late'
                ).length;
                
                student.attendancePercentage = totalSessions > 0 
                    ? Math.round((attendedSessions / totalSessions) * 100) 
                    : 0;
            }
        });
        
        batch.meta.updatedBy = req.user.id;
        batch.meta.updatedAt = new Date();
        
        await batch.save();
        
        res.json({
            success: true,
            message: 'Attendance marked successfully',
            data: {
                session: session,
                updatedStudents: batch.students.length
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

// @desc    Get batch statistics
// @route   GET /api/batches/stats
// @access  Private (Admin/Trainer)
const getBatchStats = async (req, res) => {
    try {
        const stats = await Batch.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalStudents: { $sum: '$currentStudents' },
                    totalCapacity: { $sum: '$maxStudents' }
                }
            }
        ]);
        
        const totalBatches = await Batch.countDocuments();
        const totalStudents = await Batch.aggregate([
            { $group: { _id: null, total: { $sum: '$currentStudents' } } }
        ]);
        
        const upcomingBatches = await Batch.countDocuments({ 
            status: 'upcoming',
            startDate: { $gte: new Date() }
        });
        
        const ongoingBatches = await Batch.countDocuments({ status: 'ongoing' });
        
        res.json({
            success: true,
            data: {
                totalBatches,
                totalStudents: totalStudents.length > 0 ? totalStudents[0].total : 0,
                upcomingBatches,
                ongoingBatches,
                byStatus: stats.reduce((acc, curr) => {
                    acc[curr._id] = {
                        count: curr.count,
                        students: curr.totalStudents,
                        capacity: curr.totalCapacity,
                        utilization: curr.totalCapacity > 0 
                            ? Math.round((curr.totalStudents / curr.totalCapacity) * 100) 
                            : 0
                    };
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        console.error('Get batch stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get students in batch
// @route   GET /api/batches/:id/students
// @access  Private
const getBatchStudents = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate('students.student', 'studentId personalDetails.fullName personalDetails.email personalDetails.phone')
            .select('students batchId name');
        
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                batch: {
                    id: batch.batchId,
                    name: batch.name
                },
                students: batch.students
            }
        });
    } catch (error) {
        console.error('Get batch students error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Get upcoming batches
// @route   GET /api/batches/upcoming
// @access  Private
const getUpcomingBatches = async (req, res) => {
    try {
        const upcomingBatches = await Batch.find({
            status: 'upcoming',
            startDate: { $gte: new Date() }
        })
        .populate('course', 'name courseCode fees.regular')
        .populate('instructor', 'username profile.firstName profile.lastName')
        .sort({ startDate: 1 })
        .limit(10)
        .lean();
        
        upcomingBatches.forEach(batch => {
            batch.availableSeats = batch.maxStudents - batch.currentStudents;
        });
        
        res.json({
            success: true,
            count: upcomingBatches.length,
            data: upcomingBatches
        });
    } catch (error) {
        console.error('Get upcoming batches error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getBatches,
    getBatchById,
    createBatch,
    updateBatch,
    deleteBatch,
    addStudentToBatch,
    removeStudentFromBatch,
    addSession,
    markAttendance,
    getBatchStats,
    getBatchStudents,
    getUpcomingBatches
};